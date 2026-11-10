import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { CUSTOM_FIELD_ENTITIES, FIELD_KINDS, MAX_CUSTOM_CHOICES, type CustomFieldEntity, type FieldKind } from '@erp/shared';

const nullable = () => ValidateIf((_, v) => v !== null);

export class ListCustomFieldsQuery {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITIES }) @IsIn(CUSTOM_FIELD_ENTITIES as unknown as string[]) entity: CustomFieldEntity;
}

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITIES }) @IsIn(CUSTOM_FIELD_ENTITIES as unknown as string[]) entity: CustomFieldEntity;
  @ApiProperty({ example: 'MSME number' }) @IsString() @MaxLength(200) label: string;
  @ApiProperty({ enum: FIELD_KINDS, description: 'Fixed once saved; a field of another kind is a new field' }) @IsIn(FIELD_KINDS as unknown as string[]) kind: FieldKind;
  @ApiPropertyOptional({ example: 'एमएसएमई संख्या', description: 'Shown on the phone; the English name when empty' }) @IsOptional() @nullable() @IsString() @MaxLength(200) labelHi?: string | null;
  @ApiPropertyOptional({ description: 'Required on every save; for a purchase order, when it is sent for approval' }) @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional({ example: 'Cr', description: 'NUMBER only' }) @IsOptional() @nullable() @IsString() @MaxLength(40) unit?: string | null;
  @ApiPropertyOptional({ example: 0, description: 'NUMBER only' }) @IsOptional() @nullable() @IsNumber() min?: number | null;
  @ApiPropertyOptional({ example: null, description: 'NUMBER only' }) @IsOptional() @nullable() @IsNumber() max?: number | null;
  @ApiPropertyOptional({ example: ['A', 'B', 'C'], description: 'CHOICE only' }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_CUSTOM_CHOICES * 2) @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
}

/** The key and the kind never change. */
export class UpdateCustomFieldDto extends PartialType(OmitType(CreateCustomFieldDto, ['entity', 'kind'] as const)) {}

export class OrderCustomFieldsDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITIES }) @IsIn(CUSTOM_FIELD_ENTITIES as unknown as string[]) entity: CustomFieldEntity;
  @ApiProperty({ description: "The entity's field ids in the order forms, records and lists show them" }) @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids: string[];
}

/** What a vendor, project or purchase order sends for its fields of the company's own. */
export const CUSTOM_VALUES_DOC = { description: "Values of the company's own fields, by key (GET /custom-fields). Left out, they stay as they are; a blank clears one.", example: { msmeNumber: 'UDYAM-OD-19-0012345' } };
