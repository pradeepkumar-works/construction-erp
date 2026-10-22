import { Module } from '@nestjs/common';
import { MachineLoansController } from './machine-loans.controller';
import { MachineLoansService } from './machine-loans.service';

/** Machine finance (v6 item 108). */
@Module({ controllers: [MachineLoansController], providers: [MachineLoansService], exports: [MachineLoansService] })
export class MachineLoansModule {}
