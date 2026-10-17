import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, PipeTransform, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CHECK_KINDS, type CheckKind } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { BillChecksService } from './bill-checks.service';
import { AcceptCheckDto, DraftVendorBillDto, ReopenCheckDto } from './bill-checks.dto';

class KindPipe implements PipeTransform<string, CheckKind> {
  transform(v: string): CheckKind {
    if (!(CHECK_KINDS as readonly string[]).includes(v)) throw new BadRequestException(`Checks are for ${CHECK_KINDS.join(', ')}`);
    return v as CheckKind;
  }
}
const kindParam = { name: 'kind', enum: CHECK_KINDS };

@ApiTags('checks')
@ApiBearerAuth()
@Controller('checks')
export class BillChecksController {
  constructor(private checks: BillChecksService) {}

  @ApiOperation({ summary: 'Checks on a vendor bill before it is saved', description: 'The same rules as a saved bill, on a draft filled from a scanned invoice; nothing is saved.' })
  @Post('vendor-bill/preview')
  preview(@CurrentUser() user: RequestUser, @Body() dto: DraftVendorBillDto) {
    return this.checks.previewVendorBill(user, dto);
  }

  @ApiOperation({
    summary: "A bill's checks before approval",
    description:
      'Rules over a vendor bill (against the PO and GRNs), a subcontract bill (work order, measurement book), an RA bill (BOQ, measurement book, earlier bills) or an expense (GST, GSTIN, cash limit, filed before): a tick per rule that passes, a flag per finding, with any acceptance. `aiSummaryPending` means the model\'s one-line summary can be fetched from `/summary`.',
  })
  @ApiParam(kindParam)
  @Get(':kind/:id')
  get(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: CheckKind, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.get(user, kind, id);
  }

  @ApiOperation({ summary: "The one-line summary of a bill's open flags", description: 'Written by the model once per set of open flags when Ask Nirmaan is on for the company (counted in its monthly allowance), else by the rules.' })
  @ApiParam(kindParam)
  @Get(':kind/:id/summary')
  summary(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: CheckKind, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.summary(user, kind, id);
  }

  @ApiOperation({ summary: 'Accept a flag with a note', description: 'By someone who may approve the bill, while it waits for approval. Audited.' })
  @ApiParam(kindParam)
  @Post(':kind/:id/accept')
  accept(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: CheckKind, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptCheckDto) {
    return this.checks.accept(user, kind, id, dto.key, dto.note);
  }

  @ApiOperation({ summary: 'Take back the acceptance of a flag', description: 'By someone who may approve the bill, while it waits for approval. Audited.' })
  @ApiParam(kindParam)
  @Post(':kind/:id/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('kind', KindPipe) kind: CheckKind, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReopenCheckDto) {
    return this.checks.unaccept(user, kind, id, dto.key);
  }
}
