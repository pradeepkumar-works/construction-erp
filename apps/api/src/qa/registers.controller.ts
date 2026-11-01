import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QaRegistersService } from './registers.service';
import { CertificateCategoriesDto, InstrumentsQuery, LabSamplesQuery, RecordCalibrationDto, SaveInstrumentDto, SaveLabDto } from './registers.dto';

/** QA/QC registers: labs and samples sent out, the calibration register and test certificates. */
@ApiTags('qa')
@ApiBearerAuth()
@Controller('qa')
export class QaRegistersController {
  constructor(private registers: QaRegistersService) {}

  @ApiOperation({ summary: 'The labs tests go to: site labs, NABL labs with their accreditation, group company labs, others; with samples at each' })
  @Get('labs')
  labs(@CurrentUser() user: RequestUser) {
    return this.registers.labs(user);
  }

  @ApiOperation({ summary: 'Add a lab (QA/QC, a project manager, management or an admin)' })
  @Post('labs')
  addLab(@CurrentUser() user: RequestUser, @Body() dto: SaveLabDto) {
    return this.registers.saveLab(user, null, dto);
  }

  @ApiOperation({ summary: 'Change a lab' })
  @Put('labs/:id')
  saveLab(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLabDto) {
    return this.registers.saveLab(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a lab nothing was sent to, or switch off one that has samples or instruments' })
  @Delete('labs/:id')
  removeLab(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.removeLab(user, id);
  }

  @ApiOperation({ summary: 'Samples sent to labs: waiting for their report (longest wait first), then reported, with the charges' })
  @Get('samples')
  samples(@CurrentUser() user: RequestUser, @Query() q: LabSamplesQuery) {
    return this.registers.samples(user, q);
  }

  @ApiOperation({ summary: 'The calibration register: instruments by where they stand (overdue, out of use, never calibrated, due soon, calibrated)' })
  @Get('instruments')
  instruments(@CurrentUser() user: RequestUser, @Query() q: InstrumentsQuery) {
    return this.registers.instruments(user, q);
  }

  @ApiOperation({ summary: 'One instrument with its calibrations' })
  @Get('instruments/:id')
  instrument(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.instrument(user, id);
  }

  @ApiOperation({ summary: 'Add an instrument to the calibration register' })
  @Post('instruments')
  addInstrument(@CurrentUser() user: RequestUser, @Body() dto: SaveInstrumentDto) {
    return this.registers.saveInstrument(user, null, dto);
  }

  @ApiOperation({ summary: 'Change an instrument; a new interval counts from its next calibration' })
  @Put('instruments/:id')
  saveInstrument(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveInstrumentDto) {
    return this.registers.saveInstrument(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an instrument never calibrated or used, or switch it off' })
  @Delete('instruments/:id')
  removeInstrument(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.removeInstrument(user, id);
  }

  @ApiOperation({ summary: 'Record a calibration with its certificate; the latest sets the next due day (a failed one takes the instrument out of use)' })
  @Post('instruments/:id/calibrations')
  calibrate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordCalibrationDto) {
    return this.registers.recordCalibration(user, id, dto);
  }

  @ApiOperation({ summary: "The item categories whose receipts need the maker's test certificate" })
  @Get('certificate-categories')
  certificateCategories(@CurrentUser() user: RequestUser) {
    return this.registers.certificateCategories(user);
  }

  @ApiOperation({ summary: "Choose the item categories whose receipts need the maker's test certificate" })
  @Put('certificate-categories')
  saveCertificateCategories(@CurrentUser() user: RequestUser, @Body() dto: CertificateCategoriesDto) {
    return this.registers.saveCertificateCategories(user, dto);
  }

  @ApiOperation({ summary: "Receipts whose items need the maker's test certificate and have none" })
  @Get('certificates-missing')
  certificatesMissing(@CurrentUser() user: RequestUser, @Query('projectId', new ParseUUIDPipe({ optional: true })) projectId?: string) {
    return this.registers.certificatesMissing(user, projectId);
  }
}
