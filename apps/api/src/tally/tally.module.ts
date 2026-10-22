import { Module } from '@nestjs/common';
import { TallyController } from './tally.controller';
import { TallyService } from './tally.service';
import { PostingModule } from '../posting/posting.module';

@Module({ imports: [PostingModule], controllers: [TallyController], providers: [TallyService] })
export class TallyModule {}
