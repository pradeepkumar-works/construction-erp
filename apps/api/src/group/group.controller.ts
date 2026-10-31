import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GivePlaceDto, GroupCompanyDto, MakeGroupDto, SetGroupAdminDto, UpdateGroupCompanyDto } from './group.dto';
import { GroupService } from './group.service';

/** Group companies: the group's companies and who works in which. The group's admins; a company admin to make one. */
@ApiTags('group')
@ApiBearerAuth()
@Controller('group')
export class GroupController {
  constructor(private group: GroupService) {}

  @ApiOperation({ summary: "The company's group: its companies and people (the group's admins), or whether you may make one" })
  @Get()
  state(@CurrentUser() user: RequestUser) {
    return this.group.state(user);
  }

  @ApiOperation({ summary: 'Make a group with this company as its first (an admin, who becomes the group admin)' })
  @Post()
  make(@CurrentUser() user: RequestUser, @Body() dto: MakeGroupDto) {
    return this.group.make(user, dto.name);
  }

  @ApiOperation({ summary: 'Add a company to the group', description: 'Its kind sets the modules it starts with; you become its admin on the same sign-in.' })
  @Post('companies')
  addCompany(@CurrentUser() user: RequestUser, @Body() dto: GroupCompanyDto) {
    return this.group.addCompany(user, dto);
  }

  @ApiOperation({ summary: "Change a company's name, kind or legal details" })
  @Patch('companies/:id')
  updateCompany(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateGroupCompanyDto) {
    return this.group.updateCompany(user, id, dto);
  }

  @ApiOperation({ summary: 'Give someone who works in the group a place in one of its companies', description: 'On the sign-in they already have; no invite.' })
  @Post('places')
  givePlace(@CurrentUser() user: RequestUser, @Body() dto: GivePlaceDto) {
    return this.group.givePlace(user, dto);
  }

  @ApiOperation({ summary: "Make someone one of the group's admins, or stop them being one" })
  @Put('admins/:loginId')
  setAdmin(@CurrentUser() user: RequestUser, @Param('loginId') loginId: string, @Body() dto: SetGroupAdminDto) {
    return this.group.setAdmin(user, loginId, dto.admin);
  }
}
