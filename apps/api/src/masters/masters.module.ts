import { Global, Module } from '@nestjs/common';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';

/** Global so any service that fills a picker (attendance's trades) reads the company's list. */
@Global()
@Module({ controllers: [MastersController], providers: [MastersService], exports: [MastersService] })
export class MastersModule {}
