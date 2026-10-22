import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { COMMENT_KINDS, COMMENT_MAX_LENGTH, COMMENT_MAX_MENTIONS, type CommentKind } from '@erp/shared';

export class CommentTargetQuery {
  @ApiProperty({ enum: COMMENT_KINDS }) @IsIn(COMMENT_KINDS) kind!: CommentKind;
  @ApiProperty() @IsUUID() entityId!: string;
}

export class CreateCommentDto extends CommentTargetQuery {
  @ApiProperty({ example: '@Kavita Rao can we take the slab on Friday?' }) @IsString() @MaxLength(COMMENT_MAX_LENGTH) body!: string;
  @ApiPropertyOptional({ description: 'Users mentioned, each written as @Full Name in the body', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMENT_MAX_MENTIONS)
  @IsUUID('all', { each: true })
  mentions?: string[];
  @ApiPropertyOptional({ description: 'The first comment of the thread this replies to' }) @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty() @IsString() @MaxLength(COMMENT_MAX_LENGTH) body!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(COMMENT_MAX_MENTIONS) @IsUUID('all', { each: true }) mentions?: string[];
}
