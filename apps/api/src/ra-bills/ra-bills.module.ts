import { Module } from '@nestjs/common';
import { RaBillsController } from './ra-bills.controller';
import { RaBillsService } from './ra-bills.service';

@Module({ controllers: [RaBillsController], providers: [RaBillsService], exports: [RaBillsService] })
export class RaBillsModule {}
