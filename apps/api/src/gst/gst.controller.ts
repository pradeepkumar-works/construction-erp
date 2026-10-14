import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GstService } from './gst.service';
import { GstRangeQuery } from './gst.dto';

@ApiTags('gst')
@ApiBearerAuth()
@Controller('gst')
export class GstController {
  constructor(private gst: GstService) {}

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
}
