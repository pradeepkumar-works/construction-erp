import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { RaBillsService } from './ra-bills.service';
import { BillDateDto, BillPriceVariationDto, CertifyBillDto, CreateRaBillDto, ListRaBillsQuery, UpdateRaBillDto } from './ra-bills.dto';
import { ClaimStageDto } from '../stage-billing/stage-billing.dto';

@ApiTags('ra-bills')
@ApiBearerAuth()
@Controller('ra-bills')
export class RaBillsController {
  constructor(private bills: RaBillsService) {}

  @ApiOperation({ summary: 'RA bills (paged)', description: 'Billing roles, and roles the approval matrix lets approve bills.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListRaBillsQuery) {
    return this.bills.list(user, q);
  }

  @ApiOperation({ summary: 'An RA bill with its abstract, deductions and the measurements it bills' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.bills.get(user, id);
  }

  @ApiOperation({
    summary: 'Prepare the next RA bill of a project',
    description:
      'Takes the approved measurements dated up to `measuredUpTo` that no earlier bill took, priced at the BOQ rates, with GST and the ' +
      'contract deductions. On a lump-sum project with a billing break-up it takes each stage\'s % from its evidence at that date, ' +
      'measures only the unit-rate items (at rate × the tender factor) and withholds for milestone slippage. Refused while another bill of the ' +
      'project is not approved. Saved as a draft unless `submit: true`.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateRaBillDto) {
    return this.bills.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a bill that is not approved', description: 'Re-takes the measurements and re-prices the bill. `submit: true` submits it.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateRaBillDto) {
    return this.bills.update(user, id, dto);
  }

  @ApiOperation({
    summary: "Set a bill's price variation",
    description:
      "This bill's index for each component of the contract's price variation formula, while the bill is not approved. Amount per component = " +
      'work value × share % × (current − base) / base; GST and the deductions are then on work value + price variation. No indices clears it.',
  })
  @Put(':id/price-variation')
  setPriceVariation(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: BillPriceVariationDto) {
    return this.bills.setPriceVariation(user, id, dto);
  }

  @ApiOperation({
    summary: "Claim a stage of a lump-sum bill by hand",
    description:
      'Item 129. While the bill is not approved: this bill\'s % of the stage, less than its evidence gives, or more with a `note` saying why. An empty `pct` ' +
      'goes back to the evidence. The bill is re-priced.',
  })
  @Put(':id/stages/:stageId')
  claimStage(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('stageId', ParseUUIDPipe) stageId: string, @Body() dto: ClaimStageDto) {
    return this.bills.claimStage(user, id, stageId, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a bill for approval', description: 'Measurements approved since the bill was prepared are taken in first.' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.bills.submit(user, id);
  }

  @ApiOperation({ summary: 'Record an approved bill as sent to the client' })
  @Post(':id/send')
  send(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: BillDateDto) {
    return this.bills.send(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the client’s certificate', description: 'List only the items the client cut; the rest pass as claimed. Can be repeated to correct it.' })
  @Post(':id/certify')
  certify(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CertifyBillDto) {
    return this.bills.certify(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a bill that is not approved', description: 'Its measurements become billable again.' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.bills.remove(user, id);
  }
}
