import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ScEnquiriesService } from './sc-enquiries.service';
import { AwardDto, CreateScEnquiryDto, InviteDto, ScEnquiryQuery, ScQuoteDto, ScStatusDto, UpdateScEnquiryDto } from './sc-enquiries.dto';

/** Subcontract enquiries (v6 item 111): quotes from several subcontractors, compared, and the chosen one made a work order. */
@ApiTags('subcontracts')
@ApiBearerAuth()
@Controller('subcontract-enquiries')
export class ScEnquiriesController {
  constructor(private enquiries: ScEnquiriesService) {}

  @ApiOperation({ summary: 'Subcontract enquiries: open ones (the default), awarded, cancelled or all, with the year’s figures' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ScEnquiryQuery) {
    return this.enquiries.list(user, q);
  }

  @ApiOperation({ summary: 'An enquiry with its items, quotes and comparative statement' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enquiries.get(user, id);
  }

  @ApiOperation({ summary: 'Ask subcontractors to quote on chosen BOQ items or the enquiry’s own items' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateScEnquiryDto) {
    return this.enquiries.create(user, dto);
  }

  @ApiOperation({ summary: 'Change an open enquiry; its items only before any quote is in' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScEnquiryDto) {
    return this.enquiries.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an enquiry that did not become a work order' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.enquiries.remove(user, id);
  }

  @ApiOperation({ summary: 'Ask more subcontractors to quote' })
  @Post(':id/quotes')
  invite(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteDto) {
    return this.enquiries.invite(user, id, dto);
  }

  @ApiOperation({ summary: 'Enter or correct a subcontractor’s quote: their rate for each item, GST on top' })
  @Put(':id/quotes/:quoteId')
  saveQuote(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('quoteId', ParseUUIDPipe) quoteId: string, @Body() dto: ScQuoteDto) {
    return this.enquiries.saveQuote(user, id, quoteId, dto);
  }

  @ApiOperation({ summary: 'Take a subcontractor off an open enquiry, with their quote' })
  @Delete(':id/quotes/:quoteId')
  removeQuote(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('quoteId', ParseUUIDPipe) quoteId: string) {
    return this.enquiries.removeQuote(user, id, quoteId);
  }

  @ApiOperation({ summary: 'Award a complete quote: it becomes a draft work order at its rates', description: 'A quote that is not the lowest needs a note saying why.' })
  @Post(':id/award')
  award(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AwardDto) {
    return this.enquiries.award(user, id, dto);
  }

  @ApiOperation({ summary: 'Cancel an open enquiry with the reason, or reopen one' })
  @Post(':id/status')
  setStatus(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScStatusDto) {
    return this.enquiries.setStatus(user, id, dto);
  }
}
