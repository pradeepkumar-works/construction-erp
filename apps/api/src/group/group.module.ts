import { Module } from '@nestjs/common';
import { StatementsModule } from '../statements/statements.module';
import { ConsolidationController } from './consolidation.controller';
import { ConsolidationService } from './consolidation.service';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';

/** Group companies: a parent company's group of companies, one sign-in across them, and its consolidated accounts. */
@Module({ imports: [StatementsModule], controllers: [GroupController, ConsolidationController], providers: [GroupService, ConsolidationService] })
export class GroupModule {}
