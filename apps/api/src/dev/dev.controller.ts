import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CurrentUser, Roles, SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { config } from '../common/config';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { IdentityResultService } from '../integrations/identity';
import { VettingOutcomeService } from '../integrations/vetting';
import { JobsService } from '../jobs/jobs.service';
import { PaymentEventsService } from '../payments/payment-events.service';

// ============================================================================
// TEST STAND-INS for the three developer modules. Every route here refuses to
// run when APP_ENV=production. They call exactly the same integration points
// the real Fayda, vetting and escrow modules will call.
// ============================================================================

class IdentityDto {
  @IsIn(['VERIFIED', 'PROVISIONAL', 'FAILED']) status: 'VERIFIED' | 'PROVISIONAL' | 'FAILED';
  @IsOptional() @IsString() verifiedName?: string;
  @IsOptional() @IsIn(['FEMALE', 'MALE']) sex?: 'FEMALE' | 'MALE';
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() fan?: string;
}
class TierDto {
  @IsString() serviceAreaCode: string;
  @IsIn(['ENTRY', 'INTERMEDIATE', 'EXPERT']) tier: 'ENTRY' | 'INTERMEDIATE' | 'EXPERT';
  @IsOptional() @IsNumber() testScore?: number;
}
class VettingDto {
  @IsIn(['IN_PROGRESS', 'APPROVED', 'REJECTED']) status: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TierDto) tiers?: TierDto[];
  @IsOptional() @IsString() note?: string;
}
class FundingDto {
  @IsOptional() @IsInt() amount?: number;
  @IsOptional() @IsIn(['BANK', 'TELEBIRR', 'CBE_BIRR']) channel?: string;
}
class ClockDto {
  @IsNumber() hours: number;
}

@Controller('dev')
export class DevController {
  constructor(
    private readonly identity: IdentityResultService,
    private readonly vetting: VettingOutcomeService,
    private readonly payments: PaymentEventsService,
    private readonly jobs: JobsService,
    private readonly clock: ClockService,
    private readonly prisma: PrismaService,
  ) {}

  private guard() {
    if (!config.standInsEnabled) throw fail.notFound('Route');
  }

  @Get('status')
  @Roles('VETTING_OFFICER', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'PLATFORM_ADMIN', 'SUPER_ADMIN')
  status() {
    this.guard();
    return { standIns: true, clock: this.clock.now(), env: config.env };
  }

  @Post('identity/:userId')
  @Roles('VETTING_OFFICER', 'SUPPORT_AGENT', 'SUPER_ADMIN')
  async setIdentity(@CurrentUser() me: SessionUser, @Param('userId') userId: string, @Body() dto: IdentityDto) {
    this.guard();
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const fan = dto.fan ?? `9${u.phone.replace(/\D/g, '').slice(-11).padStart(15, '0')}`;
    const r = await this.identity.apply(
      {
        userId,
        status: dto.status,
        identityToken: dto.status === 'FAILED' ? undefined : `test-${fan}`,
        identifierForMasking: fan,
        verifiedName: dto.verifiedName ?? u.displayName,
        sex: dto.sex,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        method: 'TEST_STAND_IN',
        reference: 'stand-in',
      },
      me.id,
    );
    return { id: r.id, identityStatus: r.identityStatus, identityMasked: r.identityMasked };
  }

  @Post('vetting/:userId')
  @Roles('VETTING_OFFICER', 'SUPER_ADMIN')
  setVetting(@CurrentUser() me: SessionUser, @Param('userId') userId: string, @Body() dto: VettingDto) {
    this.guard();
    return this.vetting.apply({ talentUserId: userId, status: dto.status, tiers: dto.tiers, reviewerId: me.id, note: dto.note ?? 'Test stand-in' });
  }

  // Simulates the partner bank confirming that the client's payment is in escrow.
  @Post('funding/:reference')
  @Roles('FINANCE_OFFICER', 'SUPER_ADMIN')
  async confirmFunding(@Param('reference') reference: string, @Body() dto: FundingDto) {
    this.guard();
    const pi = await this.prisma.paymentInstruction.findUnique({ where: { reference } });
    if (!pi) throw fail.notFound('Payment reference');
    return this.payments.fundingConfirmed({ paymentReference: reference, amount: dto.amount ?? pi.amount, providerRef: `TEST-${Date.now()}`, channel: dto.channel ?? 'TELEBIRR' });
  }

  @Post('clock/advance')
  @Roles('SUPER_ADMIN')
  async advance(@Body() dto: ClockDto) {
    this.guard();
    this.clock.advance(dto.hours * 3_600_000);
    return { clock: this.clock.now(), jobs: await this.jobs.runAll() };
  }

  @Post('clock/reset')
  @Roles('SUPER_ADMIN')
  reset() {
    this.guard();
    this.clock.reset();
    return { clock: this.clock.now() };
  }

  @Post('jobs/run')
  @Roles('SUPER_ADMIN', 'PLATFORM_ADMIN')
  runJobs() {
    this.guard();
    return this.jobs.runAll();
  }
}
