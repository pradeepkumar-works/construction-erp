import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SaveNavSettingsDto, SaveOwnLookDto } from './nav-settings.dto';
import { NavSettingsService } from './nav-settings.service';

/** Menu and names: the company's menu (admins change it), and a person's own look. */
@ApiTags('nav-settings')
@ApiBearerAuth()
@Controller('nav-settings')
export class NavSettingsController {
  constructor(private settings: NavSettingsService) {}

  @ApiOperation({ summary: "The company's menu: where it sits, its look, the module set and the company's module names" })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.settings.get(user);
  }

  @ApiOperation({ summary: "Change the company's menu and module names", description: 'Admins. Everyone gets the new menu on their next page.' })
  @Put()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveNavSettingsDto) {
    return this.settings.save(user, dto);
  }

  @ApiOperation({ summary: 'Choose your own look for the top bar', description: "Used when the company lets people choose; null follows the company's." })
  @Put('own-look')
  ownLook(@CurrentUser() user: RequestUser, @Body() dto: SaveOwnLookDto) {
    return this.settings.saveOwnLook(user, dto.look ?? null);
  }
}
