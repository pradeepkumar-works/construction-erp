import { Module } from '@nestjs/common';
import { VariationsController } from './variations.controller';
import { VariationsService } from './variations.service';
import { ExcessSavingController } from './excess-saving.controller';
import { ExcessSavingService } from './excess-saving.service';

@Module({ controllers: [VariationsController, ExcessSavingController], providers: [VariationsService, ExcessSavingService], exports: [VariationsService] })
export class VariationsModule {}
