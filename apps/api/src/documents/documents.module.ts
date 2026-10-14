import { Module } from '@nestjs/common';
import { DocumentsController, LettersController, TransmittalsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({ controllers: [DocumentsController, TransmittalsController, LettersController], providers: [DocumentsService] })
export class DocumentsModule {}
