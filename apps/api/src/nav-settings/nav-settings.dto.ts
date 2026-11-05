import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { NAV_LAYOUTS, NAV_LOOKS, NAV_MODULE_SETS, NAV_PAINTS, NAV_PALETTES, NAV_SIDEBAR_LOOKS, type NavFill, type NavLayout, type NavLook, type NavModuleSet, type NavPaint, type NavPalette, type NavSidebarLook } from '@erp/shared';

export class SaveNavSettingsDto {
  @ApiProperty({
    enum: NAV_LAYOUTS,
    description: 'Where the modules and their sub-modules sit: all down the side, the modules on Home with a top bar, modules on top and sub-modules down the side, two top bars, or two sidebars',
  })
  @IsIn(NAV_LAYOUTS as unknown as string[])
  layout: NavLayout;

  @ApiProperty({ enum: NAV_LOOKS, description: "The top bar's look" })
  @IsIn(NAV_LOOKS as unknown as string[])
  look: NavLook;

  @ApiPropertyOptional({ enum: NAV_SIDEBAR_LOOKS, description: 'How the sidebar sits; left out, beside the page' })
  @IsOptional()
  @IsIn(NAV_SIDEBAR_LOOKS as unknown as string[])
  sidebarLook?: NavSidebarLook;

  @ApiPropertyOptional({ enum: NAV_PAINTS, description: "Which of the layout's two parts take the menu's colours; left out, the side part" })
  @IsOptional()
  @IsIn(NAV_PAINTS as unknown as string[])
  paint?: NavPaint;

  @ApiPropertyOptional({ enum: NAV_PALETTES, description: "The menu's colours; left out, Nirmaan's own. CUSTOM takes `fill`" })
  @IsOptional()
  @IsIn(NAV_PALETTES as unknown as string[])
  palette?: NavPalette;

  @ApiPropertyOptional({
    description: "The company's own colour, with palette CUSTOM: a plain colour or a two-stop gradient (180, 90 or 135 degrees)",
    example: { kind: 'GRADIENT', from: '#0B1F3A', to: '#3A2463', angle: 135 },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  fill?: NavFill | null;

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
