import { Module } from '@nestjs/common';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [TemplatesModule], controllers: [StructureController], providers: [StructureService], exports: [StructureService] })
export class StructureModule {}
