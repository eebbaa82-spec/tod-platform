import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsArray, IsBoolean, IsDefined, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { AdminService } from './admin.service';

class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}
class RolesDto {
  @IsArray() @IsString({ each: true }) roles: Role[];
  @IsOptional() @IsBoolean() safeguardingDesignated?: boolean;
}
class StaffDto {
  @IsString() phone: string;
  @IsString() @MinLength(2) displayName: string;
  @IsArray() @IsString({ each: true }) roles: Role[];
  @IsString() @MinLength(10) temporaryPassword: string;
  @IsOptional() @IsBoolean() safeguardingDesignated?: boolean;
}
class DisabilityDto {
  @IsBoolean() confirmed: boolean;
  @IsString() @MinLength(3) note: string;
}
class AnnounceDto {
  @IsOptional() @IsString() role?: Role;
  @IsString() @MinLength(3) @MaxLength(160) subject: string;
  @IsString() @MinLength(3) @MaxLength(2000) detail: string;
  @IsOptional() @IsBoolean() sms?: boolean;
}
class ParamChangeDto {
  @IsDefined() value: unknown;
  @IsString() @MinLength(3) reason: string;
}
class DecideDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() note?: string;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly audit: AuditService) {}

  @Get('overview')
  @Roles('SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'MEL_OFFICER')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  @Roles('SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  users(@Query() q: any) {
    return this.admin.users({ ...q, take: q.take ? Number(q.take) : undefined });
  }

  @Get('users/:id')
  @Roles('SUPPORT_AGENT', 'VETTING_OFFICER', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  user(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.admin.user(me, id);
  }

  @Post('users/:id/suspend')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  suspend(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.suspend(me, id, dto.reason);
  }

  @Post('users/:id/reinstate')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  reinstate(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.reinstate(me, id, dto.reason);
  }

  @Post('users/:id/roles')
  @Roles('SUPER_ADMIN')
  setRoles(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: RolesDto) {
    return this.admin.setRoles(me, id, dto.roles, dto.safeguardingDesignated);
  }

  @Post('staff')
  @Roles('SUPER_ADMIN')
  createStaff(@CurrentUser() me: SessionUser, @Body() dto: StaffDto) {
    return this.admin.createStaff(me, dto);
  }

  @Post('users/:id/disability')
  @Roles('VETTING_OFFICER', 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  confirmDisability(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: DisabilityDto) {
    return this.admin.confirmDisability(me, id, dto.confirmed, dto.note);
  }

  @Post('announcements')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  announce(@CurrentUser() me: SessionUser, @Body() dto: AnnounceDto) {
    return this.admin.announce(me, dto);
  }

  @Get('parameters')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER')
  parameters() {
    return this.admin.parameters();
  }

  @Post('parameters/:key')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  requestChange(@CurrentUser() me: SessionUser, @Param('key') key: string, @Body() dto: ParamChangeDto) {
    return this.admin.requestChange(me, key, dto.value, dto.reason);
  }

  @Post('parameter-changes/:id')
  @Roles('SUPER_ADMIN', 'FINANCE_OFFICER')
  decideChange(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.admin.decideChange(me, id, dto.approve, dto.note);
  }

  @Get('approvals')
  @Roles('SUPER_ADMIN', 'FINANCE_OFFICER')
  approvals() {
    return this.admin.approvals();
  }

  @Get('audit')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'FINANCE_OFFICER', 'AUDITOR')
  auditLog(@Query() q: any) {
    return this.admin.auditLog({ ...q, take: q.take ? Number(q.take) : undefined });
  }

  @Get('audit/verify')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN', 'AUDITOR')
  verify() {
    return this.audit.verifyChain();
  }
}
