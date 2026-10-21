import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { HomeService } from './home.service';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService, private home: HomeService) {}

  @Get('company')
  company(@CurrentUser() user: RequestUser) {
    return this.dashboard.company(user);
  }

  /** First-week setup checklist for admin and management (403 for other roles). */
  @Get('getting-started')
  gettingStarted(@CurrentUser() user: RequestUser) {
    return this.dashboard.gettingStarted(user);
  }

  /** The home page's My work: what the caller's role can act on now. */
  @Get('my-work')
  myWork(@CurrentUser() user: RequestUser) {
    return this.home.myWork(user);
  }

  /** Six months of trends for the home page's tiles and charts, each part only for roles that see it. */
  @Get('trends')
  trends(@CurrentUser() user: RequestUser) {
    return this.home.trends(user);
  }

  /** The company's day for the phone's Home (v5 item 96): admin, management, accounts and project managers. */
  @Get('company-today')
  companyToday(@CurrentUser() user: RequestUser) {
    return this.home.companyToday(user);
  }

  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dashboard.project(user, id);
  }
}
