import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { AssignmentsService } from './assignments.service';
import { AcceptProposalDto, CancelDto, CounterDto, CounterResponseDto, CreateAssignmentDto, DeliverDto, RejectDto, RespondInvitationDto, RevisionDto, ScopeDto, SignOffDto } from './dto';
import { MilestonesService } from './milestones.service';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService, private readonly milestones: MilestonesService) {}

  @Roles('CLIENT', 'SUPPORT_AGENT')
  @Post()
  create(@CurrentUser() me: SessionUser, @Body() dto: CreateAssignmentDto) {
    return this.assignments.create(me, dto);
  }

  @Roles('CLIENT')
  @Get('mine/client')
  mineClient(@CurrentUser() me: SessionUser) {
    return this.assignments.listMine(me, 'client');
  }

  @Roles('TALENT')
  @Get('mine/talent')
  mineTalent(@CurrentUser() me: SessionUser) {
    return this.assignments.listMine(me, 'talent');
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR')
  @Get()
  search(@Query('status') status?: string, @Query('q') text?: string, @Query('clientId') clientId?: string, @Query('talentId') talentId?: string) {
    return this.assignments.search({ status, text, clientId, talentId });
  }

  @Get(':id')
  get(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.assignments.get(me, id);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/scope')
  scope(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ScopeDto) {
    return this.assignments.scope(me, id, dto);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/rematch')
  rematch(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.assignments.reinvite(me, id);
  }

  @Roles('TALENT')
  @Post(':id/respond')
  respond(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: RespondInvitationDto) {
    return this.assignments.respond(me, id, dto);
  }

  @Roles('CLIENT')
  @Post('proposals/:proposalId/accept')
  accept(@CurrentUser() me: SessionUser, @Param('proposalId') id: string, @Body() dto: AcceptProposalDto) {
    return this.assignments.acceptProposal(me, id, dto);
  }

  @Roles('CLIENT')
  @Post('proposals/:proposalId/reject')
  reject(@CurrentUser() me: SessionUser, @Param('proposalId') id: string, @Body() dto: RejectDto) {
    return this.assignments.rejectProposal(me, id, dto.reason);
  }

  @Roles('CLIENT')
  @Post('proposals/:proposalId/counter')
  counter(@CurrentUser() me: SessionUser, @Param('proposalId') id: string, @Body() dto: CounterDto) {
    return this.assignments.counter(me, id, dto);
  }

  @Roles('TALENT')
  @Post('proposals/:proposalId/counter-response')
  counterResponse(@CurrentUser() me: SessionUser, @Param('proposalId') id: string, @Body() dto: CounterResponseDto) {
    return this.assignments.respondCounter(me, id, dto.accept, dto.reason);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: CancelDto) {
    return this.assignments.cancel(me, id, dto.reason);
  }

  @Roles('TALENT')
  @Post('milestones/:milestoneId/deliver')
  deliver(@CurrentUser() me: SessionUser, @Param('milestoneId') id: string, @Body() dto: DeliverDto) {
    return this.milestones.deliver(me, id, dto);
  }

  @Roles('CLIENT')
  @Post('milestones/:milestoneId/revision')
  revision(@CurrentUser() me: SessionUser, @Param('milestoneId') id: string, @Body() dto: RevisionDto) {
    return this.milestones.requestRevision(me, id, dto.reason);
  }

  @Roles('CLIENT')
  @Post('milestones/:milestoneId/accept')
  signOff(@CurrentUser() me: SessionUser, @Param('milestoneId') id: string, @Body() dto: SignOffDto) {
    return this.milestones.accept(me, id, dto.password);
  }
}
