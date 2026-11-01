import { Module } from '@nestjs/common';
import { RisksModule } from '../risks/risks.module';
import { ProgrammeController } from './programme.controller';
import { ProgrammeService } from './programme.service';
import { EotService } from './eot.service';

/** Programme and EOT (ARCHITECTURE "Programme and EOT"). */
@Module({ imports: [RisksModule], controllers: [ProgrammeController], providers: [ProgrammeService, EotService], exports: [ProgrammeService, EotService] })
export class ProgrammeModule {}
