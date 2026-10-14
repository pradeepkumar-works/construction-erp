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
import { CompanyDataService } from '../company-data/company-data.service';
import { CompanyDataController } from '../company-data/company-data.controller';

/**
 * Global so SubmissionLifecycleService (CommonModule) can emit notifications, and invites send WhatsApp / SMS, without an import cycle.
 * Company data lives here too: it emails admins and its purge rides on the daily digest cron.
 */
@Global()
@Module({
  imports: [PayablesModule],
  controllers: [NotificationsController, MessagingController, CompanyDataController],
  providers: [NotificationsService, NotificationJobsService, NotificationSchedulerService, ExpoPushService, EmailService, MessagingService, CompanyDataService],
  exports: [NotificationsService, NotificationJobsService, EmailService, MessagingService],
})
export class NotificationsModule {}
