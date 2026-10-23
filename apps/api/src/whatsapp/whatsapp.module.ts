import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { DprModule } from '../dpr/dpr.module';
import { ProgressModule } from '../progress/progress.module';
import { MaterialRequestsModule } from '../material-requests/material-requests.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [AiModule, NotificationsModule, ProjectsModule, DprModule, ProgressModule, MaterialRequestsModule, ExpensesModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
