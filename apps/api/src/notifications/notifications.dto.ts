import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PUSH_PLATFORMS, PushPlatform } from '@erp/shared';

export class ListNotificationsQuery {
  @ApiPropertyOptional({ description: 'Only notifications not yet read' }) @IsOptional() @IsBoolean() unreadOnly?: boolean;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}

export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(200)
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/, { message: 'token must be an Expo push token' })
  token: string;

  @ApiProperty({ enum: PUSH_PLATFORMS }) @IsIn(PUSH_PLATFORMS as unknown as string[]) platform: PushPlatform;
  @ApiPropertyOptional({ example: 'Pixel 8' }) @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
}

export class RemovePushTokenQuery {
  @ApiProperty() @IsString() @MaxLength(200) token: string;
}

export class JobQuery {
  /** Override "today" (YYYY-MM-DD) for testing; defaults to today in NOTIFICATION_TIMEZONE. */
  @ApiPropertyOptional({ example: '2026-10-13' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}
