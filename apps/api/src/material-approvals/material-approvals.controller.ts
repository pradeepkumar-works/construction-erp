import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { MaterialApprovalsService } from './material-approvals.service';
import {
  ApprovedMakeQuery,
  CreateApprovedMakeDto,
  CreateMaterialApprovalDto,
  MakeCheckDto,
  MaterialApprovalQuery,
  ReviewMaterialApprovalDto,
  SubmitMaterialApprovalDto,
  UpdateMaterialApprovalDto,
  WithdrawMaterialApprovalDto,
} from './material-approvals.dto';
import { ModuleSwitch } from '../common/decorators';

/** Material approvals: requests to approve a make or a sample, and each project's approved makes. */
@ApiTags('material-approvals')
@ApiBearerAuth()
@ModuleSwitch('material_approvals')
@Controller('material-approvals')
export class MaterialApprovalsController {
  constructor(private approvals: MaterialApprovalsService) {}

  @ApiOperation({ summary: 'Requests on the caller’s projects: open ones first (the default), with the figures for the list' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: MaterialApprovalQuery) {
    return this.approvals.list(user, q);
  }

  @ApiOperation({ summary: 'The approved makes of the caller’s projects, from the contract or approved on request' })
  @Get('makes')
  makes(@CurrentUser() user: RequestUser, @Query() q: ApprovedMakeQuery) {
    return this.approvals.makes(user, q);
  }

  @ApiOperation({ summary: 'List a make from the contract as approved for a material' })
  @Post('makes')
  addMake(@CurrentUser() user: RequestUser, @Body() dto: CreateApprovedMakeDto) {
    return this.approvals.addMake(user, dto);
  }

  @ApiOperation({ summary: 'Take a contract make off the list (one approved on request goes with its request)' })
  @Delete('makes/:makeId')
  removeMake(@CurrentUser() user: RequestUser, @Param('makeId', ParseUUIDPipe) makeId: string) {
    return this.approvals.removeMake(user, makeId);
  }

  @ApiOperation({ summary: 'Check purchase order lines against the project’s approved makes' })
  @Post('make-check')
  makeCheck(@CurrentUser() user: RequestUser, @Body() dto: MakeCheckDto) {
    return this.approvals.makeCheck(user, dto);
  }

  @ApiOperation({ summary: 'A request with its revisions, outcomes and files' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.get(user, id);
  }

  @ApiOperation({ summary: 'Raise a request (a draft until it is submitted)' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMaterialApprovalDto) {
    return this.approvals.create(user, dto);
  }

  @ApiOperation({ summary: 'Change a draft, or the reply-by date of a request under review' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialApprovalDto) {
    return this.approvals.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a draft' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.remove(user, id);
  }

  @ApiOperation({ summary: 'Submit to the reviewer: R0 from draft, or the next revision after revise or reject' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitMaterialApprovalDto) {
    return this.approvals.submit(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the reviewer’s outcome; an approval puts the make on the project’s approved makes' })
  @Post(':id/review')
  review(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewMaterialApprovalDto) {
    return this.approvals.review(user, id, dto);
  }

  @ApiOperation({ summary: 'Withdraw a request that is not yet approved' })
  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawMaterialApprovalDto) {
    return this.approvals.withdraw(user, id, dto);
  }
}
