import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { CohortsService } from './cohorts.service';

class CohortDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsInt() @Min(0) valueLimit?: number | null;
  @IsOptional() @IsBoolean() payLaterEligible?: boolean;
  // Pay-later cap for the cohort, approved with it by the Project Director (FR-BNP-04).
  @IsOptional() @IsInt() @Min(0) payLaterCap?: number | null;
}
class MembersDto {
  @IsOptional() @IsArray() @IsString({ each: true }) add?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) remove?: string[];
  // Phone numbers, as staff usually know them.
  @IsOptional() @IsArray() @IsString({ each: true }) addPhones?: string[];
}
class NoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}

@Controller('admin/cohorts')
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get()
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'MEL_OFFICER', 'AUDITOR')
  list() {
    return this.cohorts.list();
  }

  @Get(':id')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'MEL_OFFICER', 'AUDITOR')
  get(@Param('id') id: string) {
    return this.cohorts.get(id);
  }

  @Post()
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  create(@CurrentUser() me: SessionUser, @Body() dto: CohortDto) {
    return this.cohorts.create(me, dto);
  }

  // Approval by the Project Director, who holds the super administrator role.
  @Post(':id/approve')
  @Roles('SUPER_ADMIN')
  approve(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.cohorts.approve(me, id, dto.note);
  }

  @Post(':id/close')
  @Roles('SUPER_ADMIN')
  close(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.cohorts.close(me, id, dto.reason);
  }

  @Post(':id/members')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT')
  members(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: MembersDto) {
    return this.cohorts.setMembers(me, id, dto.add ?? [], dto.remove ?? [], dto.addPhones ?? []);
  }
}
