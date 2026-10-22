import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public, ModuleSwitch } from '../common/decorators';
import { BiometricService } from './biometric.service';
import { CreateDeviceDto, ImportPunchesDto, MatchUserDto, PunchQuery, UpdateDeviceDto, WebhookPunchesDto } from './biometric.dto';

/** Biometric attendance (v6 item 101): devices, the user numbers on them, punches, punch files, and the webhook. */
@ApiTags('biometric')
@ApiBearerAuth()
@ModuleSwitch('biometric')
@Controller('biometric')
export class BiometricController {
  constructor(private bio: BiometricService) {}

  @ApiOperation({ summary: 'Registered devices with when each was last heard from and its punches today' })
  @Get('devices')
  devices(@CurrentUser() user: RequestUser) {
    return this.bio.devices(user);
  }

  @Post('devices')
  createDevice(@CurrentUser() user: RequestUser, @Body() dto: CreateDeviceDto) {
    return this.bio.createDevice(user, dto);
  }

  @Patch('devices/:id')
  updateDevice(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.bio.updateDevice(user, id, dto);
  }

  @ApiOperation({ summary: 'A new key for a webhook device (the old one stops working)' })
  @Post('devices/:id/new-key')
  newKey(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.bio.newKey(user, id);
  }

  @Delete('devices/:id')
  removeDevice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.bio.removeDevice(user, id);
  }

  @ApiOperation({ summary: 'User numbers seen on the devices or matched, with who each is' })
  @Get('users')
  users(@CurrentUser() user: RequestUser) {
    return this.bio.users(user);
  }

  @ApiOperation({ summary: 'Match a user number to an employee or a worker (both empty clears it); its recent punches mark attendance' })
  @Put('users/:pin')
  matchUser(@CurrentUser() user: RequestUser, @Param('pin') pin: string, @Body() dto: MatchUserDto) {
    return this.bio.matchUser(user, pin, dto);
  }

  @ApiOperation({ summary: 'Match unmatched user numbers that read as an employee code number (EMP-014 is 14) or a worker number' })
  @Post('users/match-by-code')
  matchByCode(@CurrentUser() user: RequestUser) {
    return this.bio.matchByCode(user);
  }

  @ApiOperation({ summary: "A day's punches (today unless a date is given), newest first" })
  @Get('punches')
  punches(@CurrentUser() user: RequestUser, @Query() q: PunchQuery) {
    return this.bio.punches(user, q);
  }

  @ApiOperation({ summary: 'Import a punch file exported from the device or its software' })
  @Post('import')
  importFile(@CurrentUser() user: RequestUser, @Body() dto: ImportPunchesDto) {
    return this.bio.importFile(user, dto);
  }

  @ApiOperation({ summary: 'Punches from a webhook device: JSON { punches: [{ pin, time }] } with the device key in X-Device-Key' })
  @Public()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Headers('x-device-key') key: string | undefined, @Body() dto: WebhookPunchesDto) {
    return this.bio.webhook(key, dto);
  }
}

/**
 * The ADMS (iclock) push protocol of ZKTeco, eSSL and similar devices, at /iclock (outside /api, where the devices look).
 * The device is known by its serial number; it must be registered and switched on, else it is refused and tries later.
 */
@ApiTags('biometric')
@Public()
@Controller('iclock')
export class IclockController {
  constructor(private bio: BiometricService) {}

  @ApiOperation({ summary: 'ADMS handshake: the device asks for its options' })
  @Get('cdata')
  @Header('Content-Type', 'text/plain')
  async options(@Query('SN') sn: string) {
    await this.bio.admsDevice(sn);
    return [
      `GET OPTION FROM: ${sn}`,
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      'Realtime=1',
      'Encrypt=None',
      '',
    ].join('\n');
  }

  @ApiOperation({ summary: 'ADMS upload: the ATTLOG table is read as punches; other tables are acknowledged' })
  @Post('cdata')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async upload(@Query('SN') sn: string, @Query('table') table: string, @Req() req: RawBodyRequest<Request>) {
    const d = await this.bio.admsDevice(sn);
    if (table !== 'ATTLOG') return 'OK';
    // The bytes as sent: some devices label the table as a form, which the form parser would take apart.
    const body = req.rawBody ? req.rawBody.toString('utf8') : typeof req.body === 'string' ? req.body : '';
    const r = await this.bio.admsAttlog(d, body);
    return `OK: ${r.received}`;
  }

  @ApiOperation({ summary: 'ADMS: the device asks for commands; there are none' })
  @Get('getrequest')
  @Header('Content-Type', 'text/plain')
  async getRequest(@Query('SN') sn: string) {
    await this.bio.admsDevice(sn);
    return 'OK';
  }

  @Post('devicecmd')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async deviceCmd(@Query('SN') sn: string) {
    await this.bio.admsDevice(sn);
    return 'OK';
  }
}
