import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PaymentBatchesService } from './payment-batches.service';
import { AddBatchLinesDto, CreatePaymentBatchDto, ImportUtrsDto, UpdatePaymentBatchDto } from './payment-batches.dto';

/** Bank payments: approved payment requests paid in one bank upload, and the UTRs read back. Admin, management and accounts. */
@ApiTags('payment-batches')
@ApiBearerAuth()
@Controller('payment-batches')
export class PaymentBatchesController {
  constructor(private batches: PaymentBatchesService) {}

  @ApiOperation({ summary: 'Batches, newest first, with what each pays and how many payments have their UTR' })
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.batches.list(user);
  }

  @ApiOperation({ summary: 'Approved payment requests with something left to pay, and the open batch each is in' })
  @Get('requests')
  payable(@CurrentUser() user: RequestUser) {
    return this.batches.payable(user);
  }

  @ApiOperation({ summary: 'Start a draft batch: the account the bank debits and the bank’s file layout' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentBatchDto) {
    return this.batches.create(user, dto);
  }

  @ApiOperation({ summary: 'A batch with its lines: each request, its amount, NEFT or RTGS, and its UTR or why it is left out' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentBatchDto) {
    return this.batches.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a draft batch' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.remove(user, id);
  }

  @ApiOperation({ summary: 'Add approved payment requests to a draft; one already in another open batch is refused' })
  @Post(':id/lines')
  addLines(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBatchLinesDto) {
    return this.batches.addLines(user, id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.batches.removeLine(user, id, lineId);
  }

  @ApiOperation({
    summary: 'Make the bank file and record its payments',
    description: 'One vendor payment per line, without a UTR yet, through the same checks as a payment recorded by hand. A vendor without an account or IFSC is left out.',
  })
  @Post(':id/export')
  exportFile(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.exportFile(user, id);
  }

  @ApiOperation({ summary: 'Undo an export the bank has not acted on: its payments come off and the batch is a draft again' })
  @Post(':id/undo-export')
  undoExport(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.undoExport(user, id);
  }

  @ApiOperation({ summary: 'The bank file as export made it' })
  @Get(':id/file')
  file(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.file(user, id);
  }

  @ApiOperation({ summary: "Read the bank's UTRs onto the payments; the batch is settled once every payment has one" })
  @Post(':id/utrs')
  importUtrs(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportUtrsDto) {
    return this.batches.importUtrs(user, id, dto.cells);
  }
}
