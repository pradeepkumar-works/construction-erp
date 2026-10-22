import { Module } from '@nestjs/common';
import { DocumentsController, LettersController, TransmittalsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTextService } from './document-text.service';
import { DrawingMarkupsService } from './drawing-markups.service';

@Module({ controllers: [DocumentsController, TransmittalsController, LettersController], providers: [DocumentsService, DocumentTextService, DrawingMarkupsService], exports: [DocumentsService, DocumentTextService] })
export class DocumentsModule {}
