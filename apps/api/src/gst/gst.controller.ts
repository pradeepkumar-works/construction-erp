import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GstService } from './gst.service';
import { EinvoiceService } from './einvoice.service';
import { GstRangeQuery } from './gst.dto';
import { CancelGstDocumentDto, ExtendEwayBillDto, GenerateGstDocumentDto, GstSourceParams } from './einvoice.dto';

@ApiTags('gst')
@ApiBearerAuth()
@Controller('gst')
export class GstController {
  constructor(
    private gst: GstService,
    private einvoices: EinvoiceService,
  ) {}

  @ApiOperation({
    summary: 'GST registers for a period',
    description:
      'Outward supplies from approved RA bills (GSTR-1: B2B to registered clients, B2CS otherwise) and input tax from approved vendor bills, ' +
      'subcontractor bills and site expenses, one row per invoice and rate (GSTR-2B layout). Admin, management and accounts.',
  })
  @Get('registers')
  registers(@CurrentUser() user: RequestUser, @Query() q: GstRangeQuery) {
    return this.gst.registers(user, q);
  }

  @ApiOperation({
    summary: "A record's e-invoice or e-way bill",
    description:
      'RA_BILL and RMC_INVOICE get an IRN, RMC_BATCH and STOCK_TRANSFER an e-way bill. Whether one is offered and needed, what the record lacks, ' +
      'the live document (number, ack, validity, QR) and the earlier ones. Whoever may see the record.',
  })
  @Get('sources/:sourceKind/:sourceId')
  state(@CurrentUser() user: RequestUser, @Param() p: GstSourceParams) {
    return this.einvoices.state(user, p.sourceKind, p.sourceId);
  }

  @ApiOperation({
    summary: "Make a record's IRN or e-way bill",
    description:
      'Refused with every problem before anything is written. The same payload returns the document already made; the IRP\'s duplicate answer is ' +
      'taken as made. An e-way bill takes the transport mode, vehicle and distance. IRNs: admin, management and accounts; e-way bills: those and the stock keepers.',
  })
  @Post('sources/:sourceKind/:sourceId/generate')
  generate(@CurrentUser() user: RequestUser, @Param() p: GstSourceParams, @Body() dto: GenerateGstDocumentDto) {
    return this.einvoices.generate(user, p.sourceKind, p.sourceId, dto);
  }

  @ApiOperation({ summary: 'Cancel an IRN or e-way bill', description: 'Within 24 hours of it being made; after that an IRN is undone by a credit note.' })
  @Post('documents/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelGstDocumentDto) {
    return this.einvoices.cancel(user, id, dto);
  }

  @ApiOperation({ summary: "Extend an e-way bill's validity", description: 'From 8 hours before it runs out to 8 hours after, for the distance left.' })
  @Post('documents/:id/extend')
  extend(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendEwayBillDto) {
    return this.einvoices.extend(user, id, dto);
  }
}
