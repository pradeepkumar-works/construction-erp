import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StaffService } from './staff.service';
import {
  ApplyLeaveDto,
  AttendanceQuery,
  BalanceQuery,
  CheckInDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  DecideLeaveDto,
  HolidayQuery,
  ListEmployeesQuery,
  ListLeaveQuery,
  RegisterQuery,
  RejectLeaveDto,
  SaveRegisterDto,
  UpdateEmployeeDto,
  UsersQuery,
} from './staff.dto';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private staff: StaffService) {}

  @ApiOperation({ summary: 'Counts for the Staff page: leave waiting on the caller, employees, on leave today' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.staff.summary(user);
  }

  @ApiOperation({ summary: "The caller's own staff record: today's attendance, leave balances, requests and coming holidays" })
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.staff.me(user);
  }

  @ApiOperation({ summary: 'Check in for today (at their posting unless a project is given)' })
  @Post('me/check-in')
  checkIn(@CurrentUser() user: RequestUser, @Body() dto: CheckInDto) {
    return this.staff.checkIn(user, dto);
  }

  @ApiOperation({ summary: 'Check out: time past a 9-hour day is overtime, in half hours' })
  @Post('me/check-out')
  checkOut(@CurrentUser() user: RequestUser) {
    return this.staff.checkOut(user);
  }

  /* employees */

  @ApiOperation({ summary: 'Employees: HR, management and admins see everyone; attendance recorders see the staff posted at their projects' })
  @Get('employees')
  listEmployees(@CurrentUser() user: RequestUser, @Query() q: ListEmployeesQuery) {
    return this.staff.listEmployees(user, q);
  }

  @ApiOperation({ summary: 'Logins that can be linked to a staff record' })
  @Get('users')
  users(@CurrentUser() user: RequestUser, @Query() q: UsersQuery) {
    return this.staff.linkableUsers(user, q.employeeId);
  }

  @Get('employees/:id')
  getEmployee(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.getEmployee(user, id);
  }

  @Get('employees/:id/history')
  employeeHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.employeeHistory(user, id);
  }

  @Post('employees')
  createEmployee(@CurrentUser() user: RequestUser, @Body() dto: CreateEmployeeDto) {
    return this.staff.createEmployee(user, dto);
  }

  @ApiOperation({ summary: 'Change a staff record; setting the last working day marks them as left (records are never deleted)' })
  @Patch('employees/:id')
  updateEmployee(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.staff.updateEmployee(user, id, dto);
  }

  /* attendance */

  @ApiOperation({ summary: "A site's staff register for a day, with leave and holidays" })
  @Get('register')
  register(@CurrentUser() user: RequestUser, @Query() q: RegisterQuery) {
    return this.staff.register(user, q.projectId, q.date);
  }

  @ApiOperation({ summary: 'Mark the register: each entry sets or clears one employee’s day' })
  @Put('register')
  saveRegister(@CurrentUser() user: RequestUser, @Body() dto: SaveRegisterDto) {
    return this.staff.saveRegister(user, dto);
  }

  @ApiOperation({ summary: "One employee's attendance between two dates (at most two months)" })
  @Get('attendance')
  attendance(@CurrentUser() user: RequestUser, @Query() q: AttendanceQuery) {
    return this.staff.attendance(user, q);
  }

  /* leave */

  @Get('leave')
  listLeave(@CurrentUser() user: RequestUser, @Query() q: ListLeaveQuery) {
    return this.staff.listLeave(user, q);
  }

  @ApiOperation({ summary: 'Leave balances for a year (the caller’s own by default)' })
  @Get('leave/balances')
  balances(@CurrentUser() user: RequestUser, @Query() q: BalanceQuery) {
    return this.staff.balances(user, q);
  }

  @Get('leave/:id')
  getLeave(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.getLeave(user, id);
  }

  @Get('leave/:id/history')
  leaveHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.leaveHistory(user, id);
  }

  @ApiOperation({
    summary: 'Apply for leave',
    description: 'Sundays and holidays are not counted. Rejected when it overlaps other leave or exceeds the balance for the year. HR and the site manager are told.',
  })
  @Post('leave')
  apply(@CurrentUser() user: RequestUser, @Body() dto: ApplyLeaveDto) {
    return this.staff.applyLeave(user, dto);
  }

  @ApiOperation({ summary: 'Approve leave: HR or the manager of the employee’s site, never their own' })
  @Post('leave/:id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.staff.approveLeave(user, id, dto);
  }

  @Post('leave/:id/reject')
  reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RejectLeaveDto) {
    return this.staff.rejectLeave(user, id, dto);
  }

  @ApiOperation({ summary: 'Cancel leave: the employee before it starts, or HR at any time' })
  @Post('leave/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.cancelLeave(user, id);
  }

  /* holidays */

  @Get('holidays')
  holidays(@CurrentUser() user: RequestUser, @Query() q: HolidayQuery) {
    return this.staff.holidays(user, q);
  }

  @Post('holidays')
  createHoliday(@CurrentUser() user: RequestUser, @Body() dto: CreateHolidayDto) {
    return this.staff.createHoliday(user, dto);
  }

  @Delete('holidays/:id')
  removeHoliday(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.staff.removeHoliday(user, id);
  }
}
