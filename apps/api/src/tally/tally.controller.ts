import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TallyService } from './tally.service';
import { TallyRangeQuery, UpdateTallySettingsDto } from './tally.dto';

@ApiTags('tally')
@ApiBearerAuth()
@Controller('tally')
export class TallyController {
  constructor(private tally: TallyService) {}

  @ApiOperation({ summary: 'Tally company, GST state, cost centres and the Tally ledger for each account' })
  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.tally.settings(user);
  }

  @ApiOperation({ summary: 'Change the Tally settings or ledger names', description: 'Admin, management and accounts.' })
  @Put('settings')
  saveSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateTallySettingsDto) {
    return this.tally.saveSettings(user, dto);
  }

  @ApiOperation({ summary: 'Ledger masters and project cost centres as TallyPrime XML, to import once before the first vouchers' })
  @ApiProduces('application/xml')
  @Get('masters.xml')
  @Header('content-type', 'application/xml; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="nirmaan-tally-masters.xml"')
  masters(@CurrentUser() user: RequestUser) {
    return this.tally.mastersXml(user);
  }

  @ApiOperation({
    summary: 'Vouchers waiting to go to Tally',
    description:
      'Certified RA bills, receipts, approved vendor and subcontractor bills, payments to vendors and approved site expenses dated up to `upTo` and not yet exported, ' +
      'with their ledger entries; records that cannot go yet are listed with the reason.',
  })
  @Get('preview')
  preview(@CurrentUser() user: RequestUser, @Query() q: TallyRangeQuery) {
    return this.tally.preview(user, q);
  }

  @ApiOperation({ summary: 'Past exports, newest first' })
  @Get('exports')
  list(@CurrentUser() user: RequestUser) {
    return this.tally.listExports(user);
  }

  @ApiOperation({ summary: 'Export the waiting vouchers and mark them exported', description: 'Download the XML with GET /tally/exports/:id/xml and import it in TallyPrime (Import → Transactions).' })
  @Post('exports')
  create(@CurrentUser() user: RequestUser, @Body() q: TallyRangeQuery) {
    return this.tally.createExport(user, q);
  }

  @ApiProduces('application/xml')
  @Get('exports/:id/xml')
  async xml(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() res: Response) {
    const { xml, fileName } = await this.tally.exportXml(user, id);
    res.setHeader('content-type', 'application/xml; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  }

  @ApiOperation({ summary: 'Undo an export Tally did not take: its records wait for the next export again' })
  @Delete('exports/:id')
  undo(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tally.undoExport(user, id);
  }
}
