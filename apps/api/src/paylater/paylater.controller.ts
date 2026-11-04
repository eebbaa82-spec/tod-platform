import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ClientIp, CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { PayLaterService } from './paylater.service';

class ApplyDto {
  @IsString() assignmentId: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) tenorDays: number;
  @IsString() @MinLength(10) @MaxLength(1000) purpose: string;
}
class AcknowledgeDto {
  @IsString() @MinLength(1) password: string;
}
class ReassessDto {
  @IsBoolean() affordable: boolean;
  @IsString() @MinLength(5) @MaxLength(2000) note: string;
}
class RepaymentDto {
  @Type(() => Number) @IsInt() @Min(1) amount: number;
  @IsString() @MinLength(3) @MaxLength(100) reference: string;
  @IsOptional() @IsDateString() paidOn?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class ExceptionDto {
  @IsIn(['RESCHEDULE', 'OTHER']) kind: 'RESCHEDULE' | 'OTHER';
  @IsOptional() @IsString() installmentId?: string;
  @IsOptional() @IsDateString() newDueOn?: string;
  @IsString() @MinLength(5) @MaxLength(2000) reason: string;
}
class DecideDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class ReasonDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason: string;
}
class SwitchDto {
  @IsBoolean() enabled: boolean;
}

const FINANCE = ['FINANCE_OFFICER', 'SUPER_ADMIN'] as const;
// Read-only portfolio access, including the lender's own view (FR-BNP-10).
const READERS = ['FINANCE_OFFICER', 'SUPER_ADMIN', 'PLATFORM_ADMIN', 'AUDITOR', 'LENDER_VIEWER'] as const;

@Controller('paylater')
export class PayLaterController {
  constructor(private readonly payLater: PayLaterService) {}

  // Client side
  @Get('me')
  @Roles('CLIENT')
  mine(@CurrentUser() me: SessionUser) {
    return this.payLater.mine(me);
  }

  @Get('offer/:assignmentId')
  @Roles('CLIENT')
  offer(@CurrentUser() me: SessionUser, @Param('assignmentId') id: string) {
    return this.payLater.offer(me, id);
  }

  @Post('applications')
  @Roles('CLIENT')
  apply(@CurrentUser() me: SessionUser, @Body() dto: ApplyDto) {
    return this.payLater.apply(me, dto);
  }

  @Post('agreements/:id/acknowledge')
  @Roles('CLIENT')
  acknowledge(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: AcknowledgeDto, @ClientIp() ip: string) {
    return this.payLater.acknowledge(me, id, dto.password, ip);
  }

  @Get('agreements/:id')
  get(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.payLater.get(me, id);
  }

  // Staff and lender
  @Get('agreements')
  @Roles(...READERS)
  list(@Query('status') status?: string) {
    return this.payLater.list(status);
  }

  @Get('portfolio')
  @Roles(...READERS)
  portfolio() {
    return this.payLater.portfolio();
  }

  @Get('agreements/:id/evidence')
  @Roles(...READERS)
  evidence(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.payLater.evidence(me, id);
  }

  @Post('agreements/:id/reassess')
  @Roles(...FINANCE)
  reassess(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReassessDto) {
    return this.payLater.reassess(me, id, dto);
  }

  @Post('agreements/:id/repayments')
  @Roles(...FINANCE)
  repay(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: RepaymentDto) {
    return this.payLater.recordRepayment(me, id, dto);
  }

  @Post('agreements/:id/exceptions')
  @Roles(...FINANCE)
  exception(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ExceptionDto) {
    return this.payLater.requestException(me, id, dto);
  }

  @Post('exceptions/:id/decide')
  @Roles(...FINANCE)
  decide(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.payLater.decideException(me, id, dto.approve, dto.note);
  }

  @Post('portfolio/unfreeze')
  @Roles(...FINANCE)
  unfreeze(@CurrentUser() me: SessionUser, @Body() dto: ReasonDto) {
    return this.payLater.unfreeze(me, dto.reason);
  }

  // FR-BNP-01: the per-client switch, for an authorised administrator.
  @Get('clients')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER')
  clients() {
    return this.payLater.clients();
  }

  @Put('clients/:userId')
  @Roles('PLATFORM_ADMIN', 'SUPER_ADMIN')
  setClient(@CurrentUser() me: SessionUser, @Param('userId') userId: string, @Body() dto: SwitchDto) {
    return this.payLater.setClientEnabled(me, userId, dto.enabled);
  }
}
