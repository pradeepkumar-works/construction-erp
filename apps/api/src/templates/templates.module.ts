import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { ProjectTypesController } from './project-types.controller';
import { ProjectTypesService } from './project-types.service';

/** Project types, component kinds and their loose activities (item 134). */
@Module({ controllers: [TemplatesController, ProjectTypesController], providers: [TemplatesService, ProjectTypesService], exports: [TemplatesService, ProjectTypesService] })
export class TemplatesModule {}
