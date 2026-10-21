import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaterialRequestsService } from './material-requests.service';
import { CreateMaterialRequestDto, ListMaterialRequestQuery, UpdateMaterialRequestDto } from './material-requests.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StockService } from '../stock/stock.service';
import { CoverRequestDto } from '../stock/stock.dto';

@ApiTags('material-requests')
@ApiBearerAuth()
@Controller('material-requests')
export class MaterialRequestsController {
  constructor(private mr: MaterialRequestsService, private stock: StockService) {}

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

  @ApiOperation({
    summary: 'Edit a material request',
    description:
      'Allowed for the author while DRAFT / REJECTED / CHANGES_REQUESTED and for approvers until APPROVED. ' +
      '`attachmentIds`, when sent, becomes the complete list of attachments (omitted ones are detached). ' +
      'Send `submit: true` to resubmit for approval in the same call.',
  })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMaterialRequestDto) {
    return this.mr.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a material request for approval', description: 'From DRAFT, REJECTED or CHANGES_REQUESTED. Clears the previous review and logs SUBMITTED / RESUBMITTED in the audit trail.' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.mr.submit(user, id);
  }

  @ApiOperation({ summary: 'Stock of each line at its own site and the other sites (stock first)', description: 'v5 item 95. Items are matched to the item master by name and unit; other sites are those the user can see.' })
  @Get(':id/stock')
  stockFor(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stock.requestStock(user, id);
  }

  @ApiOperation({
    summary: 'Meet request lines from stock',
    description: "v5 item 95. From the request's own site: an issue to whoever raised it. From another site: a transfer to the request's site. Each line at most what it still needs and what the site holds; store keepers of the sending site.",
  })
  @Post(':id/cover')
  cover(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CoverRequestDto) {
    return this.stock.coverRequest(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.mr.remove(user, id);
  }
}
