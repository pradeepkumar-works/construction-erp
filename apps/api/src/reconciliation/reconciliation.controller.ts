import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReconciliationService } from './reconciliation.service';
import { RateAnalysisService } from './rate-analysis.service';
import { CopyRateAnalysisDto, EstimateTermsDto, ImportRateAnalysisDto, ReconciliationQuery, RecoverExcessDto, SaveBoqResourceDto, SaveMaterialNormDto } from './reconciliation.dto';

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private reconciliation: ReconciliationService,
    private rates: RateAnalysisService,
  ) {}

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

  @ApiOperation({
    summary: 'Material issued to each subcontractor against what their measured work should have taken',
    description: 'Since the start, per approved work order: approved measurements × the norms (with wastage) against issues to the order, and the excess already raised for recovery.',
  })
  @Get('projects/:id/subcontractors')
  subcontractors(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.subcontractors(user, id);
  }

  @ApiOperation({
    summary: 'Recover material used over the allowance on the subcontractor\'s next bill',
    description: 'Those who prepare subcontractor bills and see cost. At most the excess not yet raised. A bill being prepared on the order (draft or sent back) takes it at once; otherwise the next bill does.',
  })
  @Post('projects/:id/work-orders/:workOrderId/recoveries')
  recover(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('workOrderId', ParseUUIDPipe) workOrderId: string, @Body() dto: RecoverExcessDto) {
    return this.reconciliation.recover(user, id, workOrderId, dto);
  }

  @ApiOperation({ summary: 'Withdraw a recovery', description: 'While the bill that takes it is neither waiting for approval nor approved.' })
  @Delete('projects/:id/recoveries/:recoveryId')
  cancelRecovery(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('recoveryId', ParseUUIDPipe) recoveryId: string) {
    return this.reconciliation.cancelRecovery(user, id, recoveryId);
  }

  @ApiOperation({ summary: 'Stock adjustments by reason and item', description: 'Wastage, damage, theft, count differences and other adjustments in the period; opening stock left out. Values only for cost viewers.' })
  @Get('projects/:id/wastage')
  wastage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReconciliationQuery) {
    return this.reconciliation.wastage(user, id, q);
  }

  @ApiOperation({
    summary: "The project's estimate: each BOQ item's built-up rate from its rate analysis",
    description: 'Materials at item rates (with wastage), labour at labour rates, machines at the average hourly rate of the company\'s equipment in the category, plus overheads and profit, against the BOQ rate. Rates and amounts only for cost viewers.',
  })
  @Get('projects/:id/estimate')
  estimate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rates.estimate(user, id);
  }

  @ApiOperation({ summary: "Set the estimate's overheads and profit", description: 'QS, project manager, management or admin who see cost.' })
  @Put('projects/:id/estimate-terms')
  setTerms(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EstimateTermsDto) {
    return this.rates.setTerms(user, id, dto);
  }

  @ApiOperation({ summary: 'Add or change a labour or machine line of a BOQ item\'s rate analysis', description: 'QS, project manager, management or admin.' })
  @Put('projects/:id/resources')
  saveResource(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBoqResourceDto) {
    return this.rates.saveResource(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a labour or machine line', description: 'QS, project manager, management or admin.' })
  @Delete('projects/:id/resources/:resourceId')
  removeResource(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('resourceId', ParseUUIDPipe) resourceId: string) {
    return this.rates.removeResource(user, id, resourceId);
  }

  @ApiOperation({ summary: "Fill a BOQ item's rate analysis from another BOQ item or the starter library", description: 'Materials from the library pick store items by name and unit; the ones that match none are listed as skipped.' })
  @Post('projects/:id/rate-analysis/copy')
  copy(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CopyRateAnalysisDto) {
    return this.rates.copy(user, id, dto);
  }

  @ApiOperation({ summary: 'Import rate analysis rows from Excel', description: 'All or nothing: any row with an error refuses the sheet, naming the rows to fix.' })
  @Post('projects/:id/rate-analysis/import')
  import(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportRateAnalysisDto) {
    return this.rates.import(user, id, dto);
  }
}
