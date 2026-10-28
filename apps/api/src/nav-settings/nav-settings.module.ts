import { Module } from '@nestjs/common';
import { NavSettingsController } from './nav-settings.controller';
import { NavSettingsService } from './nav-settings.service';

/** Menu and names: the company's menu layout, look, module set and names, and a person's own look. */
@Module({ controllers: [NavSettingsController], providers: [NavSettingsService] })
export class NavSettingsModule {}
