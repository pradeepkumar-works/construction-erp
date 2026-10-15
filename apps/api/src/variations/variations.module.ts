import { Module } from '@nestjs/common';
import { VariationsController } from './variations.controller';
import { VariationsService } from './variations.service';

@Module({ controllers: [VariationsController], providers: [VariationsService], exports: [VariationsService] })
export class VariationsModule {}
