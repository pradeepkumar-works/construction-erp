import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TdsService } from './tds.service';
import { ConfirmSectionDto, CreateCertificateDto, FileReturnDto, QuarterQuery, RecordChallanDto, ReopenReturnDto, StatementQuery, SuggestQuery } from './tds.dto';

/**
 * TDS returns (26Q and 24Q): a quarter's deductions, challans and what blocks filing, the certificates for lower
 * deduction and the statement printed for a deductee. Admin, management and accounts (`canFileTds`), every route.
 * Not behind the books switch: TDS is filed whether or not the company keeps its books here.
 */
@ApiTags('tds')
@ApiBearerAuth()
@Controller('tds')
export class TdsController {
  constructor(private tds: TdsService) {}

  @ApiOperation({ summary: "A quarter's return: deductions, challans, deductees, totals by section, what blocks filing, fee and interest" })
  @Get('quarter')
  quarter(@CurrentUser() user: RequestUser, @Query() q: QuarterQuery) {
    return this.tds.quarter(user, q.form, q.periodFrom);
  }

  @ApiOperation({ summary: 'The rate and TDS a payment form suggests for a vendor, a section, an amount and a day' })
  @Get('suggest')
  suggest(@CurrentUser() user: RequestUser, @Query() q: SuggestQuery) {
    return this.tds.suggest(user, q);
  }

  @ApiOperation({ summary: "One deductee's deductions in a quarter, for the statement printed as Form 16A or 16" })
  @Get('statement')
  statement(@CurrentUser() user: RequestUser, @Query() q: StatementQuery) {
    return this.tds.statement(user, q);
  }

  @ApiOperation({ summary: 'Record a challan (ITNS 281) covering chosen deductions of one return; its tax is their sum' })
  @Post('challans')
  recordChallan(@CurrentUser() user: RequestUser, @Body() dto: RecordChallanDto) {
    return this.tds.recordChallan(user, dto);
  }

  @ApiOperation({ summary: 'A challan with the deductions it covers' })
  @Get('challans/:id')
  challan(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tds.challan(user, id);
  }

  @ApiOperation({ summary: 'Delete a challan entered wrongly, freeing its deductions; refused once its quarter is filed or it is in Tally' })
  @Delete('challans/:id')
  deleteChallan(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tds.deleteChallan(user, id);
  }

  @ApiOperation({ summary: 'Mark a quarter filed with its provisional receipt; refused while anything blocks filing' })
  @Post('returns')
  fileReturn(@CurrentUser() user: RequestUser, @Body() dto: FileReturnDto) {
    return this.tds.fileReturn(user, dto);
  }

  @ApiOperation({ summary: 'Reopen a filed quarter for a correction; filing it again counts the correction' })
  @Post('returns/reopen')
  reopenReturn(@CurrentUser() user: RequestUser, @Body() dto: ReopenReturnDto) {
    return this.tds.reopenReturn(user, dto);
  }

  @ApiOperation({ summary: "Confirm a deduction's section (and its base), for one made before sections were kept" })
  @Patch('deductions/:id')
  confirmSection(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmSectionDto) {
    return this.tds.confirmSection(user, id, dto);
  }

  @ApiOperation({ summary: 'Lower deduction certificates under section 197, newest first' })
  @Get('certificates')
  certificates(@CurrentUser() user: RequestUser) {
    return this.tds.certificates(user);
  }

  @ApiOperation({ summary: 'Record a lower deduction certificate for a vendor and a section' })
  @Post('certificates')
  addCertificate(@CurrentUser() user: RequestUser, @Body() dto: CreateCertificateDto) {
    return this.tds.addCertificate(user, dto);
  }

  @ApiOperation({ summary: 'Remove a certificate recorded wrongly' })
  @Delete('certificates/:id')
  removeCertificate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tds.removeCertificate(user, id);
  }
}
