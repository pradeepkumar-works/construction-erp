import { Module } from '@nestjs/common';
import { RaBillsController } from './ra-bills.controller';
import { RaBillsService } from './ra-bills.service';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({ imports: [ReceivablesModule], controllers: [RaBillsController], providers: [RaBillsService], exports: [RaBillsService] })
export class RaBillsModule {}
