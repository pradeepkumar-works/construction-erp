import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { VENDOR_ID_DOC } from '../vendors/vendors.dto';
import {
  EQUIPMENT_OWNERSHIPS,
  EQUIPMENT_RATE_UNITS,
  HIRE_FUEL_BY,
  LIST_SORT_FIELDS,
  SUBMISSION_STATUSES,
  type EquipmentOwnership,
  type EquipmentRateUnit,
  type HireFuelBy,
  type EquipmentSortField,
  type MachineryLogSortField,
  type SubmissionStatus,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Accept numbers or numeric strings; keep them as strings for Decimal columns. */
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/* ---------- equipment master ---------- */

export class CreateEquipmentDto {
  @ApiProperty({ example: 'EXC-01' }) @trim() @IsString() @IsNotEmpty() @MaxLength(30) code: string;
  @ApiProperty({ example: 'Excavator (Tata Hitachi EX200)' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ example: 'Earthmoving' }) @IsOptional() @trim() @IsString() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ enum: EQUIPMENT_OWNERSHIPS, default: 'OWNED' }) @IsOptional() @IsIn(EQUIPMENT_OWNERSHIPS as unknown as string[]) ownership?: EquipmentOwnership;
  @ApiPropertyOptional({ description: 'Hire agency for hired machines' }) @IsOptional() @trim() @IsString() @MaxLength(200) supplier?: string | null;
  @ApiPropertyOptional(VENDOR_ID_DOC) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ example: 'OD-02-AB-1234' }) @IsOptional() @trim() @IsString() @MaxLength(40) registrationNo?: string | null;
  @ApiPropertyOptional({ example: '1800', description: 'Hire rate (hired) or internal charge-out rate (owned)' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  rate?: string | null;
  @ApiPropertyOptional({ enum: EQUIPMENT_RATE_UNITS, default: 'HOUR' }) @IsOptional() @IsIn(EQUIPMENT_RATE_UNITS as unknown as string[]) rateUnit?: EquipmentRateUnit;
  @ApiPropertyOptional({ example: '200', description: 'Hire terms (v5 item 91): hours paid for a month even if it worked less; null = none' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  hireMinHours?: string | null;
  @ApiPropertyOptional({ enum: HIRE_FUEL_BY, description: 'Who fuels a hired machine; fuel we issue to one the owner fuels is recovered on its hire bill' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(HIRE_FUEL_BY as unknown as string[])
  hireFuelBy?: HireFuelBy | null;
  @ApiPropertyOptional({ description: "The owner's operator comes with the machine" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() hireOperator?: boolean | null;
  @ApiPropertyOptional({ description: 'Project it is deployed at now; null = yard / unassigned' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: '250', description: 'Service every so many working hours (from the daily logs); null = no hour schedule' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  serviceIntervalHours?: string | null;
  @ApiPropertyOptional({ example: 90, description: 'Service every so many days; null = no calendar schedule' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(3650)
  serviceIntervalDays?: number | null;
  @ApiPropertyOptional({ example: '2026-09-20', description: 'Last service before job cards were kept here; closing a service job card sets it' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  lastServiceDate?: string | null;
  @ApiPropertyOptional({ example: '2150' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() lastServiceMeter?: string | null;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches code, name, category, supplier and registration number. */
export class ListEquipmentQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Deployed at this project' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: EQUIPMENT_OWNERSHIPS }) @IsOptional() @IsIn(EQUIPMENT_OWNERSHIPS as unknown as string[]) ownership?: EquipmentOwnership;
  @ApiPropertyOptional({ description: 'Include inactive machines (default: active only)' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.equipment, default: 'code' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.equipment as unknown as string[]) sortBy?: EquipmentSortField;
}

/* ---------- daily logs ---------- */

export class CreateMachineryLogDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiProperty({ example: '7.5' }) @num() @IsNumberString() hoursWorked: string;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @num() @IsNumberString() idleHours?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @num() @IsNumberString() breakdownHours?: string;
  @ApiPropertyOptional({ example: '42' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() dieselLitres?: string | null;
  @ApiPropertyOptional({ example: '1520.5', description: 'Hour-meter / odometer at start of day' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() meterStart?: string | null;
  @ApiPropertyOptional({ example: '1528' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() meterEnd?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) operatorName?: string | null;
  @ApiPropertyOptional({ description: 'Activity the machine worked on' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional({ example: 'Excavation for drain Ch. 2+400 to 2+520' }) @IsOptional() @IsString() @MaxLength(500) workDone?: string | null;
  @ApiPropertyOptional({ description: 'Required when breakdown hours are entered' }) @IsOptional() @IsString() @MaxLength(500) breakdownNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  /** When true the log is created and immediately submitted for approval. */
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateMachineryLogDto extends PartialType(CreateMachineryLogDto) {}

/** `q` matches equipment code and name, operator, work done, project and submitter names. */
export class ListMachineryLogsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only logs with breakdown hours' }) @IsOptional() @QueryBool() @IsBoolean() breakdownOnly?: boolean;
  @ApiPropertyOptional({ description: 'Only logs created by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.machinery, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.machinery as unknown as string[]) sortBy?: MachineryLogSortField;
}
