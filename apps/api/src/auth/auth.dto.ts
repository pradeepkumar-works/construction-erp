import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '@erp/shared';

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(4)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(100)
  newPassword: string;
}

export class SignupDto {
  @ApiProperty({ example: 'Sai Ram Constructions Pvt Ltd' }) @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(120) organizationName: string;
  @ApiProperty({ example: 'Ravi Kumar' }) @IsString() @MinLength(2) @MaxLength(80) fullName: string;
  @ApiProperty({ example: 'ravi@sairam.in' }) @IsEmail() @MaxLength(120) email: string;
  @ApiPropertyOptional({ example: '9876543210' }) @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @ApiProperty() @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(100) password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'pm@demo.com' }) @IsEmail() email: string;
}

export class SetPasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) token: string;
  @ApiProperty() @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(100) password: string;
}

export class SwitchCompanyDto {
  @ApiProperty() @IsUUID() organizationId: string;
}
