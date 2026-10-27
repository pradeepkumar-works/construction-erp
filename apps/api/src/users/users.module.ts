import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({ imports: [AuthModule, ProjectsModule], controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
