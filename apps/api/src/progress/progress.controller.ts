import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { CreateProgressDto, ListProgressQuery, UpdateProgressDto } from './progress.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
export class ProgressController {
  constructor(private progress: ProgressService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListProgressQuery) {
    return this.progress.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProgressDto) {
    return this.progress.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateProgressDto) {
    return this.progress.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.progress.remove(user, id);
  }
}
