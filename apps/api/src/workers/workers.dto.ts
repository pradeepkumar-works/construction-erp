import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { STAFF_ATTENDANCE_STATUSES, WORKER_ID_TYPES, WORKER_SKILLS, type StaffAttendanceStatus, type WorkerIdType, type WorkerSkill } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = () => Matches(DATE_ONLY, { message: 'Use a YYYY-MM-DD date' });
const time = () => Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use a HH:mm time' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

export class CreateWorkerDto {
  @ApiProperty({ example: 'Ramesh Behera' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ example: 'Sudam Behera' }) @IsOptional() @trim() @IsString() @MaxLength(120) fatherName?: string | null;
  @ApiPropertyOptional({ example: '9437012345' }) @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiProperty({ example: 'Sri Jagannath Constructions', description: 'Labour contractor as on the head-count sheet, or "Departmental"' })
  @trim() @IsString() @IsNotEmpty() @MaxLength(120)
  contractor: string;
  @ApiProperty({ example: 'Mason' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) trade: string;
  @ApiPropertyOptional({ enum: WORKER_SKILLS, default: 'UNSKILLED' }) @IsOptional() @IsIn(WORKER_SKILLS as unknown as string[]) skill?: WorkerSkill;
  @ApiPropertyOptional({ enum: WORKER_ID_TYPES }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(WORKER_ID_TYPES as unknown as string[]) idType?: WorkerIdType | null;
  @ApiPropertyOptional({ description: 'For Aadhaar only the last four digits are stored' }) @IsOptional() @trim() @IsString() @MaxLength(40) idNumber?: string | null;
  @ApiPropertyOptional({ example: '750', description: "Defaults to the trade's labour rate when omitted" })
  @IsOptional() @num() @IsNumberString()
  dailyWage?: string;
  @ApiPropertyOptional({ example: '100', description: 'Per overtime hour; empty = daily wage / 8' })
  @IsOptional() @num() @ValidateIf((_, v) => v !== null && v !== '') @IsNumberString()
  otRate?: string | null;
  @ApiPropertyOptional({ description: 'The project they work at now' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() @dateOnly() joinedOn?: string | null;
}

export class UpdateWorkerDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(120) fatherName?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(120) contractor?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(60) trade?: string;
  @ApiPropertyOptional({ enum: WORKER_SKILLS }) @IsOptional() @IsIn(WORKER_SKILLS as unknown as string[]) skill?: WorkerSkill;
  @ApiPropertyOptional({ enum: WORKER_ID_TYPES }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(WORKER_ID_TYPES as unknown as string[]) idType?: WorkerIdType | null;
  @ApiPropertyOptional({ description: 'Send to replace; omit to keep the stored number' }) @IsOptional() @trim() @IsString() @MaxLength(40) idNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() dailyWage?: string;
  @ApiPropertyOptional() @IsOptional() @num() @ValidateIf((_, v) => v !== null && v !== '') @IsNumberString() otRate?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() @dateOnly() joinedOn?: string | null;
  @ApiPropertyOptional({ description: 'Last working day; setting it also takes them off the roll call after that day' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() @dateOnly()
  leftOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches number, name, father's name, phone, contractor and trade. */
export class ListWorkersQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) contractor?: string;
  @ApiPropertyOptional({ description: 'true: only active workers (default); false: only those who left' }) @IsOptional() @QueryBool() @IsBoolean() active?: boolean;
}

export class RollCallQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-15' }) @IsDateString() @dateOnly() date: string;
}

export class RollCallEntryDto {
  @ApiProperty() @IsUUID() workerId: string;
  @ApiProperty({ enum: STAFF_ATTENDANCE_STATUSES, nullable: true, description: 'null clears the mark' })
  @ValidateIf((_, v) => v !== null) @IsIn(STAFF_ATTENDANCE_STATUSES as unknown as string[])
  status: StaffAttendanceStatus | null;
  @ApiPropertyOptional({ example: '08:00' }) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @time() inTime?: string | null;
  @ApiPropertyOptional({ example: '19:00' }) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @time() outTime?: string | null;
  @ApiPropertyOptional({ example: 2, description: 'Overtime hours; computed from in and out (past 9 hours on site) when omitted' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(16)
  otHours?: number | null;
  @ApiPropertyOptional({ description: 'Activity of the project they worked on' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class SaveRollCallDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-15' }) @IsDateString() @dateOnly() date: string;
  @ApiProperty({ type: [RollCallEntryDto], description: 'Workers not listed keep their marks' })
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => RollCallEntryDto)
  entries: RollCallEntryDto[];
}

export class MusterQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10' }) @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' }) month: string;
}

export class OutputQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() @dateOnly() from: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString() @dateOnly() to: string;
}
