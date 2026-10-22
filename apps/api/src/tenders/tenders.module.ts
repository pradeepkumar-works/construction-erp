import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SorController, TendersController } from './tenders.controller';
import { SorService } from './sor.service';
import { TendersService } from './tenders.service';

/** Tender bidding (v6 item 110): schedules of rates and the tender register. */
@Module({ imports: [ProjectsModule], controllers: [SorController, TendersController], providers: [SorService, TendersService], exports: [TendersService] })
export class TendersModule {}
