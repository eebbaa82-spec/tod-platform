import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { CATEGORIES, SAFEGUARDING_TYPES, SupportService } from './support.service';

class TicketDto {
  @IsIn(CATEGORIES) category: string;
  @IsString() @MinLength(3) @MaxLength(160) subject: string;
  @IsString() @MinLength(5) @MaxLength(5000) description: string;
  @IsOptional() @IsIn(['APP', 'CALL_LINE', 'ASSISTED_DESK']) source?: string;
  @IsOptional() @IsString() requesterPhone?: string;
  @IsOptional() @IsString() assignmentId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileIds?: string[];
}
class ReportDto {
  @IsIn(SAFEGUARDING_TYPES) type: string;
  @IsString() @MinLength(5) @MaxLength(5000) description: string;
  @IsOptional() @IsString() assignmentId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileIds?: string[];
}
class UpdateDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsBoolean() internal?: boolean;
  @IsOptional() @IsString() @MaxLength(3000) outcome?: string;
}

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  create(@CurrentUser() me: SessionUser, @Body() dto: TicketDto) {
    return this.support.create(me, dto);
  }

  // Confidential report, reachable from every screen (FR-SUP-02).
  @Post('reports')
  report(@CurrentUser() me: SessionUser, @Body() dto: ReportDto) {
    return this.support.report(me, dto);
  }

  @Get('tickets')
  list(@CurrentUser() me: SessionUser, @Query('status') status?: string, @Query('confidential') confidential?: string, @Query('mine') mine?: string) {
    return this.support.list(me, { status, confidential, mine });
  }

  @Get('tickets/:id')
  get(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.support.get(me, id);
  }

  @Post('tickets/:id')
  update(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: UpdateDto) {
    return this.support.update(me, id, dto);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post('tickets/:id/acknowledge')
  ack(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.support.acknowledge(me, id);
  }
}
