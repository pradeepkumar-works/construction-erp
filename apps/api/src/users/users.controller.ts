import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }
}
