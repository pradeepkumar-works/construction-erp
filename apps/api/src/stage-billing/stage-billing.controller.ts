import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StageBillingService } from './stage-billing.service';
import { BillingTermsDto, SaveBillingComponentDto, SaveBillingStageDto, SaveMilestoneGridDto, SaveSlippageTiersDto, StandardBreakupDto } from './stage-billing.dto';

@ApiTags('stage billing')
@ApiBearerAuth()
@Controller('projects/:id/billing-breakup')
export class StageBillingController {
  constructor(private billing: StageBillingService) {}

  @ApiOperation({
    summary: "A lump-sum contract's billing break-up",
    description:
      'Item 129. Components with their share of the lump sum (parts with their share of the component), each paid in stages with what the evidence gives today ' +
      'and what approved bills took; unit-rate components; the milestone grid against what was billed; the slippage tiers; and anything that keeps the ' +
      'break-up from adding up. Billing roles.',
  })
  @Get()
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.breakup(user, id);
  }

  @ApiOperation({ summary: 'Make the standard break-up from the work breakdown', description: 'One component per component of the structure, stages by its kind. Those who prepare bills.' })
  @Post('standard')
  standard(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StandardBreakupDto) {
    return this.billing.applyStandard(user, id, dto);
  }

  @ApiOperation({ summary: 'Add or change a component', description: 'Those who prepare bills.' })
  @Put('components')
  saveComponent(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBillingComponentDto) {
    return this.billing.saveComponent(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a component', description: 'Not once one of its stages is on a bill.' })
  @Delete('components/:componentId')
  removeComponent(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('componentId', ParseUUIDPipe) componentId: string) {
    return this.billing.removeComponent(user, id, componentId);
  }

  @ApiOperation({ summary: 'Add or change a stage', description: 'Its %, what moves it (event, progress, supply, test) and the evidence it reads. Record an event here with its date.' })
  @Put('stages')
  saveStage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBillingStageDto) {
    return this.billing.saveStage(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove a stage', description: 'Not once it is on a bill.' })
  @Delete('stages/:stageId')
  removeStage(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('stageId', ParseUUIDPipe) stageId: string) {
    return this.billing.removeStage(user, id, stageId);
  }

  @ApiOperation({ summary: 'Set the lump sum, tender factor and advance window', description: 'Those who change contract terms.' })
  @Put('terms')
  terms(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BillingTermsDto) {
    return this.billing.saveTerms(user, id, dto);
  }

  @ApiOperation({ summary: 'Save the milestone grid', description: 'Cumulative targets by month for each component paid in stages; replaces the grid.' })
  @Put('grid')
  grid(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveMilestoneGridDto) {
    return this.billing.saveGrid(user, id, dto);
  }

  @ApiOperation({ summary: 'Propose the milestone grid from the schedule', description: 'Planned physical % at each month end from the activities\' planned dates. Nothing is saved.' })
  @Get('grid/proposal')
  propose(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.proposeGrid(user, id);
  }

  @ApiOperation({ summary: 'Set the slippage tiers', description: 'An empty list goes back to the defaults (2.5, 5, 7.5 and 10% by quarter behind).' })
  @Put('tiers')
  tiers(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveSlippageTiersDto) {
    return this.billing.saveTiers(user, id, dto);
  }
}
