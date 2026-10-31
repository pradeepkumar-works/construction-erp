import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { EMPLOYEE_EVENT_TYPES, EMPLOYMENT_TYPES, ESI_PATTERN, GENDERS, IFSC_PATTERN, PAN_PATTERN, RECORDABLE_EVENT_TYPES, UAN_PATTERN, type EmployeeEventType, type EmploymentType, type Gender, LEAVE_STATUSES, LEAVE_TYPES, LIST_SORT_FIELDS, STAFF_ATTENDANCE_STATUSES, type EmployeeSortField, type LeaveSortField, type LeaveStatus, type LeaveType, type StaffAttendanceStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

export class CreateEmployeeDto {
  @ApiPropertyOptional({ example: 'EMP-014', description: 'Unique per organisation; the next EMP- number when left out' }) @IsOptional() @trim() @IsString() @MaxLength(30) employeeCode?: string;
  @ApiProperty({ example: 'Ramesh Behera' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) fullName: string;
  @ApiProperty({ example: 'Site supervisor' }) @trim() @IsString() @IsNotEmpty() @MaxLength(80) designation: string;
  @ApiPropertyOptional({ example: 'Execution' }) @IsOptional() @trim() @IsString() @MaxLength(80) department?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional({ description: 'Their login, for self check-in and leave from the app' }) @IsOptional() @opt() @IsUUID() userId?: string | null;
  @ApiPropertyOptional({ description: 'Posting; null = head office' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional({ example: '2025-04-01' }) @IsOptional() @opt() @IsDateString() joinedOn?: string | null;

  /* HR records */
  @ApiPropertyOptional({ example: '1990-06-15' }) @IsOptional() @opt() @IsDateString() dateOfBirth?: string | null;
  @ApiPropertyOptional({ enum: GENDERS }) @IsOptional() @opt() @IsIn(GENDERS as unknown as string[]) gender?: Gender | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(120) fatherOrSpouseName?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsEmail({}, { message: 'Enter an email address like name@company.com' }) @MaxLength(160) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(400) address?: string | null;
  @ApiPropertyOptional({ example: 'B+' }) @IsOptional() @trim() @IsString() @MaxLength(5) bloodGroup?: string | null;
  @ApiPropertyOptional({ description: 'Who to call in an emergency, and how they are related' }) @IsOptional() @trim() @IsString() @MaxLength(120) emergencyContact?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) emergencyPhone?: string | null;
  @ApiPropertyOptional({ example: 'ABCDE1234F' }) @IsOptional() @upper() @opt() @Matches(PAN_PATTERN, { message: 'PAN is five letters, four digits and a letter, like ABCDE1234F' }) pan?: string | null;
  @ApiPropertyOptional({ example: '1234', description: 'Last four digits of the Aadhaar number only' }) @IsOptional() @trim() @opt() @Matches(/^\d{4}$/, { message: 'Enter only the last four digits of the Aadhaar number' }) aadhaarLast4?: string | null;
  @ApiPropertyOptional({ example: '100123456789' }) @IsOptional() @trim() @opt() @Matches(UAN_PATTERN, { message: 'UAN is the 12-digit number on the PF passbook' }) uan?: string | null;
  @ApiPropertyOptional({ example: 'OR/BBS/0012345/000/0000123' }) @IsOptional() @upper() @IsString() @MaxLength(40) pfNumber?: string | null;
  @ApiPropertyOptional({ example: '3112345678' }) @IsOptional() @trim() @opt() @Matches(ESI_PATTERN, { message: 'The ESI number is 10 digits (17 on older cards)' }) esiNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) bankName?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @Matches(/^\d{6,18}$/, { message: 'The account number is 6 to 18 digits' }) bankAccountNo?: string | null;
  @ApiPropertyOptional({ example: 'SBIN0001234' }) @IsOptional() @upper() @opt() @Matches(IFSC_PATTERN, { message: 'IFSC is four letters, a zero and six letters or digits, like SBIN0001234' }) bankIfsc?: string | null;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES }) @IsOptional() @opt() @IsIn(EMPLOYMENT_TYPES as unknown as string[]) employmentType?: EmploymentType | null;
  @ApiPropertyOptional({ example: 'M2' }) @IsOptional() @trim() @IsString() @MaxLength(20) grade?: string | null;
  @ApiPropertyOptional({ description: 'The employee they report to' }) @IsOptional() @opt() @IsUUID() reportingToId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() probationEndsOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() confirmedOn?: string | null;
  @ApiPropertyOptional({ example: 30 }) @IsOptional() @opt() @IsInt() @Min(0) @Max(180) noticeDays?: number | null;
  @ApiPropertyOptional({ example: 540000, description: 'Cost to company a year, rupees; later changes go through an increment' }) @IsOptional() @opt() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000) ctcAnnual?: number | null;
}

export class RecordEmployeeEventDto {
  @ApiProperty({ enum: RECORDABLE_EVENT_TYPES }) @IsIn(RECORDABLE_EVENT_TYPES as unknown as string[]) type: EmployeeEventType;
  @ApiProperty({ example: '2026-11-01', description: 'The day it takes effect; for an exit, the last working day' }) @IsDateString() effectiveDate: string;
  @ApiPropertyOptional({ description: 'Transfer: the new posting; null = head office' }) @IsOptional() @opt() @IsUUID() toProjectId?: string | null;
  @ApiPropertyOptional({ description: 'Promotion or transfer: the new designation' }) @IsOptional() @trim() @IsString() @MaxLength(80) toDesignation?: string | null;
  @ApiPropertyOptional({ description: 'Transfer or promotion: the new department' }) @IsOptional() @trim() @IsString() @MaxLength(80) toDepartment?: string | null;
  @ApiPropertyOptional({ example: 600000, description: 'Increment or promotion: the new cost to company a year' }) @IsOptional() @opt() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000) toCtc?: number | null;
  @ApiPropertyOptional({ description: 'Resignation: the day it was handed in' }) @IsOptional() @opt() @IsDateString() noticeGivenOn?: string | null;
  @ApiPropertyOptional({ description: 'The reason, the matter of a warning, or what the letter should say' }) @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class ListEmployeeEventsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ enum: EMPLOYEE_EVENT_TYPES }) @IsOptional() @IsIn(EMPLOYEE_EVENT_TYPES as unknown as string[]) type?: EmployeeEventType;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
}

export class EmployeeDocumentsDto {
  @ApiProperty({ type: [String], description: 'The complete list of the employee’s documents' }) @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) attachmentIds: string[];
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

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Site worked at today when not their posting' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Where the phone or browser is (v5 item 97), decimal degrees' }) @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ApiPropertyOptional({ description: 'How sure the position is, metres' }) @IsOptional() @IsNumber() @Min(0) @Max(100_000) accuracyM?: number;
  @ApiPropertyOptional({ description: 'Face attendance: their photo, uploaded by them through POST /uploads as they mark in' }) @IsOptional() @IsUUID() photoId?: string;
}

export class CheckOutDto {
  @ApiPropertyOptional({ description: 'Face attendance: their photo, uploaded by them through POST /uploads as they mark out' }) @IsOptional() @IsUUID() photoId?: string;
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

export class PayrollQuery {
  @ApiProperty({ example: '2026-10' }) @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' }) month: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
