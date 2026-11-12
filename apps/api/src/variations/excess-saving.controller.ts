import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumberString, ValidateIf } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ExcessSavingService } from './excess-saving.service';

export class SetAnticipatedDto {
  @ApiProperty({ example: '1250.5', nullable: true, description: 'What the item is expected to end at; null takes the default (the larger of measured and sanctioned)' })
  @ValidateIf((o) => o.anticipatedQty !== null)
  @IsNumberString()
  anticipatedQty: string | null;
}

@ApiTags('variations')
@ApiBearerAuth()
@Controller()
export class ExcessSavingController {
  constructor(private excess: ExcessSavingService) {}

  @ApiOperation({ summary: 'Excess and saving statement', description: 'Each BOQ item against what it is expected to end at, at the bill rate. Roles that see bills.' })
  @Get('projects/:id/excess-saving')
  statement(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.excess.statement(user, id);
  }

  @ApiOperation({ summary: 'Set what a BOQ item is expected to end at', description: 'Admin, management, project managers and quantity surveyors. Never below what is measured.' })
  @Patch('boq-items/:id/anticipated')
  setAnticipated(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAnticipatedDto) {
    return this.excess.setAnticipated(user, id, dto.anticipatedQty);
  }
}
