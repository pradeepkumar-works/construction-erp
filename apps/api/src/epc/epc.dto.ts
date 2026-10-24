import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { APPROVAL_CODES, ENGINEERING_DISCIPLINES, PACKAGE_STAGES, type ApprovalCode, type EngineeringDiscipline, type PackageStage } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));
const date = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class SaveDeliverableDto {
  @ApiPropertyOptional({ description: 'Leave out to add a deliverable' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ enum: ENGINEERING_DISCIPLINES }) @IsIn(ENGINEERING_DISCIPLINES as unknown as string[], { message: 'Choose the discipline' }) discipline!: EngineeringDiscipline;
  @ApiProperty({ example: 'PRC-003' }) @trim() @IsString({ message: 'Give it a number, e.g. PRC-003' }) @MaxLength(30) code!: string;
  @ApiProperty({ example: 'Process design basis and mass balance' }) @trim() @IsString({ message: 'Say what the deliverable is' }) @MaxLength(200) title!: string;
  @ApiPropertyOptional({ description: 'The component or unit it designs' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional({ description: 'The document in the register its revisions are filed under' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() documentId?: string | null;
  @ApiPropertyOptional({ example: '2026-03-15' }) @IsOptional() @date() @IsDateString() plannedSubmitOn?: string | null;
  @ApiPropertyOptional({ example: '2026-04-05' }) @IsOptional() @date() @IsDateString() plannedApprovalOn?: string | null;
  @ApiPropertyOptional({ example: '2026-03-18', description: 'The latest submission' }) @IsOptional() @date() @IsDateString() submittedOn?: string | null;
  @ApiPropertyOptional({ example: 'R1' }) @IsOptional() @trim() @IsString() @MaxLength(20) revision?: string | null;
  @ApiPropertyOptional({ enum: APPROVAL_CODES, description: 'The code the client returned the latest submission with' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(APPROVAL_CODES as unknown as string[])
  approvalCode?: ApprovalCode | null;
  @ApiPropertyOptional({ example: '2026-04-02', description: 'The day it was approved (code A or B)' }) @IsOptional() @date() @IsDateString() approvedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}

export class PackageStageInputDto {
  @ApiProperty({ enum: PACKAGE_STAGES }) @IsIn(PACKAGE_STAGES as unknown as string[]) stage!: PackageStage;
  @ApiPropertyOptional({ example: '2026-05-10' }) @IsOptional() @date() @IsDateString() plannedOn?: string | null;
  @ApiPropertyOptional({ example: '2026-05-14' }) @IsOptional() @date() @IsDateString() actualOn?: string | null;
}

export class SavePackageDto {
  @ApiPropertyOptional({ description: 'Leave out to add a package' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ example: 'PKG-04' }) @trim() @IsString({ message: 'Give it a number, e.g. PKG-04' }) @MaxLength(30) code!: string;
  @ApiProperty({ example: 'Air blowers with motors and acoustic hoods' }) @trim() @IsString({ message: 'Say what the package is' }) @MaxLength(200) name!: string;
  @ApiProperty({ enum: ENGINEERING_DISCIPLINES }) @IsIn(ENGINEERING_DISCIPLINES as unknown as string[], { message: 'Choose the discipline' }) discipline!: EngineeringDiscipline;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ description: 'A purchase order of this project' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() purchaseOrderId?: string | null;
  @ApiPropertyOptional({ example: '2 duty + 1 standby, 850 m³/h at 6 m' }) @IsOptional() @trim() @IsString() @MaxLength(300) scope?: string | null;
  @ApiPropertyOptional({ example: '18500000', description: 'Rupees (at the contract rate on a foreign contract)' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() value?: string | null;
  @ApiPropertyOptional({ example: '2026-09-01', description: 'The day site needs it delivered' }) @IsOptional() @date() @IsDateString() neededOn?: string | null;
  @ApiPropertyOptional({ example: 'MV Sea Falcon' }) @IsOptional() @trim() @IsString() @MaxLength(100) vessel?: string | null;
  @ApiPropertyOptional({ example: 'BL-2026-0418' }) @IsOptional() @trim() @IsString() @MaxLength(60) billOfLading?: string | null;
  @ApiPropertyOptional({ example: '2026-09-12', description: "The ship's expected arrival at the port" }) @IsOptional() @date() @IsDateString() eta?: string | null;
  @ApiPropertyOptional({ example: 10, description: 'Days from the port to site, customs included; 10 when empty' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(120)
  portToSiteDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
  @ApiPropertyOptional({ type: [PackageStageInputDto], description: 'Replaces the stage dates; a stage left out does not apply' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PackageStageInputDto)
  stages?: PackageStageInputDto[];
}

export class SaveClientInputDto {
  @ApiPropertyOptional({ description: 'Leave out to add one' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ example: 'Power for testing at the plant' }) @trim() @IsString({ message: 'Say what the client owes' }) @MaxLength(200) name!: string;
  @ApiProperty({ example: '2026-11-15' }) @IsDateString({}, { message: 'Give the day it is due' }) dueDate!: string;
  @ApiPropertyOptional({ example: '2026-11-20', description: 'The day the client gave it' }) @IsOptional() @date() @IsDateString() achievedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}
