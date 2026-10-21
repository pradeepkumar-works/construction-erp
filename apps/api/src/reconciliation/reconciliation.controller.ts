import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationQuery, SaveMaterialNormDto } from './reconciliation.dto';

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliation: ReconciliationService) {}

  @ApiOperation({
    summary: "One project's material reconciliation and its norms",
    description:
      'QS, stores, procurement, accounts and approvers. Theoretical = approved progress on each BOQ item in the period × its norm; allowed adds the norm\'s wastage; consumed = issued to site − returned from site in the period. Over allowance when consumed exceeds allowed, below theoretical when it is more than 5% under. Rates and excess values only for cost viewers.',
  })
  @Get('projects/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReconciliationQuery) {
    return this.reconciliation.get(user, id, q);
  }

  @ApiOperation({ summary: 'Add or change the norm of a store item on a BOQ item', description: 'QS, project manager, management or admin. One norm per BOQ item and store item.' })
  @Put('projects/:id/norms')
  save(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveMaterialNormDto) {
    return this.reconciliation.save(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a norm', description: 'QS, project manager, management or admin.' })
  @Delete('projects/:id/norms/:normId')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('normId', ParseUUIDPipe) normId: string) {
    return this.reconciliation.remove(user, id, normId);
  }
}
