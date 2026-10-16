import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, SessionUser } from '../common/auth.decorators';
import { MessagingService } from './messaging.service';

class SendDto {
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
  @IsOptional() @IsArray() @IsString({ each: true }) fileIds?: string[];
  @IsOptional() @IsString() talentId?: string;
}

@Controller('assignments/:assignmentId/messages')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() me: SessionUser, @Param('assignmentId') id: string, @Query('talentId') talentId?: string) {
    return this.messaging.list(me, id, talentId);
  }

  @Get('threads')
  threads(@CurrentUser() me: SessionUser, @Param('assignmentId') id: string) {
    return this.messaging.threads(me, id);
  }

  @Post()
  send(@CurrentUser() me: SessionUser, @Param('assignmentId') id: string, @Body() dto: SendDto) {
    return this.messaging.send(me, id, dto.body, dto.fileIds, dto.talentId);
  }
}
