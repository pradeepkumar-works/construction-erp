import { Module } from '@nestjs/common';
import { PostingModule } from '../posting/posting.module';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

@Module({ imports: [PostingModule], controllers: [BooksController], providers: [BooksService], exports: [BooksService] })
export class BooksModule {}
