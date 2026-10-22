import { Module } from '@nestjs/common';
import { PostingService } from './posting.service';

/** What each module's records become in the accounts, for the Tally export and the books (v6 item 102). */
@Module({ providers: [PostingService], exports: [PostingService] })
export class PostingModule {}
