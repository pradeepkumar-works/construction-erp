import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  /** Any logged-in user may list colleagues (needed for assigning project members / responsible engineers). */
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListUsersQuery) {
    return this.users.list(user, q);
  }

  @Get('roles')
  roles(@CurrentUser() user: RequestUser) {
    return this.users.roles(user);
  }

  @ApiOperation({ summary: 'Add a user (admin)', description: 'Without a password the user is invited: a set-password link is emailed (when email is set up) and returned in `invite.link` for the admin to share.' })
  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto, @Headers('origin') origin?: string) {
    return this.users.create(user, dto, origin);
  }

  @ApiOperation({ summary: 'New set-password link for a user (admin)', description: 'Re-sends an invite, or a reset link for a user who has a password. Earlier links stop working.' })
  @Post(':id/password-link')
  @Roles('ADMIN')
  passwordLink(@CurrentUser() user: RequestUser, @Param('id') id: string, @Headers('origin') origin?: string) {
    return this.users.passwordLink(user, id, origin);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }
}
