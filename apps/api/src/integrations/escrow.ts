import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// ============================================================================
// DEVELOPER INTEGRATION POINT: Bank-held escrow and reconciliation (4.9)
// ============================================================================
// Client money is held by the partner bank, never by the Operator (FR-ESC-04).
// The developer's escrow module implements EscrowProvider: it sends these
// instructions to the bank and mobile-money channels (API or secure file),
// keeps the transaction-level escrow ledger, enforces dual authorisation on
// manual operations, runs the daily reconciliation and blocks payouts on
// variances (FR-ESC-03, -07, -09, -12).
//
// In the other direction, the escrow module reports events back by calling
// PaymentEventsService (payments/payment-events.service.ts):
//   fundingConfirmed()  when the client's money has arrived (FR-ESC-02)
//   payoutCompleted()   when the talent has been paid
//   refundCompleted()   when the client has been refunded
//
// Every instruction carries an idempotency key; sending the same key twice
// must never move money twice (FR-ESC-11). EscrowGateway also refuses to
// resend a key it has already recorded.

export interface Party {
  userId: string;
  name: string;
  channel?: string | null; // BANK, TELEBIRR, CBE_BIRR
  accountRef?: string | null; // masked; the escrow module resolves the real account
}

export interface CollectionRequest {
  idempotencyKey: string;
  assignmentRef: string;
  paymentReference: string;
  amount: number; // santim
  payer: Party;
}

export interface ReleaseInstruction {
  idempotencyKey: string;
  assignmentRef: string;
  milestoneSeq: number;
  instructionRef: string;
  gross: number;
  commission: number;
  net: number;
  payee: Party;
  reason: 'ACCEPTED' | 'REVIEW_WINDOW_EXPIRED' | 'DISPUTE_DECISION';
}

export interface RefundInstruction {
  idempotencyKey: string;
  assignmentRef: string;
  milestoneSeq?: number;
  instructionRef: string;
  amount: number;
  payer: Party; // refund goes back to the originating account or channel (FR-ESC-10)
  reason: string;
}

export interface SplitInstruction {
  idempotencyKey: string;
  assignmentRef: string;
  milestoneSeq: number;
  instructionRef: string;
  toTalent: { gross: number; commission: number; net: number; payee: Party };
  toClient: { amount: number; payer: Party };
  approvals: { requestedById: string; approvedById: string };
}

export interface FreezeInstruction {
  idempotencyKey: string;
  assignmentRef: string;
  milestoneSeq: number;
  amount: number;
  disputeRef: string;
}

export interface EscrowProvider {
  readonly name: string;
  // true when payouts complete immediately (test stand-in only).
  readonly completesImmediately?: boolean;
  requestCollection(i: CollectionRequest): Promise<{ instructionsEn: string; instructionsAm: string; checkoutUrl?: string }>;
  release(i: ReleaseInstruction): Promise<void>;
  refund(i: RefundInstruction): Promise<void>;
  split(i: SplitInstruction): Promise<void>;
  freeze(i: FreezeInstruction): Promise<void>;
  unfreeze(i: FreezeInstruction): Promise<void>;
}

export const ESCROW_PROVIDER = 'ESCROW_PROVIDER';

// TEST STAND-IN. Records instructions and does nothing else. Replace with the
// partner-bank adapter before any live transaction. Refuses to run in production.
@Injectable()
export class TestEscrowProvider implements EscrowProvider {
  readonly name = 'test-stand-in';
  readonly completesImmediately = true;
  private log = new Logger('TestEscrow');

  async requestCollection(i: CollectionRequest) {
    this.log.log(`collect ${i.amount} for ${i.assignmentRef} ref ${i.paymentReference}`);
    return {
      instructionsEn: `TEST MODE. In live use the client pays into the partner-bank escrow account by telebirr, CBE Birr or bank transfer, quoting reference ${i.paymentReference}.`,
      instructionsAm: `የሙከራ ሁኔታ። በእውነተኛ አገልግሎት ደንበኛው በቴሌብር፣ በሲቢኢ ብር ወይም በባንክ ዝውውር ወደ አጋር ባንክ የኤስክሮ ሂሳብ ይከፍላል፤ የመለያ ቁጥር ${i.paymentReference} ይጠቀሳል።`,
    };
  }
  async release(i: ReleaseInstruction) {
    this.log.log(`release ${i.net} to ${i.payee.name} for ${i.assignmentRef}/${i.milestoneSeq}`);
  }
  async refund(i: RefundInstruction) {
    this.log.log(`refund ${i.amount} to ${i.payer.name} for ${i.assignmentRef}`);
  }
  async split(i: SplitInstruction) {
    this.log.log(`split ${i.toTalent.gross}/${i.toClient.amount} for ${i.assignmentRef}/${i.milestoneSeq}`);
  }
  async freeze(i: FreezeInstruction) {
    this.log.log(`freeze ${i.amount} for ${i.disputeRef}`);
  }
  async unfreeze(i: FreezeInstruction) {
    this.log.log(`unfreeze ${i.amount} for ${i.disputeRef}`);
  }
}

type Kind = 'COLLECT' | 'RELEASE' | 'REFUND' | 'SPLIT' | 'FREEZE' | 'UNFREEZE';

// Wraps the provider: records every instruction once, keyed by idempotency key.
@Injectable()
export class EscrowGateway {
  constructor(
    @Inject(ESCROW_PROVIDER) readonly provider: EscrowProvider,
    private readonly prisma: PrismaService,
  ) {}

  private async once<T>(kind: Kind, key: string, assignmentRef: string, payload: object, call: () => Promise<T>): Promise<T | null> {
    const existing = await this.prisma.escrowInstruction.findUnique({ where: { idempotencyKey: key } });
    if (existing) return (existing.response as T) ?? null;
    await this.prisma.escrowInstruction.create({
      data: { idempotencyKey: key, kind, assignmentRef, payload: payload as any, provider: this.provider.name },
    });
    const response = await call();
    await this.prisma.escrowInstruction.update({
      where: { idempotencyKey: key },
      data: { status: 'ACCEPTED', response: (response ?? null) as any },
    });
    return response;
  }

  requestCollection(i: CollectionRequest) {
    return this.once('COLLECT', i.idempotencyKey, i.assignmentRef, i, () => this.provider.requestCollection(i));
  }
  release(i: ReleaseInstruction) {
    return this.once('RELEASE', i.idempotencyKey, i.assignmentRef, i, () => this.provider.release(i));
  }
  refund(i: RefundInstruction) {
    return this.once('REFUND', i.idempotencyKey, i.assignmentRef, i, () => this.provider.refund(i));
  }
  split(i: SplitInstruction) {
    return this.once('SPLIT', i.idempotencyKey, i.assignmentRef, i, () => this.provider.split(i));
  }
  freeze(i: FreezeInstruction) {
    return this.once('FREEZE', i.idempotencyKey, i.assignmentRef, i, () => this.provider.freeze(i));
  }
  unfreeze(i: FreezeInstruction) {
    return this.once('UNFREEZE', i.idempotencyKey, i.assignmentRef, i, () => this.provider.unfreeze(i));
  }
}
