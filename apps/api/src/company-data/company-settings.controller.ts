import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CompanySettingsService } from './company-settings.service';
import { UpdateCompanyLogoDto, UpdateCompanyProfileDto, UpdateDocSeriesDto } from './company-settings.dto';

/** Settings › Company and Numbering (admins). */
@ApiTags('company-settings')
@ApiBearerAuth()
@Controller('company-settings')
export class CompanySettingsController {
  constructor(private settings: CompanySettingsService) {}

  @ApiOperation({ summary: "The company's letterhead details, its logo, and how each kind of document is numbered" })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.settings.get(user);
  }

  @ApiOperation({ summary: 'Change the legal name, registered address, GSTIN, PAN and CIN printed on the letterhead' })
  @Put('profile')
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateCompanyProfileDto) {
    return this.settings.updateProfile(user, dto);
  }

  @ApiOperation({ summary: 'Put up the logo printed on the letterhead (a PNG, JPEG or WebP of 200 KB at most), or take it off with null' })
  @Put('logo')
  updateLogo(@CurrentUser() user: RequestUser, @Body() dto: UpdateCompanyLogoDto) {
    return this.settings.updateLogo(user, dto);
  }

  @ApiOperation({ summary: 'Set the number pattern of each kind of document, such as PO/{FY}/{NNNN}' })
  @Put('numbering')
  updateNumbering(@CurrentUser() user: RequestUser, @Body() dto: UpdateDocSeriesDto) {
    return this.settings.updateNumbering(user, dto);
  }
}
