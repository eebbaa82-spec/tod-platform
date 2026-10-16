import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { RatingsModule } from '../ratings/ratings.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { MatchingService } from './matching.service';
import { MilestonesService } from './milestones.service';

@Module({
  imports: [ClientsModule, RatingsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, MatchingService, MilestonesService],
  exports: [AssignmentsService, MilestonesService, MatchingService],
})
export class AssignmentsModule {}
