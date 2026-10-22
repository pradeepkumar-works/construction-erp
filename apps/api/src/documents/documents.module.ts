import { Module } from '@nestjs/common';
import { PlanningModule } from '../planning/planning.module';
import { DocumentsController, LettersController, TransmittalsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTextService } from './document-text.service';
import { DrawingMarkupsService } from './drawing-markups.service';
import { DrawingTakeoffsService } from './drawing-takeoffs.service';

@Module({ imports: [PlanningModule], controllers: [DocumentsController, TransmittalsController, LettersController], providers: [DocumentsService, DocumentTextService, DrawingMarkupsService, DrawingTakeoffsService], exports: [DocumentsService, DocumentTextService] })
export class DocumentsModule {}
