import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, ListVendorsQuery, UpdateVendorDto } from './vendors.dto';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private vendors: VendorsService) {}

  @ApiOperation({ summary: 'Vendor master (paged)', description: 'Active vendors unless `includeInactive`; `kind` and `msme` filter. Anyone signed in can read it (pickers); bank details only for admin, management, procurement and accounts.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListVendorsQuery) {
    return this.vendors.list(user, q);
  }

  @ApiOperation({ summary: 'Vendor names typed on expenses, machines and GRNs that are not in the master', description: 'Adding one to the master links those entries to it.' })
  @Get('unlisted')
  unlisted(@CurrentUser() user: RequestUser) {
    return this.vendors.unlisted(user);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.vendors.get(user, id);
  }

  @ApiOperation({ summary: 'Add a vendor', description: 'Admin, management, project managers, procurement, accounts and stores. State code and PAN come from the GSTIN. Expenses, machines and GRNs that typed the same name are linked to it.' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateVendorDto) {
    return this.vendors.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a vendor', description: 'Renaming a vendor renames it on the entries linked to it.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a vendor not used anywhere' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.vendors.remove(user, id);
  }
}
