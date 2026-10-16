import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, isStaff, SessionUser } from '../common/auth.decorators';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('receipts/:ref')
  receipt(@CurrentUser() me: SessionUser, @Param('ref') ref: string) {
    return this.payments.receipt(ref, me.id, isStaff(me.roles) && me.mfa);
  }
}
