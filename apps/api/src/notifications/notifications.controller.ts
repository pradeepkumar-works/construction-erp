import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationJobsService } from './notification-jobs.service';
import { JobQuery, ListNotificationsQuery, RegisterPushTokenDto, RemovePushTokenQuery } from './notifications.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GuestAllowed, Public } from '../common/decorators';
import { CronGuard } from './cron.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService, private jobs: NotificationJobsService) {}

  /** The current user's notifications, newest first, plus the unread count. */
  @GuestAllowed()
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListNotificationsQuery) {
    return this.notifications.list(user, q);
  }

  @GuestAllowed()
  @Post('read-all')
  readAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user);
  }

  @GuestAllowed()
  @Get('push-tokens')
  tokens(@CurrentUser() user: RequestUser) {
    return this.notifications.listTokens(user);
  }

  /** Register (or refresh) the Expo push token of this device for the current user. */
  @GuestAllowed()
  @Post('push-tokens')
  registerToken(@CurrentUser() user: RequestUser, @Body() dto: RegisterPushTokenDto) {
    return this.notifications.registerToken(user, dto);
  }

  /** Forget a device token (called on sign-out). */
  @GuestAllowed()
  @Delete('push-tokens')
  removeToken(@CurrentUser() user: RequestUser, @Query() q: RemovePushTokenQuery) {
    return this.notifications.removeToken(user, q.token);
  }

  @GuestAllowed()
  @Post(':id/read')
  read(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  /* ---------- scheduled jobs (Vercel Cron / curl with CRON_SECRET) ---------- */

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Daily "DPR not submitted" reminder. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/dpr-reminder')
  dprReminder(@Query() q: JobQuery) {
    return this.jobs.dprReminder(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Daily digest of pending approvals (in-app, push, email and WhatsApp); also sends the test-due and payments-due reminders. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/approval-digest')
  async approvalDigest(@Query() q: JobQuery) {
    const digest = await this.jobs.approvalDigest(q.date);
    // Vercel Hobby allows two crons, so the daily test and payment reminders ride on the digest's.
    await this.jobs.testsDue(q.date).catch(() => undefined);
    await this.jobs.billsDue(q.date).catch(() => undefined);
    return digest;
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Test readings due or overdue (cubes at 7 and 28 days), reminded once each. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/tests-due')
  testsDue(@Query() q: JobQuery) {
    return this.jobs.testsDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Payments due: unpaid approved bills falling due within 3 days, once a day to admin, management and accounts. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/bills-due')
  billsDue(@Query() q: JobQuery) {
    return this.jobs.billsDue(q.date);
  }
}
