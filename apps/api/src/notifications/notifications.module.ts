import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationJobsService } from './notification-jobs.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { ExpoPushService } from './expo-push.service';
import { EmailService } from './email.service';

/** Global so SubmissionLifecycleService (CommonModule) can emit notifications without an import cycle. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationJobsService, NotificationSchedulerService, ExpoPushService, EmailService],
  exports: [NotificationsService, NotificationJobsService, EmailService],
})
export class NotificationsModule {}
