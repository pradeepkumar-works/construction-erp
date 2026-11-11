import { Module } from '@nestjs/common';
import { SitePhotosController } from './site-photos.controller';
import { SitePhotosService } from './site-photos.service';

/** A project's photo timeline: when and where each site photo was taken. */
@Module({ controllers: [SitePhotosController], providers: [SitePhotosService] })
export class SitePhotosModule {}
