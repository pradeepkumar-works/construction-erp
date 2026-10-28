import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectSetupService } from './project-setup.service';
import { TemplatesModule } from '../templates/templates.module';
import { StructureModule } from '../structure/structure.module';

@Module({ imports: [TemplatesModule, StructureModule], controllers: [ProjectsController], providers: [ProjectsService, ProjectSetupService], exports: [ProjectsService, ProjectSetupService] })
export class ProjectsModule {}
