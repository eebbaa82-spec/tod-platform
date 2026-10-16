import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MilestonesService } from '../assignments/milestones.service';
import { DisputesService } from '../disputes/disputes.service';
import { RatingsService } from '../ratings/ratings.service';
import { SupportService } from '../support/support.service';

// Time-driven rules: review windows, deadlines, invitation expiry, rating
// publication, dispute deadlines and safeguarding acknowledgement targets.
@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  private running = false;

  constructor(
    private readonly milestones: MilestonesService,
    private readonly ratings: RatingsService,
    private readonly disputes: DisputesService,
    private readonly support: SupportService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    if (process.env.JOBS_DISABLED === 'true') return;
    await this.runAll();
  }

  async runAll() {
    if (this.running) return { skipped: true };
    this.running = true;
    const results: Record<string, unknown> = {};
    try {
      for (const [name, fn] of [
        ['invitations', () => this.milestones.processInvitations()],
        ['deadlines', () => this.milestones.processDeadlines()],
        ['reviewWindows', () => this.milestones.processReviewWindows()],
        ['ratings', () => this.ratings.publishDue()],
        ['disputes', () => this.disputes.processDeadlines()],
        ['safeguarding', () => this.support.processAcknowledgements()],
      ] as const) {
        try {
          results[name] = await fn();
        } catch (e) {
          this.log.error(`${name} failed: ${(e as Error).message}`);
          results[name] = { error: (e as Error).message };
        }
      }
    } finally {
      this.running = false;
    }
    return results;
  }
}
