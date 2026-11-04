import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { MeService } from './me.service';

class PasswordDto {
  @IsString() password: string;
}
class IdentityStartDto {
  // The user agreed to the partner bank confirming their identity (FR-KYC-02).
  @IsBoolean() consent: boolean;
}
class ErasureDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Post('identity/start')
  startIdentity(@CurrentUser() u: SessionUser, @Body() dto: IdentityStartDto) {
    return this.me.startIdentity(u, dto.consent);
  }

  @Post('vetting/request')
  @Roles('TALENT')
  requestVetting(@CurrentUser() u: SessionUser) {
    return this.me.requestVetting(u);
  }

  @Get('export')
  exportData(@CurrentUser() u: SessionUser) {
    return this.me.exportData(u);
  }

  @Post('deactivate')
  deactivate(@CurrentUser() u: SessionUser, @Body() dto: PasswordDto) {
    return this.me.deactivate(u, dto.password);
  }

  @Post('erasure')
  erasure(@CurrentUser() u: SessionUser, @Body() dto: ErasureDto) {
    return this.me.requestErasure(u, dto.reason);
  }
}
