import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnquiriesController, PublicQuotesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';

@Module({ imports: [AuthModule], controllers: [EnquiriesController, PublicQuotesController], providers: [EnquiriesService] })
export class EnquiriesModule {}
