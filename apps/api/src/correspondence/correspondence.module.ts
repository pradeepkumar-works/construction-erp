import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { LetterContactsController, LetterTemplatesController, LettersController } from './correspondence.controller';
import { CorrespondenceService } from './correspondence.service';

/** Correspondence (item 136): the inward and outward registers, address book, numbering series and templates. */
@Module({ imports: [DocumentsModule], controllers: [LettersController, LetterContactsController, LetterTemplatesController], providers: [CorrespondenceService], exports: [CorrespondenceService] })
export class CorrespondenceModule {}
