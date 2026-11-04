import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// ============================================================================
// DEVELOPER INTEGRATION POINT: Pay-later lender (FR-BNP-03, FR-BNP-05)
// ============================================================================
// The lender, not ToD, decides who gets credit. The developer implements
// LenderConnector for the signed lender: it passes the agreed application
// data, draws on the facility to fund escrow once the client has signed the
// acknowledgement of debt, and reports repayments ToD records.
//
// A lender that decides later (not within the submit call) reports its
// decision by calling PayLaterService.lenderDecision() (paylater/paylater.service.ts).
//
// Every call carries an idempotency key; LenderGateway records each key once
// so a repeated call never draws twice (FR-ESC-11).

export interface LenderApplication {
  idempotencyKey: string;
  agreementRef: string;
  amount: number; // santim
  tenorDays: number;
  purpose: string;
  cycle: number;
  enterprise: {
    name: string | null;
    tin: string | null;
    tradeLicenceNo: string | null;
    beneficialOwner: string | null;
    beneficialOwnerVerified: boolean;
    establishedOn: string | null;
    monthsInOperation: number | null;
    sector: string | null;
    subCity: string | null;
    staffSize: number | null;
    bankReference: string | null; // partner-bank identity reference
  };
  history: { completedAssignments: number; valueCompleted: number; disputes: number; previousCycles: number; latePayments: number };
  limits: { enterprise: number; assignment: number };
}

export interface LenderDecision {
  lenderRef: string;
  decision?: 'APPROVED' | 'DECLINED'; // absent when the lender will decide later
  reason?: string;
}

export interface DrawdownRequest {
  idempotencyKey: string;
  lenderRef: string;
  agreementRef: string;
  amount: number;
  paymentReference: string; // the escrow payment reference the facility pays into
}

export interface RepaymentReport {
  idempotencyKey: string;
  lenderRef: string;
  agreementRef: string;
  amount: number;
  reference: string;
  paidOn: string;
}

export interface LenderConnector {
  readonly name: string;
  submit(a: LenderApplication): Promise<LenderDecision>;
  drawdown(d: DrawdownRequest): Promise<{ drawdownRef: string }>;
  reportRepayment(r: RepaymentReport): Promise<void>;
}

export const LENDER_CONNECTOR = 'LENDER_CONNECTOR';

// TEST STAND-IN. Approves anything within the lender's per-assignment limit
// and declines the rest. Replace with the signed lender's adapter before any
// live lending. Refuses to run in production.
@Injectable()
export class TestLenderConnector implements LenderConnector {
  readonly name = 'test-stand-in';
  private log = new Logger('TestLender');

  async submit(a: LenderApplication): Promise<LenderDecision> {
    const lenderRef = `TL-${a.agreementRef}`;
    if (a.amount > a.limits.assignment) return { lenderRef, decision: 'DECLINED', reason: 'Above the per-assignment limit (test lender).' };
    this.log.log(`approve ${a.amount} for ${a.agreementRef}`);
    return { lenderRef, decision: 'APPROVED', reason: 'Approved by the test lender.' };
  }
  async drawdown(d: DrawdownRequest) {
    this.log.log(`drawdown ${d.amount} into ${d.paymentReference}`);
    return { drawdownRef: `TLD-${d.agreementRef}` };
  }
  async reportRepayment(r: RepaymentReport) {
    this.log.log(`repayment ${r.amount} on ${r.agreementRef}`);
  }
}

// Records every lender call once, keyed by idempotency key, in the same
// register as escrow calls so the two can be reconciled.
@Injectable()
export class LenderGateway {
  constructor(
    @Inject(LENDER_CONNECTOR) readonly connector: LenderConnector,
    private readonly prisma: PrismaService,
  ) {}

  private async once<T>(kind: string, key: string, ref: string, payload: object, call: () => Promise<T>): Promise<T> {
    const existing = await this.prisma.escrowInstruction.findUnique({ where: { idempotencyKey: key } });
    if (existing?.status === 'ACCEPTED') return existing.response as T;
    if (!existing) {
      await this.prisma.escrowInstruction.create({ data: { idempotencyKey: key, kind, assignmentRef: ref, payload: payload as any, provider: `lender:${this.connector.name}` } });
    }
    const response = await call();
    await this.prisma.escrowInstruction.update({ where: { idempotencyKey: key }, data: { status: 'ACCEPTED', response: (response ?? null) as any } });
    return response;
  }

  submit(a: LenderApplication) {
    return this.once('LENDER_APPLY', a.idempotencyKey, a.agreementRef, a, () => this.connector.submit(a));
  }
  drawdown(d: DrawdownRequest) {
    return this.once('LENDER_DRAWDOWN', d.idempotencyKey, d.agreementRef, d, () => this.connector.drawdown(d));
  }
  reportRepayment(r: RepaymentReport) {
    return this.once('LENDER_REPAYMENT', r.idempotencyKey, r.agreementRef, r, () => this.connector.reportRepayment(r));
  }
}
