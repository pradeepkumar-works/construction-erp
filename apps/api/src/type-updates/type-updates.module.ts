import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { StructureModule } from '../structure/structure.module';
import { TypeUpdatesController } from './type-updates.controller';
import { TypeUpdatesService } from './type-updates.service';

/** Update projects from their type or a component kind. */
@Module({ imports: [TemplatesModule, StructureModule], controllers: [TypeUpdatesController], providers: [TypeUpdatesService] })
export class TypeUpdatesModule {}
