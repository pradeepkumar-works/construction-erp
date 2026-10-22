import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

@Module({ imports: [BooksModule], controllers: [StatementsController], providers: [StatementsService], exports: [StatementsService] })
export class StatementsModule {}
