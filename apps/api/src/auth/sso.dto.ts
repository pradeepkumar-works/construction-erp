import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SSO_PROVIDERS, type SsoProvider } from '@erp/shared';

/** Company settings › Sign-in. What else must hold is `ssoSettingsProblem`. */
export class SaveSsoSettingsDto {
  @ApiProperty({ enum: SSO_PROVIDERS })
  @IsIn(SSO_PROVIDERS as unknown as string[])
  provider: SsoProvider;

  @ApiPropertyOptional({ description: 'Entra: the directory (tenant) ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(256)
  clientId: string;

  @ApiPropertyOptional({ description: 'Leave out to keep the saved secret' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  clientSecret?: string | null;

  @ApiProperty({ type: [String], example: ['company.com'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedDomains: string[];

  @ApiProperty()
  @IsBoolean()
  enforce: boolean;

  @ApiProperty()
  @IsBoolean()
  addNewPeople: boolean;

  @ApiPropertyOptional({ description: 'A role key of SSO_NEW_PERSON_ROLES' })
  @IsOptional()
  @IsString()
  newPersonRole?: string | null;
}

export class SsoExchangeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  code: string;
}
