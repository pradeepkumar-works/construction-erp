import { Body, Controller, Delete, Get, Logger, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationJobsService } from './notification-jobs.service';
import { JobQuery, ListNotificationsQuery, ReadAllNotificationsQuery, RegisterPushTokenDto, RemovePushTokenQuery } from './notifications.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GuestAllowed, Public } from '../common/decorators';
import { CronGuard } from './cron.guard';
import { IntegrationsService } from '../integrations/integrations.service';
import { CompanyDataService } from '../company-data/company-data.service';
import { BillingService } from '../billing/billing.service';
import { AllowWhenUnpaid } from '../common/billing';
import { DocumentTextService } from '../documents/document-text.service';

@ApiTags('notifications')
@ApiBearerAuth()
@AllowWhenUnpaid()
@Controller('notifications')
export class NotificationsController {
  private readonly log = new Logger(NotificationsController.name);

  constructor(
    private notifications: NotificationsService,
    private jobs: NotificationJobsService,
    private companyData: CompanyDataService,
    private billing: BillingService,
    private documentText: DocumentTextService,
    private integrations: IntegrationsService,
  ) {}

  /** The current user's notifications, newest first, plus the unread count. */
  @GuestAllowed()
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListNotificationsQuery) {
    return this.notifications.list(user, q);
  }

  @GuestAllowed()
  @Post('read-all')
  readAll(@CurrentUser() user: RequestUser, @Query() q: ReadAllNotificationsQuery) {
    return this.notifications.markAllRead(user, q.tab);
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

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Daily "DPR not submitted" reminder. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/dpr-reminder')
  async dprReminder(@Query() q: JobQuery) {
    // Reminders and escalation of waiting approvals ride on both daily crons where nothing runs them hourly.
    const failed = await this.runAll({ APPROVAL_ESCALATION: () => this.jobs.approvalEscalation() });
    return { ...(await this.jobs.dprReminder(q.date)), failed };
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({
    summary: 'Reminders and escalation of approvals waiting too long. Run it hourly (an external cron, or NOTIFICATION_JOBS_INPROCESS); the two daily jobs run it too. Auth: Authorization: Bearer <CRON_SECRET>.',
  })
  @Get('jobs/approval-escalation')
  approvalEscalation() {
    return this.jobs.approvalEscalation();
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Daily digest of pending approvals (in-app, push, email and WhatsApp); also writes and sends the morning briefs, reads filed PDFs for Ask the contract, and sends the test-due, payments-due, machinery-due, guarantee and licence expiry and defect liability reminders, new early warnings (five a person a day at most), and on Mondays the watch list. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/approval-digest')
  async approvalDigest(@Query() q: JobQuery) {
    // Vercel Hobby has no third cron for the overnight batch, so morning briefs not yet written are written first
    // (a no-op where jobs/briefs already ran), go into the digest email, and are sent after it.
    const before = await this.runAll({
      BRIEFS: () => this.jobs.writeBriefs(q.date),
      APPROVAL_ESCALATION: () => this.jobs.approvalEscalation(),
    });
    const digest = await this.jobs.approvalDigest(q.date);
    const after = await this.runAll({
      MORNING_BRIEF: () => this.jobs.morningBrief(q.date),
      WARNING_ALERTS: () => this.jobs.warningAlerts(q.date),
      TESTS_DUE: () => this.jobs.testsDue(q.date),
      BILLS_DUE: () => this.jobs.billsDue(q.date),
      LOAN_EMIS_DUE: () => this.jobs.loanEmisDue(q.date),
      MACHINERY_DUE: () => this.jobs.machineryDue(q.date),
      COMPLIANCE_DUE: () => this.jobs.complianceDue(q.date),
      HANDOVER_DUE: () => this.jobs.handoverDue(q.date),
      OBLIGATIONS_DUE: () => this.jobs.obligationsDue(q.date),
      WATCH_LIST: () => this.jobs.watchList(q.date),
      RECEIPTS_WEEKLY: () => this.jobs.receiptsWeekly(q.date),
      PURGE_COMPANIES: () => this.companyData.purgeDue(q.date),
      BILLING: () => this.billing.daily(q.date),
      POLL_FEEDS: () => this.integrations.pollDue(),
      READ_DOCUMENTS: () => this.documentText.readAllPending(60_000),
    });
    return { ...digest, failed: [...before, ...after] };
  }

  private async runAll(jobs: Record<string, () => Promise<unknown>>): Promise<string[]> {
    const failed: string[] = [];
    for (const [name, run] of Object.entries(jobs)) {
      try {
        await run();
      } catch (e) {
        this.log.error(`${name} failed: ${(e as Error).message}`, (e as Error).stack);
        failed.push(name);
      }
    }
    return failed;
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Reads the text of filed PDFs (current document revisions and letters) not read yet, page by page, for Ask the contract; searches read their own projects\' files too. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/read-documents')
  async readDocuments() {
    return { job: 'READ_DOCUMENTS', read: await this.documentText.readAllPending(240_000) };
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: "The overnight batch: today's morning briefs and, on Mondays, last week's summary paragraph for each project's report. Writes only; the digest sends the briefs. Auth: Authorization: Bearer <CRON_SECRET>." })
  @Get('jobs/briefs')
  writeBriefs(@Query() q: JobQuery) {
    return this.jobs.writeBriefs(q.date);
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

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Machine loan EMIs falling due within 7 days, and once more when overdue, to admin, management and accounts. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/loan-emis-due')
  loanEmisDue(@Query() q: JobQuery) {
    return this.jobs.loanEmisDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Machinery due: services falling due, vehicle papers and driving licences expiring within 30 days, each alerted once. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/machinery-due')
  machineryDue(@Query() q: JobQuery) {
    return this.jobs.machineryDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Guarantees, EMDs, insurance policies and licences expiring within 30 days or expired, each alerted once per stage. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/compliance-due')
  complianceDue(@Query() q: JobQuery) {
    return this.jobs.complianceDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Contract obligations due within 7 days or overdue, each alerted once per stage and deadline (item 171). Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/obligations-due')
  obligationsDue(@Query() q: JobQuery) {
    return this.jobs.obligationsDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Defect liability periods ending within 30 days or just ended, and snags or defects past their due date. Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/handover-due')
  handoverDue(@Query() q: JobQuery) {
    return this.jobs.handoverDue(q.date);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Weekly watch list: one notification to each manager, stores, purchase or accounts user with open early warnings, once a week (runs on any day when called here). Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/watch-list')
  watchList(@Query() q: JobQuery) {
    return this.jobs.watchList(q.date, true);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: "Last week's money in from clients: one notification and email per project manager and to management, once a week (runs on any day when called here). Auth: Authorization: Bearer <CRON_SECRET>." })
  @Get('jobs/receipts-weekly')
  receiptsWeekly(@Query() q: JobQuery) {
    return this.jobs.receiptsWeekly(q.date, true);
  }
}
