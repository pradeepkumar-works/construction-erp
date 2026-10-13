import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH, LIST_SORT_FIELDS, ROLE_KEYS, RoleKey, type UserSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

/** `q` matches name, email and phone. */
export class ListUsersQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ROLE_KEYS }) @IsOptional() @IsIn(ROLE_KEYS as unknown as string[]) roleKey?: RoleKey;
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.users, default: 'fullName' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.users as unknown as string[]) sortBy?: UserSortField;
}

export class CreateUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(2) fullName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ enum: ROLE_KEYS }) @IsIn(ROLE_KEYS as unknown as string[]) roleKey: RoleKey;
  @ApiPropertyOptional({ description: 'Leave out to invite the user by email / link instead' }) @IsOptional() @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(100) password?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() isActive?: boolean;
}
