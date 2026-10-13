import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MaterialRequestsService } from './material-requests.service';
import { CreateMaterialRequestDto, ListMaterialRequestQuery, UpdateMaterialRequestDto } from './material-requests.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('material-requests')
@ApiBearerAuth()
@Controller('material-requests')
export class MaterialRequestsController {
  constructor(private mr: MaterialRequestsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListMaterialRequestQuery) {
    return this.mr.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.mr.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMaterialRequestDto) {
    return this.mr.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMaterialRequestDto) {
    return this.mr.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.mr.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.mr.remove(user, id);
  }
}
