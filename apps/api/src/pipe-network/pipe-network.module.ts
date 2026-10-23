import { Module } from '@nestjs/common';
import { PipeNetworkController } from './pipe-network.controller';
import { PipeNetworkService } from './pipe-network.service';

@Module({ controllers: [PipeNetworkController], providers: [PipeNetworkService], exports: [PipeNetworkService] })
export class PipeNetworkModule {}
