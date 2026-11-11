import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { LabourComplianceService } from './labour-compliance.service';
import { CreateLabourChallanDto, CreateLabourPaperDto, LabourRegisterQuery, ReleaseLabourHoldDto, UpdateLabourChallanDto, UpdateLabourPaperDto } from './labour-compliance.dto';

@ApiTags('labour-compliance')
@ApiBearerAuth()
@Controller()
export class LabourComplianceController {
  constructor(private labour: LabourComplianceService) {}

  @ApiOperation({
    summary: 'Contractors with men on the sites you see, what each has not shown, and their papers and challans',
    description: 'Judged as of today over the head counts of the last `months` months (6 by default).',
  })
  @Get('labour-compliance')
  register(@CurrentUser() user: RequestUser, @Query() q: LabourRegisterQuery) {
    return this.labour.register(user, q);
  }

  @ApiOperation({ summary: 'Record a labour licence, PF or ESI code, workmen’s compensation policy or BOCW registration' })
  @Post('labour-papers')
  createPaper(@CurrentUser() user: RequestUser, @Body() dto: CreateLabourPaperDto) {
    return this.labour.createPaper(user, dto);
  }

  @ApiOperation({ summary: 'Correct a paper; null clears a field' })
  @Patch('labour-papers/:id')
  updatePaper(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLabourPaperDto) {
    return this.labour.updatePaper(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a paper recorded by mistake' })
  @Delete('labour-papers/:id')
  removePaper(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.labour.removePaper(user, id);
  }

  @ApiOperation({ summary: 'Record a contractor’s PF or ESI challan for a wage month' })
  @Post('labour-challans')
  createChallan(@CurrentUser() user: RequestUser, @Body() dto: CreateLabourChallanDto) {
    return this.labour.createChallan(user, dto);
  }

  @ApiOperation({ summary: 'Correct a challan' })
  @Patch('labour-challans/:id')
  updateChallan(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLabourChallanDto) {
    return this.labour.updateChallan(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a challan recorded by mistake' })
  @Delete('labour-challans/:id')
  removeChallan(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.labour.removeChallan(user, id);
  }

  @ApiOperation({ summary: 'Pay an approved subcontractor bill although labour papers are missing', description: 'Admin and management, with the reason; kept on the bill and in its history.' })
  @Post('subcontract-bills/:id/release-labour-hold')
  releaseHold(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReleaseLabourHoldDto) {
    return this.labour.releaseHold(user, id, dto.note);
  }
}
