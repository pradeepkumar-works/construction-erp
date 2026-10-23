import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { INBOUND_STATES, type InboundState } from '@erp/shared';

export class CaptureListQuery {
  @ApiPropertyOptional({ enum: ['mine', 'company'], default: 'mine', description: "company: everyone's (admins)" }) @IsOptional() @IsIn(['mine', 'company']) scope?: 'mine' | 'company';
  @ApiPropertyOptional({ enum: INBOUND_STATES }) @IsOptional() @IsIn(INBOUND_STATES as unknown as string[]) state?: InboundState;
  @ApiPropertyOptional({ description: 'Only this message (a link from a WhatsApp reply)' }) @IsOptional() @IsUUID() id?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class CaptureSetupInput {
  @ApiProperty({ description: 'Read WhatsApp messages from the mobile number on my profile as me' }) @IsBoolean() enabled!: boolean;
}

export class SavedInAppInput {
  @ApiProperty({ description: 'The record saved from the form the draft opened in' }) @IsUUID() recordId!: string;
}
