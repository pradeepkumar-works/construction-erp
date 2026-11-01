import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canManageBiometric, type BiometricCommandDto, type BiometricCommandKind } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { CLOCK_EVERY_HOURS, admsCommandLine, cleanPin, commandsToSend, devicePinProblem, deviceUserName, parseAdmsReplies, replyNote } from './biometric-rules';

type Command = Prisma.BiometricCommandGetPayload<{ include: { device: { select: { name: true } }; createdBy: { select: { fullName: true } } } }>;

interface AdmsDevice {
  id: string;
  organizationId: string;
  utcOffsetMin: number;
  createdById: string;
}

/**
 * Biometric device commands: HR puts a user number and its name on the company's ADMS devices or takes it off,
 * and sets a device's clock; each is a `BiometricCommand` handed to the device when it next asks (`GET /iclock/getrequest`)
 * and closed by its answer (`POST /iclock/devicecmd`). What goes over the wire is pure in `biometric-rules.ts`.
 */
@Injectable()
export class BiometricCommandsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertManage(user: RequestUser) {
    if (!canManageBiometric(user.roleKey)) throw new ForbiddenException('Only HR, management or an admin can manage biometric devices');
  }

  private toDto(c: Command): BiometricCommandDto {
    return {
      id: c.id,
      deviceId: c.deviceId,
      deviceName: c.device.name,
      kind: c.kind,
      pin: c.pin,
      name: c.name,
      status: c.status,
      attempts: c.attempts,
      createdAt: c.createdAt.toISOString(),
      createdByName: c.createdBy.fullName,
      sentAt: iso(c.sentAt),
      doneAt: iso(c.doneAt),
      note: c.note,
    };
  }

  /** Commands for one device or all, newest first. */
  async list(user: RequestUser, deviceId?: string): Promise<BiometricCommandDto[]> {
    this.assertManage(user);
    const rows = await this.prisma.biometricCommand.findMany({
      where: { organizationId: user.organizationId, ...(deviceId ? { deviceId } : {}) },
      include: { device: { select: { name: true } }, createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((c) => this.toDto(c));
  }

  /** Each command in its own transaction, numbered next on its device under a lock, so two at once never share a number. */
  private async queue(organizationId: string, deviceId: string, kind: BiometricCommandKind, by: string, pin: string | null = null, name: string | null = null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`biocmd:${deviceId}`}))`;
      // A user number added and then removed before the device called needs only the last word.
      if (pin) await tx.biometricCommand.updateMany({ where: { deviceId, pin, status: 'QUEUED', kind: { not: kind } }, data: { status: 'CANCELLED', note: 'Replaced by a later command' } });
      const same = await tx.biometricCommand.findFirst({ where: { deviceId, kind, pin, status: { in: ['QUEUED', 'SENT'] } }, select: { id: true } });
      if (same && kind !== 'ADD_USER') return null;
      if (same) {
        await tx.biometricCommand.update({ where: { id: same.id }, data: { name } });
        return null;
      }
      const last = await tx.biometricCommand.aggregate({ where: { deviceId }, _max: { cmdNo: true } });
      return tx.biometricCommand.create({ data: { organizationId, deviceId, cmdNo: (last._max.cmdNo ?? 0) + 1, kind, pin, name, createdById: by } });
    });
  }

  /** The active ADMS devices a command goes to: those chosen, else all of them. */
  private async targets(user: RequestUser, deviceIds?: string[]) {
    const devices = await this.prisma.biometricDevice.findMany({
      where: { organizationId: user.organizationId, protocol: 'ADMS', isActive: true, ...(deviceIds?.length ? { id: { in: deviceIds } } : {}) },
      select: { id: true, name: true },
    });
    if (!devices.length) throw new BadRequestException(deviceIds?.length ? 'Choose devices that send by themselves (ADMS) and are switched on' : 'No ADMS device is switched on. Register one in Devices first.');
    return devices;
  }

  /** Put a user number and its name on the devices, for the person to enrol a finger or face under it there. */
  async addUser(user: RequestUser, rawPin: string, dto: { name?: string | null; deviceIds?: string[] }) {
    this.assertManage(user);
    const pin = cleanPin(rawPin);
    const bad = devicePinProblem(pin);
    if (bad) throw new BadRequestException(bad);
    const map = await this.prisma.biometricUser.findFirst({
      where: { organizationId: user.organizationId, pin },
      include: { employee: { select: { fullName: true, isActive: true } }, worker: { select: { name: true, isActive: true } } },
    });
    const person = map?.employee ?? map?.worker ?? null;
    if (person && !person.isActive) throw new BadRequestException(`User number ${pin} is someone who has left. Remove it from the devices instead.`);
    const name = deviceUserName(dto.name?.trim() || (map?.employee?.fullName ?? map?.worker?.name ?? ''));
    if (!name) throw new BadRequestException('Type the name the device shows, or match the number to a person first');
    const devices = await this.targets(user, dto.deviceIds);
    let queued = 0;
    for (const d of devices) if (await this.queue(user.organizationId, d.id, 'ADD_USER', user.id, pin, name)) queued++;
    await this.audit.log(user, 'BIOMETRIC_USER', pin, 'UPDATED', `Sent to ${devices.map((d) => d.name).join(', ')} as ${name}`);
    return { pin, name, devices: devices.length, queued };
  }

  /** Take a user number off the devices, so the person can no longer punch on them. */
  async removeUser(user: RequestUser, rawPin: string, dto: { deviceIds?: string[] }) {
    this.assertManage(user);
    const pin = cleanPin(rawPin);
    const bad = devicePinProblem(pin);
    if (bad) throw new BadRequestException(bad);
    const devices = await this.targets(user, dto.deviceIds);
    let queued = 0;
    for (const d of devices) if (await this.queue(user.organizationId, d.id, 'REMOVE_USER', user.id, pin)) queued++;
    await this.audit.log(user, 'BIOMETRIC_USER', pin, 'UPDATED', `Removed from ${devices.map((d) => d.name).join(', ')}`);
    return { pin, devices: devices.length, queued };
  }

  /** Set a device's clock to the right time when it next calls. */
  async setClock(user: RequestUser, deviceId: string) {
    this.assertManage(user);
    const d = await this.prisma.biometricDevice.findFirst({ where: { id: deviceId, organizationId: user.organizationId }, select: { id: true, name: true, protocol: true } });
    if (!d) throw new NotFoundException('Device not found');
    if (d.protocol !== 'ADMS') throw new BadRequestException('Only a device that sends by itself (ADMS) takes commands; set this one’s clock on the device');
    const made = await this.queue(user.organizationId, d.id, 'SET_CLOCK', user.id);
    await this.audit.log(user, 'BIOMETRIC_DEVICE', d.id, 'UPDATED', 'Clock to be set');
    return { queued: made ? 1 : 0 };
  }

  /** Take back a command the device has not been handed yet. */
  async cancel(user: RequestUser, id: string) {
    this.assertManage(user);
    const c = await this.prisma.biometricCommand.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, status: true } });
    if (!c) throw new NotFoundException('Command not found');
    const done = await this.prisma.biometricCommand.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'CANCELLED', note: `Cancelled by ${user.fullName}` } });
    if (!done.count) throw new BadRequestException('The device has it already; it cannot be taken back');
    return { cancelled: true };
  }

  /** A device saying hello: its clock is set once a day, so a drifting clock never moves a punch to the wrong day. */
  async onHandshake(d: AdmsDevice) {
    const since = new Date(Date.now() - CLOCK_EVERY_HOURS * 3_600_000);
    const recent = await this.prisma.biometricCommand.findFirst({ where: { deviceId: d.id, kind: 'SET_CLOCK', createdAt: { gte: since }, status: { not: 'CANCELLED' } }, select: { id: true } });
    if (!recent) await this.queue(d.organizationId, d.id, 'SET_CLOCK', d.createdById);
  }

  /** The answer to `getrequest`: the commands due, a line each, or OK when there are none. */
  async handOut(d: AdmsDevice, now = new Date()): Promise<string> {
    const waiting = await this.prisma.biometricCommand.findMany({
      where: { deviceId: d.id, status: { in: ['QUEUED', 'SENT'] } },
      select: { id: true, cmdNo: true, kind: true, pin: true, name: true, status: true, attempts: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const plan = commandsToSend(
      waiting.map((w) => ({ ...w, status: w.status === 'SENT' ? 'SENT' : 'QUEUED' })),
      now,
    );
    if (plan.giveUp.length) await this.prisma.biometricCommand.updateMany({ where: { id: { in: plan.giveUp } }, data: { status: 'FAILED', note: 'The device never answered it. Check it is online, then send it again' } });
    if (!plan.send.length) return 'OK';
    await this.prisma.biometricCommand.updateMany({ where: { id: { in: plan.send } }, data: { status: 'SENT', sentAt: now, attempts: { increment: 1 } } });
    const byId = new Map(waiting.map((w) => [w.id, w]));
    return plan.send.map((id) => admsCommandLine(byId.get(id)!, now, d.utcOffsetMin)).join('\n') + '\n';
  }

  /** The device's answers to `devicecmd`: each closes its command, done or refused with its code. */
  async takeReplies(d: AdmsDevice, body: string) {
    const replies = parseAdmsReplies(body);
    const now = new Date();
    for (const r of replies) {
      await this.prisma.biometricCommand.updateMany({
        where: { deviceId: d.id, cmdNo: r.cmdNo, status: { in: ['SENT', 'QUEUED'] } },
        data: { status: r.code === 0 ? 'DONE' : 'FAILED', returnCode: r.code, doneAt: now, note: replyNote(r.code) },
      });
    }
    return replies.length;
  }
}
