import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DprService } from './dpr.service';
import { CreateDprDto, ListDprQuery, UpdateDprDto } from './dpr.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('dpr')
@ApiBearerAuth()
@Controller('dpr')
export class DprController {
  constructor(private dpr: DprService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListDprQuery) {
    return this.dpr.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDprDto) {
    return this.dpr.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDprDto) {
    return this.dpr.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.dpr.remove(user, id);
  }
}
