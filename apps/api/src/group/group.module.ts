import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';

/** Group companies: a parent company's group of companies, one sign-in across them. */
@Module({ controllers: [GroupController], providers: [GroupService] })
export class GroupModule {}
