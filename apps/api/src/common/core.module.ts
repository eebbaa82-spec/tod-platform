import { Global, Module } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from './audit.service';
import { ClockService } from './clock.service';
import { ParametersService } from './parameters.service';
import { PrismaService } from './prisma.service';
import { SequenceService } from './sequence.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, SequenceService, ParametersService, ClockService, NotificationsService],
  exports: [PrismaService, AuditService, SequenceService, ParametersService, ClockService, NotificationsService],
})
export class CoreModule {}
