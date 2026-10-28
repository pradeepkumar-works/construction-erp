import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { MastersService } from './masters.service';
import { CreateMasterEntryDto, UpdateMasterEntryDto } from './masters.dto';

@ApiTags('masters')
@ApiBearerAuth()
@Controller('masters')
export class MastersController {
  constructor(private masters: MastersService) {}

  @ApiOperation({ summary: "Each simple list's entries switched on and in all", description: 'For Administration › Masters. Every member of staff.' })
  @Get()
  counts(@CurrentUser() user: RequestUser) {
    return this.masters.counts(user);
  }

  @ApiOperation({ summary: "One list as the company has it: the standard entries with the company's changes, then its own", description: 'trade, designation, department, item-category or equipment-category.' })
  @ApiQuery({ name: 'usage', required: false, description: '1 counts the records that carry each name' })
  @Get(':list')
  list(@CurrentUser() user: RequestUser, @Param('list') list: string, @Query('usage') usage?: string) {
    return this.masters.list(user, list, usage === '1' || usage === 'true');
  }

  @ApiOperation({ summary: 'Add an entry of the company’s own', description: 'Who may depends on the list (store for item categories, HR for designations…).' })
  @Post(':list')
  create(@CurrentUser() user: RequestUser, @Param('list') list: string, @Body() dto: CreateMasterEntryDto) {
    return this.masters.create(user, list, dto);
  }

  @ApiOperation({ summary: 'Rename an entry (only while no record uses it), give its Hindi name, or switch it off or on' })
  @Patch(':list/:code')
  update(@CurrentUser() user: RequestUser, @Param('list') list: string, @Param('code') code: string, @Body() dto: UpdateMasterEntryDto) {
    return this.masters.update(user, list, code, dto);
  }

  @ApiOperation({ summary: 'Delete one of the company’s own entries that no record uses' })
  @Delete(':list/:code')
  remove(@CurrentUser() user: RequestUser, @Param('list') list: string, @Param('code') code: string) {
    return this.masters.remove(user, list, code);
  }
}
