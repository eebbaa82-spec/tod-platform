import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { DisputesService, REMEDIES } from './disputes.service';

class OpenDisputeDto {
  @IsString() milestoneId: string;
  @IsString() @MinLength(10) @MaxLength(3000) reason: string;
  @IsOptional() @IsInt() @Min(1) amountDisputed?: number;
}
class NoteDto {
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
  @IsOptional() @IsBoolean() internal?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) fileIds?: string[];
}
class StageDto {
  @IsIn(['FACILITATION', 'DECISION']) stage: 'FACILITATION' | 'DECISION';
}
class DecisionDto {
  @IsIn(REMEDIES as unknown as string[]) remedy: (typeof REMEDIES)[number];
  @IsOptional() @IsInt() @Min(0) releaseAmount?: number;
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
  @IsOptional() @IsString() @MaxLength(300) accountAction?: string;
  @IsString() @MinLength(5) @MaxLength(4000) note: string;
}
class ApprovalDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class AppealDto {
  @IsString() @MinLength(10) @MaxLength(3000) reason: string;
}
class ReassignDto {
  @IsString() ownerId: string;
}

@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Roles('CLIENT', 'TALENT')
  @Post()
  open(@CurrentUser() me: SessionUser, @Body() dto: OpenDisputeDto) {
    return this.disputes.open(me, dto.milestoneId, dto);
  }

  @Get('mine')
  mine(@CurrentUser() me: SessionUser) {
    return this.disputes.mine(me);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'AUDITOR')
  @Get()
  list(@Query('stage') stage?: string, @Query('ownerId') ownerId?: string) {
    return this.disputes.list({ stage, ownerId });
  }

  @Get(':id')
  get(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.disputes.get(me, id);
  }

  @Roles('CLIENT', 'TALENT', 'SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER')
  @Post(':id/notes')
  note(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.disputes.addNote(me, id, dto.body, !!dto.internal, dto.fileIds);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/stage')
  stage(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: StageDto) {
    return this.disputes.advance(me, id, dto.stage);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/reassign')
  reassign(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReassignDto) {
    return this.disputes.reassign(me, id, dto.ownerId);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/decision')
  decide(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.disputes.proposeDecision(me, id, dto);
  }

  @Roles('FINANCE_OFFICER', 'SUPER_ADMIN')
  @Post('approvals/:approvalId')
  approve(@CurrentUser() me: SessionUser, @Param('approvalId') id: string, @Body() dto: ApprovalDto) {
    return this.disputes.decideApproval(me, id, dto.approve, dto.note);
  }

  @Roles('CLIENT', 'TALENT')
  @Post(':id/accept-decision')
  acceptDecision(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.disputes.acceptDecision(me, id);
  }

  @Roles('CLIENT', 'TALENT')
  @Post(':id/appeal')
  appeal(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: AppealDto) {
    return this.disputes.appeal(me, id, dto.reason);
  }
}
