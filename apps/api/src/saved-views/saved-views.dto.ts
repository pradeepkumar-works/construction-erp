import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SAVED_VIEW_LISTS, type SavedViewList, type SavedViewState } from '@erp/shared';

export class ListSavedViewsQuery {
  @ApiProperty({ enum: SAVED_VIEW_LISTS }) @IsIn(SAVED_VIEW_LISTS as unknown as string[]) list!: SavedViewList;
}

export class CreateSavedViewDto {
  @ApiProperty({ enum: SAVED_VIEW_LISTS }) @IsIn(SAVED_VIEW_LISTS as unknown as string[]) list!: SavedViewList;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @ApiPropertyOptional({ description: 'Everyone in the company sees it' }) @IsOptional() @IsBoolean() shared?: boolean;
  @ApiProperty({ description: '{ filters: { status: "SUBMITTED", ... }, columns?: ["date", ...] }' }) @IsObject() state!: SavedViewState;
}

export class UpdateSavedViewDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shared?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() state?: SavedViewState;
}
