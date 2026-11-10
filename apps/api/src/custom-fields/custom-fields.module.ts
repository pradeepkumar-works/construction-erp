import { Global, Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

/** Global so the vendor, project and purchase order services read their values through the one reader. */
@Global()
@Module({ controllers: [CustomFieldsController], providers: [CustomFieldsService], exports: [CustomFieldsService] })
export class CustomFieldsModule {}
