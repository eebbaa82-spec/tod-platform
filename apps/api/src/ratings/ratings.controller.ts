import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { RatingsService } from './ratings.service';

class RateDto {
  @IsObject() scores: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
class ReplyDto {
  @IsString() @MinLength(2) @MaxLength(1000) reply: string;
}
class RemoveDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get('pending')
  pending(@CurrentUser() me: SessionUser) {
    return this.ratings.pendingForUser(me.id);
  }

  @Roles('CLIENT', 'TALENT')
  @Post('assignments/:assignmentId')
  rate(@CurrentUser() me: SessionUser, @Param('assignmentId') id: string, @Body() dto: RateDto) {
    return this.ratings.submit(me, id, dto.scores, dto.comment);
  }

  @Post(':id/reply')
  reply(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.ratings.reply(me, id, dto.reply);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':id/remove')
  remove(@CurrentUser() me: SessionUser, @Param('id') id: string, @Body() dto: RemoveDto) {
    return this.ratings.remove(me, id, dto.reason);
  }
}
