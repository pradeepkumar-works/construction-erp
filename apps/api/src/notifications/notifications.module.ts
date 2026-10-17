import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationJobsService } from './notification-jobs.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { ExpoPushService } from './expo-push.service';
import { EmailService } from './email.service';
import { MessagingService } from '../messaging/messaging.service';
import { MessagingController } from '../messaging/messaging.controller';
import { PayablesModule } from '../payables/payables.module';
import { WarningsModule } from '../warnings/warnings.module';
import { CompanyDataService } from '../company-data/company-data.service';
import { CompanyDataController } from '../company-data/company-data.controller';
import { BillingService } from '../billing/billing.service';
import { BillingController } from '../billing/billing.controller';

/**
 * Global so SubmissionLifecycleService (CommonModule) can emit notifications, and invites send WhatsApp / SMS, without an import cycle.
 * Company data and billing live here too: they email admins, and their daily jobs ride on the digest cron.
 */
@Global()
@Module({
  imports: [PayablesModule, WarningsModule],
  controllers: [NotificationsController, MessagingController, CompanyDataController, BillingController],
  providers: [NotificationsService, NotificationJobsService, NotificationSchedulerService, ExpoPushService, EmailService, MessagingService, CompanyDataService, BillingService],
  exports: [NotificationsService, NotificationJobsService, EmailService, MessagingService],
})
export class NotificationsModule {}
