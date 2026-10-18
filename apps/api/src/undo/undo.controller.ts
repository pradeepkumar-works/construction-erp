import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { UndoService } from '../common/undo.service';

export class UndoDto {
  @ApiProperty({ description: 'The `undo` value a delete returned' }) @IsString() @MaxLength(200_000) token!: string;
}

@ApiTags('undo')
@ApiBearerAuth()
@Controller('undo')
export class UndoController {
  constructor(private undo: UndoService) {}

  @ApiOperation({
    summary: 'Undo a delete',
    description: 'Puts back what a delete removed, with the same id, when the delete returned an `undo` value. Only its own user, within a minute, and only while they may still delete it.',
  })
  @Post()
  @HttpCode(200)
  restore(@CurrentUser() user: RequestUser, @Body() dto: UndoDto) {
    return this.undo.restore(user, dto.token);
  }
}
