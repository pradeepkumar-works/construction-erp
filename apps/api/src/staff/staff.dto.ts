import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { LEAVE_STATUSES, LEAVE_TYPES, LIST_SORT_FIELDS, STAFF_ATTENDANCE_STATUSES, type EmployeeSortField, type LeaveSortField, type LeaveStatus, type LeaveType, type StaffAttendanceStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);

/* ---------- employees ---------- */

export class CreateEmployeeDto {
  @ApiPropertyOptional({ example: 'EMP-014', description: 'Unique per organisation; the next EMP- number when left out' }) @IsOptional() @trim() @IsString() @MaxLength(30) employeeCode?: string;
  @ApiProperty({ example: 'Ramesh Behera' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @ApiProperty({ example: 'Site supervisor' }) @trim() @IsString() @IsNotEmpty() @MaxLength(80) designation: string;
  @ApiPropertyOptional({ example: 'Execution' }) @IsOptional() @trim() @IsString() @MaxLength(80) department?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional({ description: 'Their login, for self check-in and leave from the app' }) @IsOptional() @opt() @IsUUID() userId?: string | null;
  @ApiPropertyOptional({ description: 'Posting; null = head office' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: '2025-04-01' }) @IsOptional() @opt() @IsDateString() joinedOn?: string | null;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional({ description: 'Last working day; setting it makes them inactive' }) @IsOptional() @opt() @IsDateString() leftOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListEmployeesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Include people who have left' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.employees, default: 'employeeCode' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.employees as unknown as string[]) sortBy?: EmployeeSortField;
}

/* ---------- attendance ---------- */

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Site worked at today when not their posting' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Where the phone or browser is (v5 item 97), decimal degrees' }) @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ApiPropertyOptional({ description: 'How sure the position is, metres' }) @IsOptional() @IsNumber() @Min(0) @Max(100_000) accuracyM?: number;
}

export class RegisterQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
}

export class RegisterEntryDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiPropertyOptional({ enum: STAFF_ATTENDANCE_STATUSES, description: 'null clears the day' }) @opt() @IsIn(STAFF_ATTENDANCE_STATUSES as unknown as string[]) status: StaffAttendanceStatus | null;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @opt() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(16) overtimeHours?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class SaveRegisterDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
  @ApiProperty({ type: [RegisterEntryDto] }) @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => RegisterEntryDto) entries: RegisterEntryDto[];
}

export class AttendanceQuery {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString() to: string;
}

/* ---------- leave ---------- */

export class ApplyLeaveDto {
  @ApiPropertyOptional({ description: 'Staff admins apply for someone else; others apply for themselves' }) @IsOptional() @IsUUID() employeeId?: string;
  @ApiProperty({ enum: LEAVE_TYPES }) @IsIn(LEAVE_TYPES as unknown as string[]) type: LeaveType;
  @ApiProperty({ example: '2026-10-21' }) @IsDateString() fromDate: string;
  @ApiProperty({ example: '2026-10-22' }) @IsDateString() toDate: string;
  @ApiPropertyOptional({ default: false, description: 'A single half day (from and to the same day)' }) @IsOptional() @IsBoolean() halfDay?: boolean;
  @ApiProperty({ example: 'Family function' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

export class DecideLeaveDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}

export class RejectLeaveDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(500) note: string;
}

export class ListLeaveQuery extends PageQuery {
  @ApiPropertyOptional({ enum: LEAVE_STATUSES }) @IsOptional() @IsIn(LEAVE_STATUSES as unknown as string[]) status?: LeaveStatus;
  @ApiPropertyOptional({ enum: LEAVE_TYPES }) @IsOptional() @IsIn(LEAVE_TYPES as unknown as string[]) type?: LeaveType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ description: "Employees posted at this project" }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only requests waiting on the caller' }) @IsOptional() @QueryBool() @IsBoolean() toDecide?: boolean;
  @ApiPropertyOptional({ description: 'Leave covering this day (YYYY-MM-DD)' }) @IsOptional() @IsDateString() on?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.leave, default: 'fromDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.leave as unknown as string[]) sortBy?: LeaveSortField;
}

export class BalanceQuery {
  @ApiPropertyOptional({ description: "Defaults to the caller's own record" }) @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ example: 2026 }) @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

/* ---------- holidays ---------- */

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() date: string;
  @ApiProperty({ example: 'Dussehra' }) @trim() @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @ApiPropertyOptional({ description: 'One site only; null = every site' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
}

export class HolidayQuery {
  @ApiPropertyOptional({ example: 2026 }) @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @ApiPropertyOptional({ description: 'Holidays at this site (including those for every site)' }) @IsOptional() @IsUUID() projectId?: string;
}

export class UsersQuery {
  @ApiPropertyOptional({ description: 'Include the login already linked to this employee' }) @IsOptional() @IsUUID() employeeId?: string;
}

/* ---------- payroll inputs ---------- */

export class PayrollQuery {
  @ApiProperty({ example: '2026-10' }) @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' }) month: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
