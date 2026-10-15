import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { EQUIPMENT_DOC_TYPES, MAINTENANCE_KINDS, MAINTENANCE_STATUSES, type EquipmentDocType, type ExpiryState, type MaintenanceKind, type MaintenanceStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Accept numbers or numeric strings; keep them as strings for Decimal columns. */
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const nullable = () => ValidateIf((_, v) => v !== null);

/* ---------- job cards ---------- */

export class CreateJobDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty({ enum: MAINTENANCE_KINDS, description: 'SERVICE (scheduled) or BREAKDOWN (reported from site)' }) @IsIn(MAINTENANCE_KINDS as unknown as string[]) kind: MaintenanceKind;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: '2410.5', description: 'Hour meter / odometer when it stopped or came in' }) @IsOptional() @num() @nullable() @IsNumberString() meterReading?: string | null;
  @ApiProperty({ example: 'Hydraulic hose burst on the boom; machine stopped.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
  @ApiPropertyOptional({ description: 'Workshop or mechanic' }) @IsOptional() @trim() @IsString() @MaxLength(200) workshop?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateJobDto extends PartialType(OmitType(CreateJobDto, ['id', 'equipmentId'] as const)) {}

export class CloseJobDto {
  @ApiProperty({ example: '2026-10-15' }) @IsDateString() closedDate: string;
  @ApiProperty({ example: 'Hose replaced, hydraulic oil topped up 20 L.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) workDone: string;
  @ApiPropertyOptional({ example: '9', description: 'Working hours lost' }) @IsOptional() @num() @nullable() @IsNumberString() downtimeHours?: string | null;
  @ApiPropertyOptional({ example: '1500' }) @IsOptional() @num() @IsNumberString() labourCost?: string;
  @ApiPropertyOptional({ example: '3200', description: 'Parts bought outside; spares from the store are issued against the job' }) @IsOptional() @num() @IsNumberString() partsCost?: string;
  @ApiPropertyOptional({ description: 'Meter reading at the service (services reset the schedule from here)' }) @IsOptional() @num() @nullable() @IsNumberString() meterReading?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) workshop?: string | null;
}

export class SpareLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '2' }) @num() @IsNumberString() quantity: string;
}

export class IssueSparesDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
  @ApiProperty({ type: [SpareLineDto], description: "From the store of the project the machine is at; each quantity may not exceed its stock." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SpareLineDto)
  lines: SpareLineDto[];
}

/** `q` matches the job number, machine code and name, description, workshop and work done. */
export class ListJobsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: MAINTENANCE_KINDS }) @IsOptional() @IsIn(MAINTENANCE_KINDS as unknown as string[]) kind?: MaintenanceKind;
  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES }) @IsOptional() @IsIn(MAINTENANCE_STATUSES as unknown as string[]) status?: MaintenanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class SummaryQuery {
  @ApiPropertyOptional({ description: 'Machines deployed at this project only' }) @IsOptional() @IsUUID() projectId?: string;
}

/* ---------- documents ---------- */

export class CreateDocumentDto {
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty({ enum: EQUIPMENT_DOC_TYPES }) @IsIn(EQUIPMENT_DOC_TYPES as unknown as string[]) type: EquipmentDocType;
  @ApiPropertyOptional({ example: 'OG-26-2401-1801-00001234' }) @IsOptional() @trim() @IsString() @MaxLength(80) number?: string | null;
  @ApiPropertyOptional({ example: 'New India Assurance', description: 'Insurer, RTO or authority' }) @IsOptional() @trim() @IsString() @MaxLength(200) issuer?: string | null;
  @ApiPropertyOptional({ example: '2026-04-01' }) @IsOptional() @nullable() @IsDateString() validFrom?: string | null;
  @ApiProperty({ example: '2027-03-31' }) @IsDateString() validTo: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Scan of the paper' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateDocumentDto extends PartialType(OmitType(CreateDocumentDto, ['equipmentId'] as const)) {}

const EXPIRY_STATES: ExpiryState[] = ['VALID', 'EXPIRING', 'EXPIRED'];

/** `q` matches the machine code and name, number and issuer. */
export class ListDocumentsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ enum: EQUIPMENT_DOC_TYPES }) @IsOptional() @IsIn(EQUIPMENT_DOC_TYPES as unknown as string[]) type?: EquipmentDocType;
  @ApiPropertyOptional({ enum: EXPIRY_STATES, description: 'EXPIRING = within 30 days' }) @IsOptional() @IsIn(EXPIRY_STATES) state?: ExpiryState;
  @ApiPropertyOptional({ description: 'Only the latest paper of each type per machine (default true)' }) @IsOptional() @QueryBool() @IsBoolean() latestOnly?: boolean;
}

/* ---------- drivers ---------- */

export class CreateDriverDto {
  @ApiProperty({ example: 'Sukanta Behera' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ example: '9437012345' }) @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional({ example: 'OD0220190012345' }) @IsOptional() @trim() @IsString() @MaxLength(40) licenceNo?: string | null;
  @ApiPropertyOptional({ example: 'HMV' }) @IsOptional() @trim() @IsString() @MaxLength(40) licenceClass?: string | null;
  @ApiPropertyOptional({ example: '2029-08-12' }) @IsOptional() @nullable() @IsDateString() licenceValidTo?: string | null;
  @ApiPropertyOptional({ description: 'Machine or vehicle they drive' }) @IsOptional() @nullable() @IsUUID() equipmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches name, phone, licence number and machine code. */
export class ListDriversQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ description: 'Include drivers who left (default: active only)' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
}
