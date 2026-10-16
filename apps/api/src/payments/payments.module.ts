import { Global, Module } from '@nestjs/common';
import { CommissionService } from './commission.service';
import { PaymentEventsService } from './payment-events.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentEventsService, CommissionService],
  exports: [PaymentsService, PaymentEventsService, CommissionService],
})
export class PaymentsModule {}
