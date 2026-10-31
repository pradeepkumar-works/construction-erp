import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { DebitNotesService } from './debit-notes.service';
import { CancelDebitNoteDto, CreateDebitNoteDto, ListDebitNotesQuery } from './payables.dto';

@ApiTags('payables')
@ApiBearerAuth()
@Controller('debit-notes')
export class DebitNotesController {
  constructor(private notes: DebitNotesService) {}

  @ApiOperation({ summary: 'Debit notes (paged)', description: 'What was taken off approved vendor and subcontract bills. Cancelled notes only with includeCancelled.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListDebitNotesQuery) {
    return this.notes.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.get(user, id);
  }

  @ApiOperation({
    summary: 'Raise a debit note against an approved bill',
    description:
      'Numbered DN-<year>-0001. Lines are quantity × rate or a lump sum, with GST. At most what is still unpaid on the bill; the bill payable drops by the note, the GST registers reverse its input tax and Tally gets a debit note voucher.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDebitNoteDto) {
    return this.notes.create(user, dto);
  }

  @ApiOperation({ summary: 'Cancel a debit note', description: 'The bill owes its amount again. Not while the note is in a Tally export.' })
  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDebitNoteDto) {
    return this.notes.cancel(user, id, dto);
  }
}
