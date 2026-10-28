import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import {
  CODE_PATTERN,
  CONTRACT_MODELS,
  MAX_BREAKDOWN,
  MAX_COMPONENT_COUNT,
  MAX_KIND_STEPS,
  MAX_SPEC_FIELDS,
  MAX_TEMPLATE_ITEMS,
  TYPE_BASES,
  WORK_ELEMENT_TYPES,
  WORK_LOCATIONS,
  type ContractModel,
  type ProjectType,
  type WorkElementType,
  type WorkLocation,
} from '@erp/shared';
import { TemplateItemDto } from './templates.dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
const CODE_MSG = 'The code is 2 to 40 capital letters, digits or _, starting with a letter';

export class NewProjectTypeDto {
  @ApiProperty({ example: 'BRIDGE' }) @upper() @Matches(CODE_PATTERN, { message: CODE_MSG }) code: string;
  @ApiProperty({ example: 'Bridge' }) @trim() @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiProperty({ enum: TYPE_BASES, description: 'The built-in kind it is built on' }) @IsIn(TYPE_BASES as unknown as string[]) baseType: ProjectType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional({ description: 'Start as a copy of this type (code)' }) @IsOptional() @IsString() copyFrom?: string;
}

export class StartComponentDto {
  @ApiProperty({ example: '7' }) @IsString() @IsNotEmpty() @MaxLength(20) key: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20) parentKey?: string | null;
  @ApiProperty({ example: 'OHT', description: 'A component kind code' }) @IsString() @IsNotEmpty() @MaxLength(40) kind: string;
  @ApiProperty({ example: 'Overhead tank' }) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Max(MAX_COMPONENT_COUNT) count: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() specs?: Record<string, number | null> | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) @Max(100) weightPct?: number | null;
}

export class SaveProjectTypeDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiProperty({ enum: TYPE_BASES }) @IsIn(TYPE_BASES as unknown as string[]) baseType: ProjectType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ enum: WORK_LOCATIONS, isArray: true }) @IsArray() @IsIn(WORK_LOCATIONS as unknown as string[], { each: true }) locations: WorkLocation[];
  @ApiProperty() @IsBoolean() pipeNetwork: boolean;
  @ApiProperty({ enum: CONTRACT_MODELS }) @IsIn(CONTRACT_MODELS as unknown as string[]) contractModel: ContractModel;
  @ApiProperty({ type: [String], description: 'Component kind codes offered first' }) @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) kinds: string[];
  @ApiProperty({ type: [StartComponentDto] }) @IsArray() @ArrayMaxSize(MAX_BREAKDOWN) @ValidateNested({ each: true }) @Type(() => StartComponentDto) breakdown: StartComponentDto[];
  @ApiPropertyOptional({ type: [TemplateItemDto], description: 'Its loose activities; left out, they stay as they are (PUT /activity-templates/:code saves them on their own)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TEMPLATE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  activities?: TemplateItemDto[];
  @ApiProperty() @IsBoolean() active: boolean;
}

export class NewComponentKindDto {
  @ApiProperty({ example: 'OHT_4M' }) @upper() @Matches(CODE_PATTERN, { message: CODE_MSG }) code: string;
  @ApiProperty({ example: 'Overhead tank, 4 m lifts' }) @trim() @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiProperty({ enum: WORK_ELEMENT_TYPES, description: "Built on; a new kind starts from that kind's specs and steps" }) @IsIn(WORK_ELEMENT_TYPES as unknown as string[]) elementType: WorkElementType;
  @ApiPropertyOptional({ description: 'Start as a copy of this kind (code)' }) @IsOptional() @IsString() copyFrom?: string;
}

export class SpecFieldDto {
  @ApiProperty({ example: 'stagingM' }) @IsString() @Matches(/^[a-z][A-Za-z]{0,29}$/, { message: 'A spec key is letters only, starting with a small letter, e.g. stagingM' }) key: string;
  @ApiProperty({ example: 'Staging height' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) label: string;
  @ApiProperty({ example: 'm' }) @trim() @IsString() @IsNotEmpty() @MaxLength(20) unit: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) default?: number;
}

export class StepPartDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(20) unit: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) weightPct: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) qtyFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lumpSum?: boolean;
}

export class ComponentStepDto {
  @ApiProperty({ enum: ['plain', 'rcc', 'lifts', 'group'] }) @IsIn(['plain', 'rcc', 'lifts', 'group']) kind: 'plain' | 'rcc' | 'lifts' | 'group';
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ description: 'Plain and group steps' }) @IsOptional() @trim() @IsString() @MaxLength(20) unit?: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) weightPct: number;
  @ApiPropertyOptional({ description: 'Plain: the spec its quantity is read from' }) @IsOptional() @IsString() @MaxLength(30) qtyFrom?: string;
  @ApiPropertyOptional({ description: 'Plain: one lump sum' }) @IsOptional() @IsBoolean() lumpSum?: boolean;
  @ApiPropertyOptional({ description: 'Lifts: the spec the lifts are counted over (a height, or floors)' }) @IsOptional() @IsString() @MaxLength(30) over?: string;
  @ApiPropertyOptional({ type: [StepPartDto], description: 'RCC and lifts: its parts; the standard reinforcement, shuttering and concrete when left out' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StepPartDto)
  parts?: StepPartDto[];
  @ApiPropertyOptional({ type: [StepPartDto], description: 'Group: its sub-activities' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => StepPartDto) subs?: StepPartDto[];
}

export class SaveComponentKindDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiProperty({ enum: WORK_ELEMENT_TYPES }) @IsIn(WORK_ELEMENT_TYPES as unknown as string[]) elementType: WorkElementType;
  @ApiProperty({ type: [SpecFieldDto] }) @IsArray() @ArrayMaxSize(MAX_SPEC_FIELDS) @ValidateNested({ each: true }) @Type(() => SpecFieldDto) specFields: SpecFieldDto[];
  @ApiProperty({ type: [ComponentStepDto] }) @IsArray() @ArrayMaxSize(MAX_KIND_STEPS) @ValidateNested({ each: true }) @Type(() => ComponentStepDto) steps: ComponentStepDto[];
  @ApiProperty() @IsBoolean() active: boolean;
}

export class SaveDprFormDto {
  @ApiProperty({ description: 'The whole form: fields (built-in, each with show, required and label), minPhotos, lines (picker, parts, crewCategories, machineNames) and own (up to 20 fields of the company\'s own)' })
  @IsObject()
  definition: Record<string, unknown>;
}
