import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AuditService } from '../common/audit.service';
import { SessionUser } from '../common/auth.decorators';
import { ClockService } from '../common/clock.service';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';

export interface ReportFilter {
  from?: string;
  to?: string;
  serviceArea?: string;
  clientLevel?: string;
}

const DAY = 86_400_000;
const ageBand = (dob: Date | null, at: Date) => {
  if (!dob) return 'Unknown';
  const age = Math.floor((at.getTime() - dob.getTime()) / (365.25 * DAY));
  if (age < 25) return '18-24';
  if (age < 30) return '25-29';
  if (age <= 35) return '30-35';
  return '36+';
};
const yesNo = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : 'Not stated');
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Programme indicators (FR-MEL-01..06). Figures are computed from the
 * operational tables; any cell describing fewer people than
 * SMALL_CELL_THRESHOLD is suppressed in reports that include disability,
 * displacement or other marginalised status (FR-MEL-05).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParametersService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
  ) {}

  private range(f: ReportFilter) {
    const from = f.from ? new Date(f.from) : new Date('2020-01-01');
    const to = f.to ? new Date(new Date(f.to).getTime() + DAY - 1) : this.clock.now();
    return { from, to };
  }

  private async closedAssignments(f: ReportFilter) {
    const { from, to } = this.range(f);
    return this.prisma.assignment.findMany({
      where: {
        status: 'CLOSED',
        closedAt: { gte: from, lte: to },
        ...(f.serviceArea ? { serviceAreaId: (await this.areaId(f.serviceArea)) ?? '-' } : {}),
      },
      select: { id: true, clientId: true, talentId: true, agreedPrice: true, packageVersionId: true, closedAt: true, fundedAt: true },
    });
  }

  private async areaId(code: string) {
    return (await this.prisma.serviceArea.findUnique({ where: { code } }))?.id;
  }

  async indicators(f: ReportFilter) {
    const { from, to } = this.range(f);
    const closed = await this.closedAssignments(f);
    const fundedEnded = await this.prisma.assignment.count({ where: { fundedAt: { not: null }, status: { in: ['CLOSED', 'CANCELLED'] }, updatedAt: { gte: from, lte: to } } });
    const funded = await this.prisma.assignment.count({ where: { fundedAt: { gte: from, lte: to } } });
    const perClient = new Map<string, number>();
    for (const a of closed) perClient.set(a.clientId, (perClient.get(a.clientId) ?? 0) + 1);
    const allTimeClosedByClient = await this.prisma.assignment.groupBy({ by: ['clientId'], where: { status: 'CLOSED', closedAt: { lte: to } }, _count: { _all: true } });
    const paid = await this.prisma.settlement.aggregate({ where: { status: 'PAID', paidAt: { gte: from, lte: to } }, _sum: { net: true, commission: true, gross: true } });
    const ratings = await this.prisma.rating.aggregate({ where: { direction: 'CLIENT_TO_TALENT', publishedAt: { gte: from, lte: to }, removedReason: null }, _avg: { average: true }, _count: { _all: true } });
    const disputes = await this.prisma.dispute.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, closedAt: true } });
    const resolved = disputes.filter((d) => d.closedAt);
    const vetted = await this.prisma.talentProfile.count({ where: { vettingStatus: 'APPROVED', user: { identityStatus: { in: ['VERIFIED', 'PROVISIONAL'] } } } });
    const verifiedClients = await this.prisma.clientProfile.count({ where: { OR: [{ levelConfirmedAt: { not: null } }, { user: { identityStatus: 'VERIFIED' } }] } });

    return {
      period: { from, to },
      vettedTalents: vetted,
      verifiedClients,
      completedAssignments: closed.length,
      completionRate: fundedEnded ? round((closed.length / fundedEnded) * 100) : null,
      repeatClients: allTimeClosedByClient.filter((c) => c._count._all >= 2).length,
      talentIncomeNetSantim: paid._sum.net ?? 0,
      grossTransactionValueSantim: paid._sum.gross ?? 0,
      commissionRevenueSantim: paid._sum.commission ?? 0,
      payLaterDefaultRate: (await this.params.get<boolean>('PAY_LATER_ENABLED')) ? 0 : null,
      satisfaction: ratings._avg.average ? round(ratings._avg.average, 2) : null,
      ratingCount: ratings._count._all,
      disputeRate: funded ? round((disputes.length / funded) * 100) : null,
      disputesOpened: disputes.length,
      averageResolutionDays: resolved.length ? round(resolved.reduce((s, d) => s + (d.closedAt!.getTime() - d.createdAt.getTime()) / DAY, 0) / resolved.length) : null,
      notes: { completionRate: 'Closed assignments as a share of funded assignments that ended in the period.', payLaterDefaultRate: 'Not applicable while pay-later is switched off.' },
    };
  }

  async talentBreakdown(f: ReportFilter) {
    const now = this.clock.now();
    const threshold = await this.params.get<number>('SMALL_CELL_THRESHOLD');
    const talents = await this.prisma.talentProfile.findMany({ include: { user: { select: { id: true, sex: true, dateOfBirth: true, identityStatus: true } } } });
    const closed = await this.closedAssignments(f);
    const { from, to } = this.range(f);
    const settlements = await this.prisma.settlement.findMany({ where: { status: 'PAID', paidAt: { gte: from, lte: to } }, select: { net: true, milestone: { select: { assignment: { select: { talentId: true } } } } } });
    const completedBy = new Map<string, number>();
    for (const a of closed) if (a.talentId) completedBy.set(a.talentId, (completedBy.get(a.talentId) ?? 0) + 1);
    const incomeBy = new Map<string, number>();
    for (const s of settlements) {
      const t = s.milestone.assignment.talentId;
      if (t) incomeBy.set(t, (incomeBy.get(t) ?? 0) + s.net);
    }
    const dims: Record<string, (t: (typeof talents)[number]) => string> = {
      sex: (t) => t.user.sex ?? 'Not verified',
      ageBand: (t) => ageBand(t.user.dateOfBirth, now),
      disability: (t) => yesNo(t.disability),
      displaced: (t) => yesNo(t.displaced),
      otherMarginalised: (t) => yesNo(t.otherMarginalised),
    };
    const out: Record<string, any[]> = {};
    for (const [dim, key] of Object.entries(dims)) {
      const groups = new Map<string, typeof talents>();
      for (const t of talents) {
        const k = key(t);
        groups.set(k, [...(groups.get(k) ?? []), t]);
      }
      out[dim] = [...groups.entries()].map(([group, ts]) => {
        const vetted = ts.filter((t) => t.vettingStatus === 'APPROVED');
        const earners = ts.filter((t) => incomeBy.has(t.userId));
        const row = {
          group,
          registered: ts.length,
          vetted: vetted.length,
          withCompletedAssignment: ts.filter((t) => completedBy.has(t.userId)).length,
          completedAssignments: ts.reduce((s, t) => s + (completedBy.get(t.userId) ?? 0), 0),
          netIncomeSantim: ts.reduce((s, t) => s + (incomeBy.get(t.userId) ?? 0), 0),
          averageNetIncomeSantim: earners.length ? Math.round(earners.reduce((s, t) => s + incomeBy.get(t.userId)!, 0) / earners.length) : null,
        };
        // Income for fewer earners than the threshold would reveal individual pay.
        const safe: any = earners.length > 0 && earners.length < threshold ? { ...row, netIncomeSantim: 'suppressed', averageNetIncomeSantim: 'suppressed' } : row;
        return suppress(safe, threshold);
      });
    }
    return { threshold, suppressionNote: `Figures describing fewer than ${threshold} people are shown as suppressed.`, breakdown: out };
  }

  async clientBreakdown(f: ReportFilter) {
    const threshold = await this.params.get<number>('SMALL_CELL_THRESHOLD');
    const clients = await this.prisma.clientProfile.findMany({ where: f.clientLevel ? { level: f.clientLevel as any } : {} });
    const closed = await this.closedAssignments(f);
    const byClient = new Map<string, { n: number; value: number }>();
    for (const a of closed) {
      const c = byClient.get(a.clientId) ?? { n: 0, value: 0 };
      byClient.set(a.clientId, { n: c.n + 1, value: c.value + (a.agreedPrice ?? 0) });
    }
    const dims: Record<string, (c: (typeof clients)[number]) => string> = {
      level: (c) => c.level,
      sector: (c) => c.sector ?? 'Not stated',
      subCity: (c) => c.subCity ?? 'Not stated',
      womenLed: (c) => yesNo(c.womenLed),
      youthLed: (c) => yesNo(c.youthLed),
      pwdOwned: (c) => yesNo(c.pwdOwned),
      referralSource: (c) => c.referralSource,
    };
    const out: Record<string, any[]> = {};
    for (const [dim, key] of Object.entries(dims)) {
      const groups = new Map<string, typeof clients>();
      for (const c of clients) groups.set(key(c), [...(groups.get(key(c)) ?? []), c]);
      out[dim] = [...groups.entries()].map(([group, cs]) => {
        const buying = cs.filter((c) => byClient.has(c.userId));
        const row = {
          group,
          registered: cs.length,
          withCompletedAssignment: buying.length,
          repeat: cs.filter((c) => (byClient.get(c.userId)?.n ?? 0) >= 2).length,
          completedAssignments: buying.reduce((s, c) => s + byClient.get(c.userId)!.n, 0),
          spendSantim: buying.reduce((s, c) => s + byClient.get(c.userId)!.value, 0),
        };
        // Ownership by persons with disability is a disability attribute (FR-MEL-05).
        return dim === 'pwdOwned' ? suppress(row, threshold) : row;
      });
    }
    return { threshold, breakdown: out };
  }

  // FR-MEL-03 onboarding and demand funnels.
  async funnels(f: ReportFilter) {
    const talents = await this.prisma.user.findMany({ where: { roles: { has: 'TALENT' } }, select: { id: true, identityStatus: true, assistedById: true, talentProfile: { select: { vettingStatus: true } } } });
    const clients = await this.prisma.user.findMany({ where: { roles: { has: 'CLIENT' } }, select: { id: true, identityStatus: true, clientProfile: { select: { referralSource: true, levelConfirmedAt: true } } } });
    const { to } = this.range(f);
    const tCounts = await this.prisma.assignment.groupBy({ by: ['talentId'], where: { status: 'CLOSED', closedAt: { lte: to }, talentId: { not: null } }, _count: { _all: true } });
    const cCounts = await this.prisma.assignment.groupBy({ by: ['clientId'], where: { status: 'CLOSED', closedAt: { lte: to } }, _count: { _all: true } });
    const tMap = new Map(tCounts.map((c) => [c.talentId!, c._count._all]));
    const cMap = new Map(cCounts.map((c) => [c.clientId, c._count._all]));
    const leads = await this.prisma.assignment.count({ where: { status: 'REQUESTED' } });

    const stages = (rows: { label: string; n: number }[]) =>
      rows.map((r, i) => ({ ...r, conversionFromPrevious: i && rows[i - 1].n ? round((r.n / rows[i - 1].n) * 100) : null }));
    const talentFunnel = (ts: typeof talents) =>
      stages([
        { label: 'Registered', n: ts.length },
        { label: 'Identity verified', n: ts.filter((t) => ['VERIFIED', 'PROVISIONAL'].includes(t.identityStatus)).length },
        { label: 'Vetted', n: ts.filter((t) => t.talentProfile?.vettingStatus === 'APPROVED').length },
        { label: 'First assignment', n: ts.filter((t) => (tMap.get(t.id) ?? 0) >= 1).length },
        { label: 'Repeat', n: ts.filter((t) => (tMap.get(t.id) ?? 0) >= 2).length },
      ]);
    const clientFunnel = (cs: typeof clients) =>
      stages([
        { label: 'Registered', n: cs.length },
        { label: 'Verified', n: cs.filter((c) => c.identityStatus === 'VERIFIED' || c.clientProfile?.levelConfirmedAt).length },
        { label: 'First transaction', n: cs.filter((c) => (cMap.get(c.id) ?? 0) >= 1).length },
        { label: 'Repeat', n: cs.filter((c) => (cMap.get(c.id) ?? 0) >= 2).length },
      ]);
    const sources = [...new Set(clients.map((c) => c.clientProfile?.referralSource ?? 'NO_PROFILE'))];
    return {
      openClientRequests: leads,
      talent: { all: talentFunnel(talents), assisted: talentFunnel(talents.filter((t) => t.assistedById)), self: talentFunnel(talents.filter((t) => !t.assistedById)) },
      client: { all: clientFunnel(clients), bySource: Object.fromEntries(sources.map((s) => [s, clientFunnel(clients.filter((c) => (c.clientProfile?.referralSource ?? 'NO_PROFILE') === s))])) },
    };
  }

  // FR-MEL-04 willingness-to-pay evidence by package and client segment.
  async willingnessToPay(f: ReportFilter) {
    const { from, to } = this.range(f);
    const records = await this.prisma.priceRecord.findMany({
      where: { at: { gte: from, lte: to } },
      select: { kind: true, amount: true, assignment: { select: { clientId: true, packageVersion: { select: { package: { select: { code: true } } } } } } },
    });
    const levels = new Map((await this.prisma.clientProfile.findMany({ select: { userId: true, level: true } })).map((c) => [c.userId, c.level]));
    const paid = await this.prisma.settlement.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { gross: true, milestone: { select: { assignment: { select: { id: true, clientId: true, packageVersion: { select: { package: { select: { code: true } } } } } } } } },
    });
    type Cell = { offered: number[]; accepted: number[]; paid: Map<string, number> };
    const table = new Map<string, Cell>();
    const cell = (pkg: string, seg: string) => {
      const k = `${pkg}|${seg}`;
      if (!table.has(k)) table.set(k, { offered: [], accepted: [], paid: new Map() });
      return table.get(k)!;
    };
    for (const r of records) {
      const c = cell(r.assignment.packageVersion?.package.code ?? 'CUSTOM', levels.get(r.assignment.clientId) ?? 'UNKNOWN');
      if (r.kind === 'OFFERED' || r.kind === 'COUNTERED') c.offered.push(r.amount);
      if (r.kind === 'ACCEPTED') c.accepted.push(r.amount);
    }
    for (const s of paid) {
      const a = s.milestone.assignment;
      const c = cell(a.packageVersion?.package.code ?? 'CUSTOM', levels.get(a.clientId) ?? 'UNKNOWN');
      c.paid.set(a.id, (c.paid.get(a.id) ?? 0) + s.gross);
    }
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const rows = [...table.entries()].map(([k, c]) => {
      const [pkg, segment] = k.split('|');
      return {
        package: pkg,
        segment,
        offers: c.offered.length,
        averageOfferedSantim: avg(c.offered),
        accepted: c.accepted.length,
        averageAcceptedSantim: avg(c.accepted),
        assignmentsPaid: c.paid.size,
        averagePaidSantim: avg([...c.paid.values()]),
      };
    });
    const allPaid = paid.reduce((m, s) => m.set(s.milestone.assignment.id, (m.get(s.milestone.assignment.id) ?? 0) + s.gross), new Map<string, number>());
    return { rows: rows.sort((a, b) => a.package.localeCompare(b.package) || a.segment.localeCompare(b.segment)), averageAssignmentValueSantim: avg([...allPaid.values()]) };
  }

  // FR-MEL-06: spreadsheet export carrying the date range and filters applied.
  async exportXlsx(me: SessionUser, f: ReportFilter): Promise<Buffer> {
    const [ind, talent, client, funnels, wtp] = await Promise.all([this.indicators(f), this.talentBreakdown(f), this.clientBreakdown(f), this.funnels(f), this.willingnessToPay(f)]);
    const { from, to } = this.range(f);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Talent on Demand platform';
    const about = wb.addWorksheet('About this export');
    about.addRows([
      ['Talent on Demand: programme indicators'],
      [],
      ['Date range', `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`],
      ['Service area filter', f.serviceArea ?? 'All'],
      ['Client level filter', f.clientLevel ?? 'All'],
      ['Generated at', this.clock.now().toISOString()],
      ['Generated by', me.id],
      ['Amounts', 'Ethiopian birr (ETB)'],
      ['Small-cell rule', talent.suppressionNote],
    ]);
    about.getColumn(1).width = 24;
    about.getColumn(2).width = 60;

    const etb = (s: number | null) => (s === null ? null : s / 100);
    const ws = wb.addWorksheet('Core indicators');
    ws.columns = [{ header: 'Indicator', width: 40 }, { header: 'Value', width: 20 }];
    ws.addRows([
      ['Vetted talents', ind.vettedTalents],
      ['Verified clients', ind.verifiedClients],
      ['Completed assignments', ind.completedAssignments],
      ['Assignment completion rate (%)', ind.completionRate],
      ['Repeat clients', ind.repeatClients],
      ['Talent income net of commission (ETB)', etb(ind.talentIncomeNetSantim)],
      ['Gross transaction value (ETB)', etb(ind.grossTransactionValueSantim)],
      ['Commission revenue (ETB)', etb(ind.commissionRevenueSantim)],
      ['Pay-later default rate (%)', ind.payLaterDefaultRate ?? 'Not applicable'],
      ['Satisfaction (average rating out of 5)', ind.satisfaction],
      ['Dispute rate (% of funded assignments)', ind.disputeRate],
      ['Average dispute resolution (days)', ind.averageResolutionDays],
    ]);

    const table = (name: string, data: Record<string, any[]>) => {
      const sheet = wb.addWorksheet(name);
      for (const [dim, rows] of Object.entries(data)) {
        sheet.addRow([dim]).font = { bold: true };
        if (!rows.length) continue;
        const keys = Object.keys(rows[0]);
        sheet.addRow(keys.map((k) => k.replace(/Santim$/, ' (ETB)')));
        for (const r of rows) sheet.addRow(keys.map((k) => (k.endsWith('Santim') && typeof r[k] === 'number' ? r[k] / 100 : r[k])));
        sheet.addRow([]);
      }
      sheet.columns.forEach((c) => (c.width = 22));
    };
    table('Talent breakdown', talent.breakdown);
    table('Client breakdown', client.breakdown);
    table('Talent funnel', { all: funnels.talent.all, assisted: funnels.talent.assisted, self: funnels.talent.self });
    table('Client funnel', { all: funnels.client.all, ...funnels.client.bySource });
    table('Willingness to pay', { 'by package and segment': wtp.rows });

    await this.audit.log({ actorId: me.id, action: 'REPORT_EXPORTED', entityType: 'Report', after: { from, to, ...f } });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

function suppress<T extends { registered: number }>(row: T, threshold: number) {
  if (row.registered >= threshold) {
    // Small sub-counts inside a large group can still identify people.
    const out: any = { ...row };
    for (const [k, v] of Object.entries(row)) if (k !== 'registered' && typeof v === 'number' && !k.endsWith('Santim') && v > 0 && v < threshold) out[k] = `<${threshold}`;
    return out;
  }
  const out: any = { group: (row as any).group };
  for (const k of Object.keys(row)) if (k !== 'group') out[k] = 'suppressed';
  return out;
}
