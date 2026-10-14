import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, type MeasurementSortField, type SubmissionStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));

export class MeasurementLineInputDto {
  @ApiProperty({ example: 'Km 14+200 to 14+300, LHS' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) description: string;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() nos?: string | null;
  @ApiPropertyOptional({ example: '100' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() length?: string | null;
  @ApiPropertyOptional({ example: '7.5' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() breadth?: string | null;
  @ApiPropertyOptional({ example: '0.2', description: 'Depth or height' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() depth?: string | null;
  @ApiPropertyOptional({ default: false, description: 'Deduction (openings, overlaps): counted negative' }) @IsOptional() @IsBoolean() deduct?: boolean;
}

export class CreateMeasurementDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() boqItemId: string;
  @ApiPropertyOptional({ description: "Work done by a subcontractor: their approved, open work order with a line on this BOQ item; null for the company's own work" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  workOrderId?: string | null;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiProperty({ example: 'Km 14+200 to 14+400' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) location: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiProperty({ type: [MeasurementLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MeasurementLineInputDto)
  lines: MeasurementLineInputDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

/** `lines`, when sent, replaces all lines. */
export class UpdateMeasurementDto extends PartialType(CreateMeasurementDto) {}

/** `q` matches MB number, location, remarks, BOQ item number and description, project and submitter. */
export class ListMeasurementsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() boqItemId?: string;
  @ApiPropertyOptional({ description: 'Only work under this work order' }) @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries created by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.measurements, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.measurements as unknown as string[]) sortBy?: MeasurementSortField;
}
