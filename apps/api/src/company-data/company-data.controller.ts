import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/decorators';
import { CronGuard } from '../notifications/cron.guard';
import { JobQuery } from '../notifications/notifications.dto';
import { CompanyDataService } from './company-data.service';
import { ExportPageQuery, RequestDeletionDto } from './company-data.dto';

/** Data export and company deletion (admins). */
@ApiTags('company-data')
@ApiBearerAuth()
@Controller('company-data')
export class CompanyDataController {
  constructor(private data: CompanyDataService) {}

  @ApiOperation({ summary: 'What a full export contains: tables with row counts, and the number and size of stored files' })
  @Get('export')
  manifest(@CurrentUser() user: RequestUser) {
    return this.data.manifest(user);
  }

  @ApiOperation({ summary: 'Record in the audit log that an admin downloaded all company data' })
  @HttpCode(200)
  @Post('export/log')
  logExport(@CurrentUser() user: RequestUser) {
    return this.data.logExport(user);
  }

  @ApiOperation({ summary: 'A page of the stored files with where to fetch each and the folder it goes in' })
  @Get('export/files')
  files(@CurrentUser() user: RequestUser, @Query() q: ExportPageQuery) {
    return this.data.files(user, q.page ?? 1, q.pageSize ?? 1000);
  }

  @ApiOperation({ summary: 'A page of one table as columns and rows' })
  @Get('export/tables/:name')
  table(@CurrentUser() user: RequestUser, @Param('name') name: string, @Query() q: ExportPageQuery) {
    return this.data.table(user, name, q.page ?? 1, q.pageSize ?? 1000);
  }

  @ApiOperation({ summary: 'Whether the company is set to be deleted, and when' })
  @Get('deletion')
  deletion(@CurrentUser() user: RequestUser) {
    return this.data.deletion(user);
  }

  @ApiOperation({ summary: 'Ask for the company and all its data to be erased after the grace period (admins are emailed)' })
  @HttpCode(200)
  @Post('deletion')
  requestDeletion(@CurrentUser() user: RequestUser, @Body() dto: RequestDeletionDto) {
    return this.data.requestDeletion(user, dto.companyName);
  }

  @ApiOperation({ summary: 'Cancel a pending deletion' })
  @Delete('deletion')
  cancelDeletion(@CurrentUser() user: RequestUser) {
    return this.data.cancelDeletion(user);
  }

  @Public()
  @UseGuards(CronGuard)
  @ApiSecurity('cron')
  @ApiOperation({ summary: 'Erase the companies whose deletion date has come (also run with the daily digest). Auth: Authorization: Bearer <CRON_SECRET>.' })
  @Get('jobs/purge')
  purge(@Query() q: JobQuery) {
    return this.data.purgeDue(q.date);
  }
}
