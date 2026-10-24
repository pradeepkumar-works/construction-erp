import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { BILLING_BASES, PACKAGE_STAGES, STAGE_TRIGGERS, type BillingBasis, type PackageStage, type StageTrigger } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));

export class SaveBillingComponentDto {
  @ApiPropertyOptional({ description: 'Leave out to add a component' }) @IsOptional() @IsUUID() id?: string;
  @ApiPropertyOptional({ description: 'The component this is a part of (three tanks under the tanks)' }) @IsOptional() @IsUUID() parentId?: string | null;
  @ApiProperty({ example: '8.1' }) @trim() @IsString() @MaxLength(20) code!: string;
  @ApiProperty({ example: 'OHT 650 KL, Ward 4' }) @trim() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ example: '7.23', description: 'Share of the lump sum (a component) or of its parent (a part), %; none on a unit-rate component' })
  @IsOptional()
  @num()
  @IsNumberString()
  sharePct?: string | null;
  @ApiProperty({ enum: BILLING_BASES }) @IsIn(BILLING_BASES as unknown as string[]) basis!: BillingBasis;
  @ApiPropertyOptional({ description: 'The component of the work breakdown it reads' }) @IsOptional() @IsUUID() workElementId?: string | null;
}

export class SaveBillingStageDto {
  @ApiPropertyOptional({ description: 'Leave out to add a stage' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty() @IsUUID() componentId!: string;
  @ApiProperty({ example: 'Staging' }) @trim() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ example: '20', description: '% of the component this stage pays' }) @num() @IsNumberString() pct!: string;
  @ApiProperty({ enum: STAGE_TRIGGERS }) @IsIn(STAGE_TRIGGERS as unknown as string[]) trigger!: StageTrigger;
  @ApiPropertyOptional({ type: [String], description: 'PROGRESS and TEST: the activities it reads' }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) activityIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'SUPPLY: the store items received against it' }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) itemIds?: string[];
  @ApiPropertyOptional({ example: '10100', description: 'SUPPLY: the scope in the items\' unit (metres for pipe)' }) @IsOptional() @num() @IsNumberString() scopeQty?: string | null;
  @ApiPropertyOptional({ example: '2026-02-12', description: 'EVENT: the day it happened' }) @IsOptional() @IsDateString() achievedOn?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'EVENT (item 130): engineering deliverables whose approval is the event, in place of a date' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  deliverableIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'SUPPLY (item 130): equipment packages it is paid by, in place of items and a scope' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  packageIds?: string[];
  @ApiPropertyOptional({ enum: PACKAGE_STAGES, description: 'SUPPLY with packages: the stage they must reach; delivered when empty' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(PACKAGE_STAGES as unknown as string[])
  packageStage?: PackageStage | null;
  @ApiPropertyOptional({ example: 'EE letter SUWM/DES/114' }) @IsOptional() @trim() @IsString() @MaxLength(300) evidence?: string | null;
}

export class StandardBreakupDto {
  @ApiPropertyOptional({ default: false, description: 'Replace the break-up there is (only while none of its stages is on a bill)' }) @IsOptional() @IsBoolean() replace?: boolean;
}

export class BillingTermsDto {
  @ApiPropertyOptional({ example: '309888000', description: 'The lump sum the components share; empty takes the contract value' }) @IsOptional() @num() @IsNumberString() lumpSumValue?: string | null;
  @ApiPropertyOptional({ example: '1.0425', description: 'Lump sum ÷ the estimate; unit-rate lines are paid at rate × this' }) @IsOptional() @num() @IsNumberString() tenderFactor?: string | null;
  @ApiPropertyOptional({ example: '10', description: 'Advance recovery starts at this % of the contract executed' }) @IsOptional() @num() @IsNumberString() advanceRecoveryFromPct?: string | null;
  @ApiPropertyOptional({ example: '80', description: 'and is finished by this %' }) @IsOptional() @num() @IsNumberString() advanceRecoveryToPct?: string | null;
}

export class MilestoneCellDto {
  @ApiProperty({ example: '2026-11-01' }) @IsDateString() month!: string;
  @ApiProperty({ example: '45', description: 'Cumulative target by the end of the month, % of the component' }) @num() @IsNumberString() pct!: string;
}

export class MilestoneRowInputDto {
  @ApiProperty() @IsUUID() componentId!: string;
  @ApiProperty({ type: [MilestoneCellDto] }) @IsArray() @ArrayMaxSize(120) @ValidateNested({ each: true }) @Type(() => MilestoneCellDto) targets!: MilestoneCellDto[];
}

export class SaveMilestoneGridDto {
  @ApiProperty({ type: [MilestoneRowInputDto], description: 'Replaces the grid' }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MilestoneRowInputDto) rows!: MilestoneRowInputDto[];
}

export class SlippageTierInputDto {
  @ApiProperty({ example: '0' }) @num() @IsNumberString() fromPct!: string;
  @ApiPropertyOptional({ example: '25', description: 'Empty for the last tier' }) @IsOptional() @num() @IsNumberString() toPct?: string | null;
  @ApiProperty({ example: '2.5' }) @num() @IsNumberString() withheldPct!: string;
}

export class SaveSlippageTiersDto {
  @ApiProperty({ type: [SlippageTierInputDto], description: 'Replaces the tiers; an empty list goes back to the defaults' })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SlippageTierInputDto)
  tiers!: SlippageTierInputDto[];
}

export class ClaimStageDto {
  @ApiProperty({ example: '12.5', description: "This bill's % of the stage; empty goes back to what the evidence gives" }) @IsOptional() @num() @IsNumberString() pct?: string | null;
  @ApiPropertyOptional({ example: 'Staging lift 5 cast on 18 Oct, cubes awaited' }) @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}
