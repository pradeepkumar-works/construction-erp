import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import {
  LIST_SORT_FIELDS,
  NCR_SEVERITIES,
  NCR_STATUSES,
  TEST_KINDS,
  TEST_RESULTS,
  type NcrSeverity,
  type NcrSortField,
  type NcrStatus,
  type QualityTestSortField,
  type TestKind,
  type TestResult,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** An empty string clears a number. */
const num = () => Transform(({ value }) => (value === '' ? null : typeof value === 'number' ? String(value) : value));

export class TestReadingInputDto {
  @ApiPropertyOptional({ description: 'An existing reading; omitted = a new one' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ example: '28 days' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) label: string;
  @ApiPropertyOptional({ example: '2026-11-11' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueOn?: string | null;
  @ApiPropertyOptional({ example: '27.4', description: 'The value tested (for cubes, the average of the set)' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() value?: string | null;
  @ApiPropertyOptional({ description: 'Defaults to today when a value is given' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() testedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) remarks?: string | null;
}

export class RecordReadingDto {
  @ApiPropertyOptional({ example: '27.4', description: 'Empty clears it' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() value?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() testedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) remarks?: string | null;
}

export class CreateTestDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiProperty({ enum: TEST_KINDS }) @IsIn(TEST_KINDS as unknown as string[]) kind: TestKind;
  @ApiProperty({ example: 'M25 cubes, GF slab bays 1 to 4' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional({ example: 'Km 14+200 LHS' }) @IsOptional() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiProperty({ example: '2026-10-14', description: 'The day the sample was taken' }) @IsDateString() sampledOn: string;
  @ApiPropertyOptional({ example: 'Not less than 25 N/mm² at 28 days' }) @IsOptional() @trim() @IsString() @MaxLength(300) specification?: string | null;
  @ApiPropertyOptional({ example: 'N/mm²', description: "Defaults to the kind's usual unit" }) @IsOptional() @trim() @IsString() @MaxLength(30) unit?: string | null;
  @ApiPropertyOptional({ example: '25', description: 'The lowest value that passes' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() specMin?: string | null;
  @ApiPropertyOptional({ description: 'The highest value that passes' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() specMax?: string | null;
  @ApiPropertyOptional({ type: [TestReadingInputDto], description: "Omitted = the kind's usual readings (cubes: 7 and 28 days)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TestReadingInputDto)
  readings?: TestReadingInputDto[];
  @ApiPropertyOptional({ enum: TEST_RESULTS, description: 'Only without a specification: the result as judged by the tester' })
  @IsOptional()
  @IsIn(TEST_RESULTS as unknown as string[])
  result?: TestResult;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ type: [String], description: "Pipe lengths the test covers, from the project's pipe network; when given, the complete list" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  segmentIds?: string[];
  @ApiPropertyOptional({ example: 'CUBE', description: "The test type it is taken as; counts it under the project's quality plan" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @trim()
  @IsString()
  @MaxLength(30)
  testTypeCode?: string | null;
  @ApiPropertyOptional({ description: 'The quality plan line it counts under; omitted = the only line of its type (or of its grade)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  planLineId?: string | null;
  @ApiPropertyOptional({ description: 'Cubes taken at a pour of the same project' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() pourId?: string | null;
  @ApiPropertyOptional({ description: 'The lab the sample went to' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() labId?: string | null;
  @ApiPropertyOptional({ example: '2026-10-21', description: 'The day the sample went to the lab' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() sentOn?: string | null;
  @ApiPropertyOptional({ example: 'KTL/2026/4471' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) labReportNo?: string | null;
  @ApiPropertyOptional({ example: '2026-11-19', description: "The day of the lab's report" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() reportOn?: string | null;
  @ApiPropertyOptional({ example: '1800.00', description: "The lab's charge for the sample" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() labCharge?: string | null;
  @ApiPropertyOptional({ description: 'The instrument it was tested on, from the calibration register' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() instrumentId?: string | null;
}

/** `readings`, when given, is the complete list: readings left out are removed. */
export class UpdateTestDto extends PartialType(OmitType(CreateTestDto, ['id', 'projectId'] as const)) {}

export class ListTestsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: TEST_KINDS }) @IsOptional() @IsIn(TEST_KINDS as unknown as string[]) kind?: TestKind;
  @ApiPropertyOptional({ enum: TEST_RESULTS }) @IsOptional() @IsIn(TEST_RESULTS as unknown as string[]) result?: TestResult;
  @ApiPropertyOptional({ description: 'Only tests with a reading due before today and not recorded' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.qualityTests, default: 'sampledOn' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.qualityTests as unknown as string[]) sortBy?: QualityTestSortField;
}

export class CreateNcrDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Honeycombing in column C4' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty({ description: 'What is wrong and against which requirement' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) description: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ enum: NCR_SEVERITIES, default: 'MINOR' }) @IsOptional() @IsIn(NCR_SEVERITIES as unknown as string[]) severity?: NcrSeverity;
  @ApiPropertyOptional({ description: 'Defaults to today' }) @IsOptional() @IsDateString() raisedOn?: string;
  @ApiPropertyOptional({ description: 'Who is to rectify it (a user with access to the project)' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() actionById?: string | null;
  @ApiPropertyOptional({ example: '2026-10-21', description: 'Rectify by' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional({ description: 'The inspection that found it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() inspectionId?: string | null;
  @ApiPropertyOptional({ description: 'The test that failed' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() qualityTestId?: string | null;
  @ApiPropertyOptional({ example: 'workmanship', description: 'An NCR category (Masters › NCR categories), by code' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ example: 'supervision', description: 'A root cause (Masters › NCR root causes), by code' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) rootCause?: string | null;
  @ApiPropertyOptional({ description: "Raised by the client's engineer or the third-party inspector" }) @IsOptional() @IsBoolean() raisedByClient?: boolean;
  @ApiPropertyOptional({ example: '42000.00', description: 'What putting it right cost' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() reworkCost?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateNcrDto extends PartialType(OmitType(CreateNcrDto, ['id', 'projectId'] as const)) {}

export class NcrActionDto {
  @ApiProperty({ description: 'Why it happened' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) cause: string;
  @ApiProperty({ description: 'What was done to put it right' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) correctiveAction: string;
  @ApiPropertyOptional({ description: 'What will stop it happening again' }) @IsOptional() @trim() @IsString() @MaxLength(2000) preventiveAction?: string | null;
  @ApiPropertyOptional({ example: 'supervision', description: 'The root cause (Masters › NCR root causes), by code' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) rootCause?: string | null;
  @ApiPropertyOptional({ example: '42000.00', description: 'What putting it right cost' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() reworkCost?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Photos of the rectified work, added to the NCR' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class NcrCloseDto {
  @ApiPropertyOptional({ description: 'How it was verified' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ example: '42000.00', description: 'What putting it right cost, where known by now' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() reworkCost?: string | null;
}

export class NcrReopenDto {
  @ApiProperty({ description: 'What is still not right' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) note: string;
}

export class ListNcrsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: NCR_STATUSES }) @IsOptional() @IsIn(NCR_STATUSES as unknown as string[]) status?: NcrStatus;
  @ApiPropertyOptional({ enum: NCR_SEVERITIES }) @IsOptional() @IsIn(NCR_SEVERITIES as unknown as string[]) severity?: NcrSeverity;
  @ApiPropertyOptional({ description: 'Not closed' }) @IsOptional() @QueryBool() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ description: 'Not closed and past the due date' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ description: 'Only NCRs assigned to the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() qualityTestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() inspectionId?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.ncrs, default: 'raisedOn' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.ncrs as unknown as string[]) sortBy?: NcrSortField;
}

export class QualitySummaryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
