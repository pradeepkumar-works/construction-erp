import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SearchService } from './search.service';
import { SearchQuery } from './search.dto';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @ApiOperation({
    summary: 'Search records by number or name',
    description: 'Material requests, POs, bills, MB, expenses, inspections, risks, documents, vendors, clients, items and people matching `q`, a few of each, through the same rules as their lists.',
  })
  @Get()
  find(@CurrentUser() user: RequestUser, @Query() q: SearchQuery) {
    return this.search.search(user, q.q ?? '');
  }
}
