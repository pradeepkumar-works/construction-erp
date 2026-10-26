import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectSetupService } from './project-setup.service';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [TemplatesModule], controllers: [ProjectsController], providers: [ProjectsService, ProjectSetupService], exports: [ProjectsService, ProjectSetupService] })
export class ProjectsModule {}
