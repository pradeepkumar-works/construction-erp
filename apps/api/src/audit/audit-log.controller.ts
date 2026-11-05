import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ListAuditLogQuery } from './audit-log.dto';
import { AuditLogService } from './audit-log.service';

@ApiTags('audit-log')
@Controller('audit-log')
export class AuditLogController {
  constructor(private log: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: "The company's audit log", description: 'Every line any module wrote, newest first, with the kinds of record in it. Admin only.' })
  list(@CurrentUser() user: RequestUser, @Query() q: ListAuditLogQuery) {
    return this.log.list(user, q);
  }
}
