import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [TemplatesModule], controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
