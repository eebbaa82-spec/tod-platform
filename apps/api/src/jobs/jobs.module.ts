import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { DisputesModule } from '../disputes/disputes.module';
import { RatingsModule } from '../ratings/ratings.module';
import { ReportsModule } from '../reports/reports.module';
import { SupportModule } from '../support/support.module';
import { JobsService } from './jobs.service';

@Module({ imports: [AssignmentsModule, RatingsModule, DisputesModule, SupportModule, ReportsModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
