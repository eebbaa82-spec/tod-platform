import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, isStaff, Roles, SessionUser } from '../common/auth.decorators';
import { PaymentsService } from './payments.service';

class NoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class DecideDto extends NoteDto {
  @IsBoolean() approve: boolean;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('receipts/:ref')
  receipt(@CurrentUser() me: SessionUser, @Param('ref') ref: string) {
    return this.payments.receipt(ref, me.id, isStaff(me.roles) && me.mfa);
  }

  // Interim mode (FR-ESC-14): releases and refunds waiting for two finance officers.
  @Get('interim')
  @Roles('FINANCE_OFFICER', 'AUDITOR', 'SUPER_ADMIN')
  interim() {
    return this.payments.awaitingApproval();
  }

  @Post('settlements/:id/authorise')
  @Roles('FINANCE_OFFICER')
  authorise(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.payments.authorise(id, me, dto.note);
  }

  @Post('interim-approvals/:id/decide')
  @Roles('FINANCE_OFFICER')
  decide(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: DecideDto) {
    return this.payments.decide(id, me, dto.approve, dto.note);
  }
}
