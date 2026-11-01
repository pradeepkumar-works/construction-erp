import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { ProjectTypesController } from './project-types.controller';
import { ProjectTypesService } from './project-types.service';
import { DprFormsService } from './dpr-forms.service';
import { TypeBundleService } from './type-bundle.service';

/** Project types, component kinds, their loose activities and DPR forms. */
@Module({ controllers: [TemplatesController, ProjectTypesController], providers: [TemplatesService, ProjectTypesService, DprFormsService, TypeBundleService], exports: [TemplatesService, ProjectTypesService, DprFormsService, TypeBundleService] })
export class TemplatesModule {}
