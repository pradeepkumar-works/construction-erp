import { Module } from '@nestjs/common';
import { ImprestController } from './imprest.controller';
import { ImprestService } from './imprest.service';

@Module({ controllers: [ImprestController], providers: [ImprestService] })
export class ImprestModule {}
