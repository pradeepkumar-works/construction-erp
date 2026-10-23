import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LAUNCHER_PIN_MAX, LAUNCHER_VISITS_KEPT, NAV_PIN_KINDS, NAV_VISIT_KINDS, type NavPinKind, type NavVisitKind } from '@erp/shared';

const POSITION = /^[0-9a-z]{1,40}$/;
/** An address inside the app: a path, optionally with a query. */
const APP_HREF = /^\/[\w\-/.?=&%:,+~]*$/;

export class CreatePinDto {
  @ApiProperty({ enum: NAV_PIN_KINDS }) @IsIn(NAV_PIN_KINDS as unknown as string[]) kind!: NavPinKind;
  @ApiProperty({ description: 'A node id of the navigation tree or a project id' }) @IsString() @MinLength(1) @MaxLength(80) target!: string;
  @ApiPropertyOptional({ description: 'Where it goes in Pinned (the last place when left out); Undo sends the old one back' })
  @IsOptional()
  @Matches(POSITION)
  position?: string;
}

export class MovePinDto {
  @ApiProperty({ description: 'The new position, from positionBetween() in @erp/shared' }) @Matches(POSITION) position!: string;
}

export class VisitDto {
  @ApiProperty({ enum: NAV_VISIT_KINDS }) @IsIn(NAV_VISIT_KINDS as unknown as string[]) kind!: NavVisitKind;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) target!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @ApiProperty() @Matches(APP_HREF) @MaxLength(300) href!: string;
}

class ImportPinDto {
  @IsIn(NAV_PIN_KINDS as unknown as string[]) kind!: NavPinKind;
  @IsString() @MinLength(1) @MaxLength(80) target!: string;
  @IsString() @MaxLength(120) label!: string;
}

class ImportVisitDto extends VisitDto {
  @IsInt() at!: number;
}

export class ImportDto {
  @ApiProperty({ type: [ImportPinDto] }) @IsArray() @ArrayMaxSize(LAUNCHER_PIN_MAX * 2) @ValidateNested({ each: true }) @Type(() => ImportPinDto) pins!: ImportPinDto[];
  @ApiProperty({ type: [ImportVisitDto] }) @IsArray() @ArrayMaxSize(LAUNCHER_VISITS_KEPT) @ValidateNested({ each: true }) @Type(() => ImportVisitDto) visits!: ImportVisitDto[];
}

export class LauncherFlagSetDto {
  @ApiPropertyOptional({ nullable: true, description: 'Show as New; null keeps the default from the navigation tree' }) @IsOptional() @IsBoolean() isNew?: boolean | null;
  @ApiPropertyOptional({ nullable: true, description: 'With isNew, the last day it shows as New (YYYY-MM-DD)' }) @IsOptional() @IsDateString({ strict: true }) newUntil?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Show as Featured; null keeps the default' }) @IsOptional() @IsBoolean() featured?: boolean | null;
}

export class HomeTilesSettingsDto {
  @ApiProperty({ description: 'Discover also shows modules a role cannot open, with Request access' }) @IsBoolean() discoverLocked!: boolean;
}

export class AccessRequestCreateDto {
  @ApiProperty({ description: 'A module of the navigation tree' }) @IsString() @MinLength(1) @MaxLength(80) nodeId!: string;
  @ApiPropertyOptional({ description: 'What they need it for' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AccessDecisionDto {
  @ApiProperty({ enum: ['GRANTED', 'DECLINED'] }) @IsIn(['GRANTED', 'DECLINED']) status!: 'GRANTED' | 'DECLINED';
  @ApiPropertyOptional({ description: 'A line for the person; needed to decline' }) @IsOptional() @IsString() @MaxLength(500) reply?: string;
}
