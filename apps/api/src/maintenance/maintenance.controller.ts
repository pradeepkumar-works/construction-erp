import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { MaintenanceService } from './maintenance.service';
import {
  CloseJobDto,
  CreateDocumentDto,
  CreateDriverDto,
  CreateJobDto,
  IssueSparesDto,
  ListDocumentsQuery,
  ListDriversQuery,
  ListJobsQuery,
  SummaryQuery,
  UpdateDocumentDto,
  UpdateDriverDto,
  UpdateJobDto,
} from './maintenance.dto';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller()
export class MaintenanceController {
  constructor(private maintenance: MaintenanceService) {}

  @ApiOperation({ summary: 'Service due, papers and licences expiring within 30 days, open job cards and this month’s downtime and cost' })
  @Get('maintenance/summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: SummaryQuery) {
    return this.maintenance.summary(user, q.projectId);
  }

  @ApiOperation({ summary: 'Job cards', description: 'Open ones first. Site staff see those at their projects.' })
  @Get('maintenance/jobs')
  listJobs(@CurrentUser() user: RequestUser, @Query() q: ListJobsQuery) {
    return this.maintenance.listJobs(user, q);
  }

  @Get('maintenance/jobs/:id')
  getJob(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.getJob(user, id);
  }

  @ApiOperation({
    summary: 'Report a breakdown or raise a service job card',
    description: 'Breakdowns: anyone who logs machinery at the machine’s project; the store manager and approvers are told. Services: the store manager or an approver.',
  })
  @Post('maintenance/jobs')
  createJob(@CurrentUser() user: RequestUser, @Body() dto: CreateJobDto) {
    return this.maintenance.createJob(user, dto);
  }

  @ApiOperation({ summary: 'Change an open job card (whoever reported it, the store manager or an approver)' })
  @Patch('maintenance/jobs/:id')
  updateJob(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.maintenance.updateJob(user, id, dto);
  }

  @ApiOperation({ summary: 'Close a job card with the work done, downtime and cost', description: 'Closing a service restarts the machine’s service schedule from the closing date.' })
  @Post('maintenance/jobs/:id/close')
  closeJob(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CloseJobDto) {
    return this.maintenance.closeJob(user, id, dto);
  }

  @ApiOperation({ summary: 'Issue spares from the project store against an open job card', description: 'Recorded as a stock issue linked to the job; its value counts in the job’s cost.' })
  @Post('maintenance/jobs/:id/spares')
  issueSpares(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: IssueSparesDto) {
    return this.maintenance.issueSpares(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a wrong job card (no spares issued against it)' })
  @Delete('maintenance/jobs/:id')
  removeJob(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.removeJob(user, id);
  }

  @ApiOperation({ summary: 'Insurance, fitness, permit, PUC, road tax and RC of machines and vehicles', description: 'The latest paper of each type per machine unless `latestOnly=false`.' })
  @Get('equipment-documents')
  listDocuments(@CurrentUser() user: RequestUser, @Query() q: ListDocumentsQuery) {
    return this.maintenance.listDocuments(user, q);
  }

  @Get('equipment-documents/:id')
  getDocument(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.getDocument(user, id);
  }

  @ApiOperation({ summary: 'Add a paper or its renewal (store manager or approver)' })
  @Post('equipment-documents')
  createDocument(@CurrentUser() user: RequestUser, @Body() dto: CreateDocumentDto) {
    return this.maintenance.createDocument(user, dto);
  }

  @Patch('equipment-documents/:id')
  updateDocument(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.maintenance.updateDocument(user, id, dto);
  }

  @Delete('equipment-documents/:id')
  removeDocument(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.removeDocument(user, id);
  }

  @ApiOperation({ summary: 'Drivers and operators with their licence' })
  @Get('drivers')
  listDrivers(@CurrentUser() user: RequestUser, @Query() q: ListDriversQuery) {
    return this.maintenance.listDrivers(user, q);
  }

  @Get('drivers/:id')
  getDriver(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.getDriver(user, id);
  }

  @ApiOperation({ summary: 'Add a driver (store manager or approver)' })
  @Post('drivers')
  createDriver(@CurrentUser() user: RequestUser, @Body() dto: CreateDriverDto) {
    return this.maintenance.createDriver(user, dto);
  }

  @Patch('drivers/:id')
  updateDriver(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.maintenance.updateDriver(user, id, dto);
  }

  @Delete('drivers/:id')
  removeDriver(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.maintenance.removeDriver(user, id);
  }
}
