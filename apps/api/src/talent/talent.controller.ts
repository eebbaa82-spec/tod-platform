import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, Public, Roles, SessionUser } from '../common/auth.decorators';
import { PayoutAccountDto, PhotoDto, PortfolioItemDto, UpdateTalentProfileDto } from './dto';
import { TalentService } from './talent.service';

@Controller('talent')
export class TalentController {
  constructor(private readonly talent: TalentService) {}

  @Roles('TALENT')
  @Get('me')
  mine(@CurrentUser() me: SessionUser) {
    return this.talent.mine(me.id);
  }

  @Roles('TALENT')
  @Put('me')
  update(@CurrentUser() me: SessionUser, @Body() dto: UpdateTalentProfileDto) {
    return this.talent.update(me.id, dto);
  }

  @Roles('TALENT')
  @Put('me/photo')
  photo(@CurrentUser() me: SessionUser, @Body() dto: PhotoDto) {
    return this.talent.setPhoto(me.id, dto.fileId ?? null);
  }

  @Roles('TALENT')
  @Put('me/payout')
  payout(@CurrentUser() me: SessionUser, @Body() dto: PayoutAccountDto) {
    return this.talent.setPayout(me.id, dto);
  }

  @Roles('TALENT')
  @Post('me/portfolio')
  addPortfolio(@CurrentUser() me: SessionUser, @Body() dto: PortfolioItemDto) {
    return this.talent.addPortfolio(me.id, dto);
  }

  @Roles('TALENT')
  @Delete('me/portfolio/:id')
  removePortfolio(@CurrentUser() me: SessionUser, @Param('id') id: string) {
    return this.talent.removePortfolio(me.id, id);
  }

  @Public()
  @Get('search')
  search(@Query('serviceArea') serviceArea?: string, @Query('tier') tier?: string, @Query('q') text?: string) {
    return this.talent.search({ serviceArea, tier, text });
  }

  @Public()
  @Get(':userId')
  profile(@Param('userId') userId: string) {
    return this.talent.publicProfile(userId);
  }
}
