import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { ClientsModule } from './clients/clients.module';
import { AuthGuard } from './common/auth.guard';
import { CoreModule } from './common/core.module';
import { DevModule } from './dev/dev.module';
import { DisputesModule } from './disputes/disputes.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { MeModule } from './me/me.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { RatingsModule } from './ratings/ratings.module';
import { ReportsModule } from './reports/reports.module';
import { SupportModule } from './support/support.module';
import { TalentModule } from './talent/talent.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => process.env.APP_ENV === 'test' }),
    CoreModule,
    NotificationsModule,
    IntegrationsModule,
    FilesModule,
    PaymentsModule,
    AuthModule,
    CatalogueModule,
    RatingsModule,
    TalentModule,
    ClientsModule,
    AssignmentsModule,
    DisputesModule,
    MessagingModule,
    SupportModule,
    AdminModule,
    ReportsModule,
    MeModule,
    JobsModule,
    DevModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }) },
  ],
})
export class AppModule {}
