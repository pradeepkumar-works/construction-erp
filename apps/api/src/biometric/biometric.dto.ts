import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { BIOMETRIC_PROTOCOLS, BIOMETRIC_PUNCH_RESULTS, type BiometricProtocol, type BiometricPunchResult } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const SERIAL = /^[A-Za-z0-9-]{4,40}$/;

export class CreateDeviceDto {
  @ApiProperty({ example: 'Gate terminal' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the device, for example Gate terminal' }) @MaxLength(80) name: string;
  @ApiPropertyOptional({ example: 'ZKTeco K40' }) @IsOptional() @trim() @IsString() @MaxLength(80) model?: string | null;
  @ApiProperty({ enum: BIOMETRIC_PROTOCOLS }) @IsIn(BIOMETRIC_PROTOCOLS as unknown as string[]) protocol: BiometricProtocol;
  @ApiPropertyOptional({ example: 'CQZ7232460123', description: 'ADMS: the serial number on the device' })
  @IsOptional()
  @opt()
  @trim()
  @Matches(SERIAL, { message: 'The serial number is 4 to 40 letters and digits, as on the device' })
  serialNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: 330 }) @IsOptional() @IsInt() @Min(-720) @Max(840) utcOffsetMin?: number;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the device' }) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) model?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @trim() @Matches(SERIAL, { message: 'The serial number is 4 to 40 letters and digits, as on the device' }) serialNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-720) @Max(840) utcOffsetMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MatchUserDto {
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() employeeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() workerId?: string | null;
}

export class PunchQuery {
  @ApiPropertyOptional({ example: '2026-10-21' }) @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() deviceId?: string;
  @ApiPropertyOptional({ enum: BIOMETRIC_PUNCH_RESULTS }) @IsOptional() @IsIn(BIOMETRIC_PUNCH_RESULTS as unknown as string[]) result?: BiometricPunchResult;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) pin?: string;
}

export class ImportPunchesDto {
  @ApiProperty() @IsUUID() deviceId: string;
  @ApiProperty({ description: 'The punch file as text (CSV, tab or semicolon separated); the web turns Excel into CSV' })
  @IsString()
  @IsNotEmpty({ message: 'The file is empty' })
  @MaxLength(5_000_000, { message: 'The file is too large. Import a month at a time.' })
  text: string;
}

export class WebhookPunchDto {
  @ApiProperty({ example: '14', description: 'The user number on the device' }) @IsNotEmpty() pin: string | number;
  @ApiProperty({ example: '2026-10-21T09:02:11', description: 'Device clock, or with Z or an offset' }) @IsString() time: string;
}

export class WebhookPunchesDto {
  @ApiProperty({ type: [WebhookPunchDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WebhookPunchDto)
  punches: WebhookPunchDto[];
}

/** Put a user number on the ADMS devices (item 150): the name they show, and the devices (all of them when none are chosen). */
export class AddToDevicesDto {
  @ApiPropertyOptional({ example: 'Sneha Iyer', description: 'The name the device shows; the matched person’s name when empty' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  name?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) deviceIds?: string[];
}

export class RemoveFromDevicesDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) deviceIds?: string[];
}

export class CommandQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() deviceId?: string;
}
