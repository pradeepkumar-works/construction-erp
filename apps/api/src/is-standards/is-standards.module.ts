import { Module } from '@nestjs/common';
import { QaModule } from '../qa/qa.module';
import { IsStandardsController } from './is-standards.controller';
import { IsStandardsService } from './is-standards.service';

@Module({ imports: [QaModule], controllers: [IsStandardsController], providers: [IsStandardsService], exports: [IsStandardsService] })
export class IsStandardsModule {}
