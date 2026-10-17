import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptCheckDto {
  @ApiProperty({ description: "The flag's key, as the checks returned it" }) @IsString() @MinLength(1) @MaxLength(300) key!: string;
  @ApiProperty({ example: 'Rate revised by the PM on site, letter attached', description: 'Why the flag is accepted' }) @IsString() @MinLength(3) @MaxLength(500) note!: string;
}

export class ReopenCheckDto {
  @ApiProperty({ description: "The accepted flag's key" }) @IsString() @MinLength(1) @MaxLength(300) key!: string;
}
