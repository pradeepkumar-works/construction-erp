import { Module } from '@nestjs/common';
import { PpeController } from './ppe.controller';
import { PpeService } from './ppe.service';

@Module({
  controllers: [PpeController],
  providers: [PpeService],
  exports: [PpeService],
})
export class PpeModule {}
