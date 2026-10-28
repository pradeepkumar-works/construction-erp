import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { NAV_LAYOUTS, NAV_LOOKS, NAV_MODULE_SETS, type NavLayout, type NavLook, type NavModuleSet } from '@erp/shared';

export class SaveNavSettingsDto {
  @ApiProperty({ enum: NAV_LAYOUTS, description: 'The menu down the side, or across the top with the modules on Home' })
  @IsIn(NAV_LAYOUTS as unknown as string[])
  layout: NavLayout;

  @ApiProperty({ enum: NAV_LOOKS, description: "The top bar's look" })
  @IsIn(NAV_LOOKS as unknown as string[])
  look: NavLook;

  @ApiProperty({ enum: NAV_MODULE_SETS, description: 'How the pages are grouped into modules' })
  @IsIn(NAV_MODULE_SETS as unknown as string[])
  moduleSet: NavModuleSet;

  @ApiProperty({ description: "The company's names for modules, by module key; an empty name keeps the module's own", example: { 'store-inventory': 'Stores' } })
  @IsObject()
  names: Record<string, string>;

  @ApiProperty({ description: 'People may choose their own look in Profile › Appearance' })
  @IsBoolean()
  personalLook: boolean;
}

export class SaveOwnLookDto {
  @ApiPropertyOptional({ enum: NAV_LOOKS, nullable: true, description: "The look this person wants; null follows the company's" })
  @IsOptional()
  @IsIn(NAV_LOOKS as unknown as string[])
  look?: NavLook | null;
}
