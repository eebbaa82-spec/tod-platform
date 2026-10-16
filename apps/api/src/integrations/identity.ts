import { Injectable } from '@nestjs/common';
import { IdentityStatus, Sex } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { maskIdentifier, sha256 } from '../common/crypto';
import { fail } from '../common/errors';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { PublicationService } from './publication';

// ============================================================================
// DEVELOPER INTEGRATION POINT: Fayda identity verification (section 4.2)
// ============================================================================
// The Fayda eKYC module (VeriFayda / eSignet relying-party flow, consent
// capture, encrypted identifier vault, manual-verification queue, retries)
// is built by the integration developer. When a verification finishes, that
// module calls IdentityResultService.apply() with the outcome. The
// marketplace never sees the authentic FIN/FAN: only an internal token and the
// masked form (FR-KYC-05, FR-KYC-06).
//
// The interface below is what the rest of the platform depends on.

export interface IdentityResult {
  userId: string;
  status: Extract<IdentityStatus, 'VERIFIED' | 'PROVISIONAL' | 'FAILED' | 'PENDING'>;
  // Internal, stable token for the person; used to enforce one account per identity.
  identityToken?: string;
  // The FAN or FIN in clear text is passed only so this service can mask it; it is never stored here.
  identifierForMasking?: string;
  verifiedName?: string;
  sex?: Sex;
  dateOfBirth?: Date;
  photoFileId?: string;
  method: 'FAYDA_OTP' | 'FAYDA_BIOMETRIC' | 'MANUAL_PROVISIONAL' | 'TEST_STAND_IN';
  reference?: string;
}

export interface IdentityVerificationProvider {
  readonly name: string;
  // Starts verification for a user; returns where to send them, if anywhere.
  start(userId: string): Promise<{ status: 'PENDING'; redirectUrl?: string; message?: string }>;
}

// Placeholder used until the Fayda module is connected. It does nothing except
// mark the request as pending; staff can complete it with the test stand-in.
@Injectable()
export class PendingIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'not-connected';
  async start() {
    return { status: 'PENDING' as const, message: 'Identity verification with Fayda is not connected yet. Staff will complete it.' };
  }
}

@Injectable()
export class IdentityResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: ParametersService,
    private readonly clock: ClockService,
    private readonly publication: PublicationService,
  ) {}

  async apply(r: IdentityResult, actorId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    if (r.status === 'VERIFIED' || r.status === 'PROVISIONAL') {
      // One account per identity (FR-KYC-04).
      if (r.identityToken) {
        const other = await this.prisma.user.findFirst({ where: { identityToken: r.identityToken, NOT: { id: r.userId } } });
        if (other) {
          await this.audit.log({ actorId, action: 'IDENTITY_DUPLICATE_BLOCKED', entityType: 'User', entityId: r.userId, after: { existingUserId: other.id, method: r.method } });
          throw fail.conflict('IDENTITY_DUPLICATE', 'This identity is already registered to another account.');
        }
      }
      // Under-18s cannot register (FR-ACC-09).
      if (r.dateOfBirth) {
        const minAge = await this.params.get<number>('MINIMUM_AGE');
        if (ageOn(r.dateOfBirth, this.clock.now()) < minAge) {
          await this.prisma.user.update({ where: { id: r.userId }, data: { identityStatus: 'FAILED', status: 'DEACTIVATED', deactivatedAt: this.clock.now() } });
          await this.audit.log({ actorId, action: 'REGISTRATION_REFUSED_UNDER_AGE', entityType: 'User', entityId: r.userId });
          throw fail.forbidden('UNDER_AGE', `You must be at least ${minAge} years old to use the platform.`);
        }
      }
    }
    const data = {
      identityStatus: r.status,
      identityToken: r.identityToken ?? user.identityToken,
      identityMasked: r.identifierForMasking ? maskIdentifier(r.identifierForMasking) : user.identityMasked,
      verifiedName: r.verifiedName ?? user.verifiedName,
      sex: r.sex ?? user.sex,
      dateOfBirth: r.dateOfBirth ?? user.dateOfBirth,
      photoFileId: r.photoFileId ?? user.photoFileId,
      identityVerifiedAt: r.status === 'VERIFIED' ? this.clock.now() : user.identityVerifiedAt,
    };
    const updated = await this.prisma.user.update({ where: { id: r.userId }, data });
    await this.audit.log({
      actorId,
      action: 'IDENTITY_RESULT',
      entityType: 'User',
      entityId: r.userId,
      before: { status: user.identityStatus },
      // Only the reference token's hash is logged, never personal attributes.
      after: { status: r.status, method: r.method, reference: r.reference, tokenHash: r.identityToken ? sha256(r.identityToken).slice(0, 16) : null },
    });
    await this.publication.refresh(r.userId);
    return updated;
  }
}

export function ageOn(dob: Date, on: Date) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export const IDENTITY_PROVIDER = 'IDENTITY_PROVIDER';
