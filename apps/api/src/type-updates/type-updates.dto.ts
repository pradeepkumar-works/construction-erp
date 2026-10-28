import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { MAX_UPDATE_PROJECTS } from '@erp/shared';

export class ApplyProjectUpdateDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ type: [String], description: 'Items of its plan to leave out: c:<component key>, a:<component id>:<line key>, l:<loose activity name>' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  skip?: string[];
}

export class ApplyUpdatesDto {
  @ApiProperty({ type: [ApplyProjectUpdateDto] })
  @IsArray()
  @ArrayMaxSize(MAX_UPDATE_PROJECTS)
  @ValidateNested({ each: true })
  @Type(() => ApplyProjectUpdateDto)
  projects: ApplyProjectUpdateDto[];
}
