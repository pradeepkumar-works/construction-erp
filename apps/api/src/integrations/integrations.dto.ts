import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CONNECTOR_BATCH_MAX, INTEGRATION_EVENT_STATUSES, INTEGRATION_KINDS, type IntegrationEventStatus, type IntegrationKind } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class CreateConnectionDto {
  @ApiProperty({ enum: INTEGRATION_KINDS }) @IsIn(INTEGRATION_KINDS as unknown as string[], { message: 'Choose what it connects to' }) kind: IntegrationKind;
  @ApiProperty({ example: 'Fleet trackers' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the connection, for example Fleet trackers' }) @MaxLength(80) name: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ description: 'The Connector that reads it, for a device on a site network' }) @IsOptional() @opt() @IsUUID() agentId?: string | null;
  @ApiPropertyOptional({ description: "The kind's own settings; never a password" }) @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'A key or password for the outside system; saved sealed, shown as its last four characters' })
  @IsOptional()
  @opt()
  @IsString()
  @MaxLength(2000)
  credential?: string | null;
}

export class UpdateConnectionDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the connection' }) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() agentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'A new key or password; an empty string removes the saved one' }) @IsOptional() @opt() @IsString() @MaxLength(2000) credential?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateAgentDto {
  @ApiProperty({ example: 'Site office PC' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the Connector, for example Site office PC' }) @MaxLength(80) name: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
}

export class MatchDeviceDto {
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() equipmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @trim() @IsString() @MaxLength(120) label?: string | null;
}

export class EventQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() connectionId?: string;
  @ApiPropertyOptional({ enum: INTEGRATION_EVENT_STATUSES }) @IsOptional() @IsIn(INTEGRATION_EVENT_STATUSES as unknown as string[]) status?: IntegrationEventStatus;
  @ApiPropertyOptional({ example: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class PairConnectorDto {
  @ApiProperty({ example: 'K7QM-3XPA' }) @IsString() @MaxLength(20) code: string;
  @ApiPropertyOptional({ example: 'SITE-PC-01' }) @IsOptional() @IsString() @MaxLength(120) hostname?: string;
  @ApiPropertyOptional({ example: '0.1.0' }) @IsOptional() @IsString() @MaxLength(40) version?: string;
}

export class ConnectorReadingsDto {
  @ApiProperty({ description: `Up to ${CONNECTOR_BATCH_MAX} readings: { id, connectionId, at, payload }; a reading sent again is counted once` })
  // Kept as sent: class-transformer would turn each reading into an Array (and its `at` into Array.prototype.at).
  @Transform(({ obj }) => (obj as { readings: unknown }).readings, { toClassOnly: true })
  @IsArray()
  @ArrayMaxSize(CONNECTOR_BATCH_MAX, { message: `Send up to ${CONNECTOR_BATCH_MAX} readings at a time` })
  readings: Record<string, unknown>[];
}
