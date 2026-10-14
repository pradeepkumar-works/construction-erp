import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PlatformService } from './platform.service';
import { SuspendDto, TrialDto } from './platform.dto';
import { AllowWhenUnpaid } from '../common/billing';

/** The console for Nirmaan staff (users whose email is in PLATFORM_ADMIN_EMAILS). */
@ApiTags('platform')
@ApiBearerAuth()
@AllowWhenUnpaid()
@Controller('platform')
export class PlatformController {
  constructor(private platform: PlatformService) {}

  @ApiOperation({ summary: 'Every company with users, projects, activity, storage and status' })
  @Get('companies')
  companies(@CurrentUser() user: RequestUser) {
    return this.platform.companies(user);
  }

  @ApiOperation({ summary: 'One company with its users and when each last did something' })
  @Get('companies/:id')
  company(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.company(user, id);
  }

  @ApiOperation({ summary: 'Suspend a company: nobody in it can sign in until lifted (audited in the company)' })
  @HttpCode(200)
  @Post('companies/:id/suspend')
  suspend(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendDto) {
    return this.platform.suspend(user, id, dto.reason);
  }

  @ApiOperation({ summary: 'Set when the free trial ends (billing on only; audited in the company)' })
  @HttpCode(200)
  @Post('companies/:id/trial')
  setTrial(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TrialDto) {
    return this.platform.setTrial(user, id, dto.until);
  }

  @ApiOperation({ summary: 'Lift a suspension' })
  @HttpCode(200)
  @Post('companies/:id/unsuspend')
  unsuspend(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.unsuspend(user, id);
  }

  @ApiOperation({ summary: 'A read-only support session in a company that allowed it (audited in the company)' })
  @HttpCode(200)
  @Post('companies/:id/support-session')
  openSupport(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.openSupport(user, id);
  }
}
