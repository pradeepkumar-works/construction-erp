import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { MESSAGE_CHANNELS, OUTBOUND_MESSAGE_STATUSES, type MessageChannel, type OutboundMessageStatus } from '@erp/shared';
import { PageQuery } from '../common/paging';

export class UpdateMessagingPrefsDto {
  @ApiPropertyOptional({ example: '9876543210', nullable: true, description: 'Mobile number; ten-digit Indian numbers get +91' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  phone?: string | null;
  @ApiPropertyOptional({ description: 'Alerts on WhatsApp' }) @IsOptional() @IsBoolean() whatsapp?: boolean;
  @ApiPropertyOptional({ description: 'Alerts by SMS (also the fallback when WhatsApp fails)' }) @IsOptional() @IsBoolean() sms?: boolean;
}

export class TestMessageDto {
  @ApiPropertyOptional({ enum: MESSAGE_CHANNELS, description: 'Defaults to WhatsApp' }) @IsOptional() @IsIn(MESSAGE_CHANNELS as unknown as string[]) channel?: MessageChannel;
}

/** `q` matches the number, the text and the recipient's name. Newest first. */
export class ListMessagesQuery extends PageQuery {
  @ApiPropertyOptional({ enum: OUTBOUND_MESSAGE_STATUSES }) @IsOptional() @IsIn(OUTBOUND_MESSAGE_STATUSES as unknown as string[]) status?: OutboundMessageStatus;
  @ApiPropertyOptional({ enum: MESSAGE_CHANNELS }) @IsOptional() @IsIn(MESSAGE_CHANNELS as unknown as string[]) channel?: MessageChannel;
}
