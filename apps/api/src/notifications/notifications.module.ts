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

/** Global so SubmissionLifecycleService (CommonModule) can emit notifications, and invites send WhatsApp / SMS, without an import cycle. */
@Global()
@Module({
  imports: [PayablesModule],
  controllers: [NotificationsController, MessagingController],
  providers: [NotificationsService, NotificationJobsService, NotificationSchedulerService, ExpoPushService, EmailService, MessagingService],
  exports: [NotificationsService, NotificationJobsService, EmailService, MessagingService],
})
export class NotificationsModule {}
