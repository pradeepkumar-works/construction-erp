import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto, ListCustomFieldsQuery, OrderCustomFieldsDto, UpdateCustomFieldDto } from './custom-fields.dto';

@ApiTags('custom-fields')
@ApiBearerAuth()
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private fields: CustomFieldsService) {}

  @ApiOperation({ summary: "The company's own fields on vendors, projects or purchase orders, archived ones included", description: 'Every member of staff: forms, records and lists draw them.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListCustomFieldsQuery) {
    return this.fields.list(user, q.entity);
  }

  @ApiOperation({ summary: 'Add a field', description: 'Admin. The key is made from the name and never changes, nor does the kind.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomFieldDto) {
    return this.fields.create(user, dto);
  }

  @ApiOperation({ summary: "Put an entity's fields in order", description: 'Admin.' })
  @Put('order')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: OrderCustomFieldsDto) {
    return this.fields.reorder(user, dto);
  }

  @ApiOperation({ summary: "Change a field's name, Hindi name, whether it is required, its unit and range, or its choices", description: 'Admin.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.fields.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Archive a field: forms stop asking for it; records keep and show their values', description: 'Admin. Never deleted, so its key keeps its meaning.' })
  @Post(':id/archive')
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.fields.setArchived(user, id, true);
  }

  @ApiOperation({ summary: 'Bring an archived field back', description: 'Admin.' })
  @Post(':id/restore')
  restore(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.fields.setArchived(user, id, false);
  }
}
