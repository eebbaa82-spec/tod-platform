import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, Public, Roles, SessionUser } from '../common/auth.decorators';
import { ClientsService } from './clients.service';
import { ClientProfileDto, ConfirmLevelDto } from './dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Roles('CLIENT')
  @Get('me')
  async mine(@CurrentUser() me: SessionUser) {
    const profile = await this.clients.mine(me.id);
    const limit = profile ? await this.clients.effectiveLimit(me.id) : null;
    return { profile, limit };
  }

  // Value limits per client level, shown on the client profile page (BR-07, BR-08).
  @Public()
  @Get('limits')
  limits() {
    return this.clients.limits();
  }

  @Roles('CLIENT')
  @Put('me')
  upsert(@CurrentUser() me: SessionUser, @Body() dto: ClientProfileDto) {
    return this.clients.upsert(me.id, dto);
  }

  @Roles('SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  @Post(':userId/confirm-level')
  confirm(@CurrentUser() me: SessionUser, @Param('userId') userId: string, @Body() dto: ConfirmLevelDto) {
    return this.clients.confirmLevel(me.id, userId, dto.note);
  }
}
