import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { StatementsModule } from '../statements/statements.module';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';

@Module({ imports: [BooksModule, StatementsModule], controllers: [FixedAssetsController], providers: [FixedAssetsService] })
export class FixedAssetsModule {}
