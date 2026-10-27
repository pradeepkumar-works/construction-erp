import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH, LIST_SORT_FIELDS, ROLE_KEYS, RoleKey, type UserSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

/** `q` matches name, email and phone. */
export class ListUsersQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ROLE_KEYS }) @IsOptional() @IsIn(ROLE_KEYS as unknown as string[]) roleKey?: RoleKey;
  /** Any of several roles (a picker of project managers, of imprest holders), comma-separated. */
  @ApiPropertyOptional({ description: 'Comma-separated role keys; a user with any of them matches' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsIn(ROLE_KEYS as unknown as string[], { each: true })
  roleKeys?: RoleKey[];
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.users, default: 'fullName' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.users as unknown as string[]) sortBy?: UserSortField;
}

export class CreateUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(2) fullName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ enum: ROLE_KEYS }) @IsIn(ROLE_KEYS as unknown as string[]) roleKey: RoleKey;
  @ApiPropertyOptional({ description: 'Leave out to invite the user by email / link instead' }) @IsOptional() @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(100) password?: string;
  @ApiPropertyOptional({ type: [String], description: 'Projects whose team the new user joins (finding 17 of the October review)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  projectIds?: string[];
}

/** A user's projects are changed from the project's own team card, not here. */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['projectIds'] as const)) {
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() isActive?: boolean;
}
