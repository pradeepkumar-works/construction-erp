import { BadRequestException } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MAX_CHAINAGE_M, formatChainage, sectorLocation, type SectorFields } from '@erp/shared';
import type { PrismaService } from '../prisma/prisma.service';

const nullable = () => ValidateIf((_, v) => v !== null);
const toInt = () => Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));
const trimmed = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

/** Swagger + validation for the structured location fields on progress and measurement DTOs. */
export const ChainageField = (description: string) =>
  applyDecorators(ApiPropertyOptional({ description, type: Number, nullable: true }), IsOptional(), toInt(), nullable(), IsInt(), Min(0), Max(MAX_CHAINAGE_M));
export const FloorField = () => applyDecorators(ApiPropertyOptional({ description: "One of the project's floors", nullable: true }), IsOptional(), trimmed(), nullable(), IsString(), MaxLength(80));
export const VillageField = () => applyDecorators(ApiPropertyOptional({ description: "One of the project's villages", nullable: true }), IsOptional(), trimmed(), nullable(), IsString(), MaxLength(120));

type Input = Partial<SectorFields>;

/** Prisma `select` for the stored structured location. */
export const SECTOR_SELECT = { chainageFrom: true, chainageTo: true, floor: true, village: true } as const;

/**
 * Checks structured location against the project's sector settings and normalises it: chainage from ≤ to (a point
 * when only "from" is given), inside the project's range when it has one; floor and village from the project's lists
 * when it keeps them. `current` is the stored row on an update, so unchanged fields are checked as they will be saved.
 */
export async function resolveSector(prisma: PrismaService, projectId: string, input: Input, current?: SectorFields): Promise<Partial<SectorFields>> {
  const touched = (['chainageFrom', 'chainageTo', 'floor', 'village'] as const).some((k) => input[k] !== undefined);
  if (!touched) return {};
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { chainageStart: true, chainageEnd: true, floors: true, villages: true } });
  if (!project) return {};
  const pick = <K extends keyof SectorFields>(k: K): SectorFields[K] => (input[k] !== undefined ? (input[k] as SectorFields[K]) : (current?.[k] ?? null));
  let from = pick('chainageFrom');
  let to = pick('chainageTo');
  if (from === null && to !== null) throw new BadRequestException('Give the chainage it starts from');
  if (from !== null && to === null) to = from;
  if (from !== null && to !== null && to < from) [from, to] = [to, from];
  if (from !== null && to !== null) {
    const lo = project.chainageStart;
    const hi = project.chainageEnd;
    if ((lo !== null && from < lo) || (hi !== null && to > hi))
      throw new BadRequestException(`Chainage ${formatChainage(from)} to ${formatChainage(to)} is outside the project (${formatChainage(lo ?? 0)} to ${hi !== null ? formatChainage(hi) : 'end'})`);
  }
  const floor = pick('floor');
  if (floor && project.floors.length && !project.floors.includes(floor)) throw new BadRequestException(`"${floor}" is not one of the project's floors`);
  const village = pick('village');
  if (village && project.villages.length && !project.villages.includes(village)) throw new BadRequestException(`"${village}" is not one of the project's villages`);
  return { chainageFrom: from, chainageTo: to, floor: floor || null, village: village || null };
}

/** The typed location, or one made from the structured fields. */
export const locationOr = (typed: string | null | undefined, sector: Partial<SectorFields>) => (typed && typed.trim()) || sectorLocation(sector);
