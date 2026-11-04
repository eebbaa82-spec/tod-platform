import { Global, Module } from '@nestjs/common';
import { PayLaterController } from './paylater.controller';
import { PayLaterService } from './paylater.service';

@Global()
@Module({ controllers: [PayLaterController], providers: [PayLaterService], exports: [PayLaterService] })
export class PayLaterModule {}
