import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { DisputesModule } from '../disputes/disputes.module';
import { RatingsModule } from '../ratings/ratings.module';
import { SupportModule } from '../support/support.module';
import { JobsService } from './jobs.service';

@Module({ imports: [AssignmentsModule, RatingsModule, DisputesModule, SupportModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
