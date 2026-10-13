import { Module } from '@nestjs/common';
import { MaterialRequestsController } from './material-requests.controller';
import { MaterialRequestsService } from './material-requests.service';

@Module({ controllers: [MaterialRequestsController], providers: [MaterialRequestsService], exports: [MaterialRequestsService] })
export class MaterialRequestsModule {}
