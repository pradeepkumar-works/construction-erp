import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret' })],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
