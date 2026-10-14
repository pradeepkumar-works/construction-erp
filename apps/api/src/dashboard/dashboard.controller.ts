import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('company')
  company(@CurrentUser() user: RequestUser) {
    return this.dashboard.company(user);
  }

  /** First-week setup checklist for admin and management (403 for other roles). */
  @Get('getting-started')
  gettingStarted(@CurrentUser() user: RequestUser) {
    return this.dashboard.gettingStarted(user);
  }

  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dashboard.project(user, id);
  }
}
