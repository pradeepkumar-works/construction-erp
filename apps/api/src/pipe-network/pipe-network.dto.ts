import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { MAX_NETWORK_SIZE, PIPE_MATERIALS, PIPE_NODE_KINDS, PIPE_SCOPES, type PipeMaterial, type PipeNodeKind, type PipeScope } from '@erp/shared';

const nullable = (_: unknown, v: unknown) => v !== null && v !== undefined;

export class PipeNodeInputDto {
  @ApiProperty({ example: 'J-12' }) @IsString() @MinLength(1) @MaxLength(40) code: string;
  @ApiProperty({ enum: PIPE_NODE_KINDS }) @IsIn(PIPE_NODE_KINDS as unknown as string[]) kind: PipeNodeKind;
  @ApiPropertyOptional({ nullable: true, description: 'Ground level, m' }) @IsOptional() @ValidateIf(nullable) @IsNumber() groundLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsNumber() x: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsNumber() y: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Chainage on a main, m' }) @IsOptional() @ValidateIf(nullable) @IsInt() chainage: number | null;
}

export class PipeSegmentInputDto {
  @ApiProperty({ example: 'P-27' }) @IsString() @MinLength(1) @MaxLength(40) code: string;
  @ApiProperty({ example: 'J-12' }) @IsString() @MaxLength(40) from: string;
  @ApiProperty({ example: 'J-13' }) @IsString() @MaxLength(40) to: string;
  @ApiProperty({ example: 84.5 }) @IsNumber() @Min(0) @Max(100_000) lengthM: number;
  @ApiProperty({ example: 110 }) @IsInt() @Min(0) @Max(5000) diameterMm: number;
  @ApiProperty({ enum: PIPE_MATERIALS }) @IsIn(PIPE_MATERIALS as unknown as string[]) material: PipeMaterial;
  @ApiPropertyOptional({ nullable: true, example: 'PN6' }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(40) pipeClass: string | null;
  @ApiProperty({ enum: PIPE_SCOPES }) @IsIn(PIPE_SCOPES as unknown as string[]) scope: PipeScope;
  @ApiPropertyOptional({ nullable: true, example: 'Bituminous' }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(60) surface: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Road, open cut' }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(80) crossing: string | null;
}

export class PipeNetworkImportDto {
  @ApiProperty({ description: 'The pipe zone or main the network belongs to' }) @IsUUID() zoneId: string;
  @ApiProperty({ type: [PipeNodeInputDto] }) @IsArray() @ArrayMaxSize(MAX_NETWORK_SIZE) @ValidateNested({ each: true }) @Type(() => PipeNodeInputDto) nodes: PipeNodeInputDto[];
  @ApiProperty({ type: [PipeSegmentInputDto] }) @IsArray() @ArrayMaxSize(MAX_NETWORK_SIZE) @ValidateNested({ each: true }) @Type(() => PipeSegmentInputDto) pipes: PipeSegmentInputDto[];
  @ApiPropertyOptional({ description: 'Only work out what saving would do' }) @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class UpdatePipeSegmentDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) @Max(100_000) lengthM?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5000) diameterMm?: number;
  @ApiPropertyOptional({ enum: PIPE_MATERIALS }) @IsOptional() @IsIn(PIPE_MATERIALS as unknown as string[]) material?: PipeMaterial;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(40) pipeClass?: string | null;
  @ApiPropertyOptional({ enum: PIPE_SCOPES }) @IsOptional() @IsIn(PIPE_SCOPES as unknown as string[]) scope?: PipeScope;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(60) surface?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf(nullable) @IsString() @MaxLength(80) crossing?: string | null;
}
