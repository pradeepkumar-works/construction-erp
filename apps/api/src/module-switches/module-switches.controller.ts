import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SetModuleSwitchDto } from './module-switches.dto';
import { ModuleSwitchesService } from './module-switches.service';

/** The company's optional modules. Admins. */
@ApiTags('module-switches')
@ApiBearerAuth()
@Controller('module-switches')
export class ModuleSwitchesController {
  constructor(private switches: ModuleSwitchesService) {}

  @ApiOperation({ summary: "The company's optional modules: whether its plan has each and whether it is in use" })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.switches.list(user);
  }

  @ApiOperation({ summary: 'Turn a module on or off', description: 'Off hides it everywhere and refuses its routes; nothing is deleted. A module outside the plan cannot be turned on.' })
  @Put(':key')
  set(@CurrentUser() user: RequestUser, @Param('key') key: string, @Body() dto: SetModuleSwitchDto) {
    return this.switches.set(user, key, dto.on);
  }
}
