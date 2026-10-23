import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { LauncherService } from './launcher.service';
import { CreatePinDto, ImportDto, MovePinDto, VisitDto } from './launcher.dto';

@ApiTags('launcher')
@ApiBearerAuth()
@Controller('launcher')
export class LauncherController {
  constructor(private launcher: LauncherService) {}

  @ApiOperation({ summary: 'Pins and Recent for Home', description: 'Launcher phase 2: your pins in order and the places you opened last, with project names as they are now.' })
  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.launcher.get(user);
  }

  @ApiOperation({ summary: 'Counts waiting on you, by tile', description: 'Approvals, each module (its entries to approve), My work and Watch list.' })
  @Get('badges')
  badges(@CurrentUser() user: RequestUser) {
    return this.launcher.badges(user);
  }

  @ApiOperation({ summary: 'Pin to Home', description: 'A page or module of the navigation tree, or a project. At most 12.' })
  @Post('pins')
  pin(@CurrentUser() user: RequestUser, @Body() dto: CreatePinDto) {
    return this.launcher.pin(user, dto);
  }

  @ApiOperation({ summary: 'Move a pin' })
  @Patch('pins/:id')
  move(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MovePinDto) {
    return this.launcher.move(user, id, dto.position);
  }

  @ApiOperation({ summary: 'Unpin' })
  @Delete('pins/:id')
  unpin(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.launcher.unpin(user, id);
  }

  @ApiOperation({ summary: 'Record a place opened', description: 'For Recent: a page of the navigation tree, a project or a record.' })
  @Post('visits')
  visit(@CurrentUser() user: RequestUser, @Body() dto: VisitDto) {
    return this.launcher.visit(user, dto);
  }

  @ApiOperation({ summary: "Bring in one browser's favourites and recent pages", description: 'Sent once by the web app the first time Home opens after the launcher arrived.' })
  @Post('import')
  import(@CurrentUser() user: RequestUser, @Body() dto: ImportDto) {
    return this.launcher.import(user, dto);
  }
}
