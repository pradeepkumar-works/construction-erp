import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SavedViewsService } from './saved-views.service';
import { CreateSavedViewDto, ListSavedViewsQuery, UpdateSavedViewDto } from './saved-views.dto';

@ApiTags('saved-views')
@ApiBearerAuth()
@Controller('saved-views')
export class SavedViewsController {
  constructor(private views: SavedViewsService) {}

  @ApiOperation({ summary: "A list's saved views", description: 'Your own views on the list, then the ones others shared with the company.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListSavedViewsQuery) {
    return this.views.list(user, q.list);
  }

  @ApiOperation({ summary: 'Save a view', description: 'Filters, sort and columns of a list under a name; `shared` shows it to everyone in the company.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSavedViewDto) {
    return this.views.create(user, dto);
  }

  @ApiOperation({ summary: 'Rename, share or update a view', description: 'Its owner, or an admin for a shared view.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSavedViewDto) {
    return this.views.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a view', description: 'Its owner, or an admin for a shared view.' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.views.remove(user, id);
  }
}
