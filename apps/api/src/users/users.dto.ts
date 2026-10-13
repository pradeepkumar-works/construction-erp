import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { LIST_SORT_FIELDS, ROLE_KEYS, RoleKey, type UserSortField } from '@erp/shared';
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
  @ApiProperty() @IsString() @MinLength(6) password: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() isActive?: boolean;
}
