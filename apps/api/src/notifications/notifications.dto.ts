import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { NOTIFICATION_TABS, NotificationTab, PUSH_PLATFORMS, PushPlatform } from '@erp/shared';

export class ListNotificationsQuery {
  @ApiPropertyOptional({ description: 'Only notifications not yet read' }) @IsOptional() @IsBoolean() unreadOnly?: boolean;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ description: 'Include every type. Left out, only the types older phone builds know are listed (and counted).' }) @IsOptional() @IsBoolean() allTypes?: boolean;
  @ApiPropertyOptional({ description: 'The version of the type list the client knows (NOTIFICATION_TYPES_VERSION): types added later are left out. Wins over allTypes.' }) @IsOptional() @IsInt() @Min(0) typesVersion?: number;
  @ApiPropertyOptional({ enum: NOTIFICATION_TABS, description: 'Only the types in one tab of the notifications drawer' }) @IsOptional() @IsIn(NOTIFICATION_TABS as unknown as string[]) tab?: NotificationTab;
}

export class ReadAllNotificationsQuery {
  @ApiPropertyOptional({ enum: NOTIFICATION_TABS, description: 'Mark only the types in one tab read' }) @IsOptional() @IsIn(NOTIFICATION_TABS as unknown as string[]) tab?: NotificationTab;
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
