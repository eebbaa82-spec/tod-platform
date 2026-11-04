import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ParametersService } from '../common/parameters.service';
import { PrismaService } from '../common/prisma.service';
import { addWorkingDays } from '../common/working-days';

// The ten GESI indicators of the Inception Report (8.4), reported monthly
// (FR-MEL-11), against the group targets of 8.2 held as parameters, with
// the trajectory and parity flags of BR-24 to BR-26 (FR-MEL-12).

export type Group = 'ALL' | 'WOMEN' | 'MEN' | 'YOUTH' | 'YOUNG_WOMEN' | 'MALE_YOUTH' | 'WOMEN_AND_YOUTH' | 'DISABILITY' | 'IDP_RETURNEE' | 'OTHER_MARGINALISED';
const GROUPS: Group[] = ['ALL', 'WOMEN', 'MEN', 'YOUTH', 'YOUNG_WOMEN', 'MALE_YOUTH', 'WOMEN_AND_YOUTH', 'DISABILITY', 'IDP_RETURNEE', 'OTHER_MARGINALISED'];
// Groups built on restricted fields: small cells are suppressed (FR-MEL-05).
const RESTRICTED: Group[] = ['DISABILITY', 'IDP_RETURNEE', 'OTHER_MARGINALISED'];
const YOUTH_MAX_AGE = 29;
const DAY = 86_400_000;

interface Targets {
  pilotStart: string;
  pilotEnd: string;
  vettedTalentTotal: number;
  vetted: Partial<Record<Group, { share?: number; count?: number; minimumShare?: number }>>;
  womenLedMsmeShare: number;
  completedAssignments: Partial<Record<Group, number>>;
}
interface Flags {
  trajectoryShare: number;
  earningsParity: number;
  parityGapPoints: number;
  satisfiedShare: number;
}

interface Person {
  userId: string;
  sex: string | null;
  age: number | null;
  disability: boolean;
  displaced: boolean;
  otherMarginalised: boolean;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function inGroup(p: Person, g: Group) {
  const youth = p.age !== null && p.age >= 18 && p.age <= YOUTH_MAX_AGE;
  switch (g) {
    case 'ALL': return true;
    case 'WOMEN': return p.sex === 'FEMALE';
    case 'MEN': return p.sex === 'MALE';
    case 'YOUTH': return youth;
    case 'YOUNG_WOMEN': return youth && p.sex === 'FEMALE';
    case 'MALE_YOUTH': return youth && p.sex === 'MALE';
    case 'WOMEN_AND_YOUTH': return youth || p.sex === 'FEMALE';
    case 'DISABILITY': return p.disability;
    case 'IDP_RETURNEE': return p.displaced;
    case 'OTHER_MARGINALISED': return p.otherMarginalised;
  }
}

@Injectable()
export class GesiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParametersService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Scheduled: once a new month starts, tell the MEL Lead which groups were
  // flagged in the month just ended (FR-MEL-12, BR-24 to BR-26).
  async notifyMonthlyFlags() {
    const now = this.clock.now();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const done = await this.prisma.auditLog.findFirst({ where: { action: 'GESI_FLAGS_SENT', entityId: prev } });
    if (done) return { month: prev, skipped: true };
    const r = await this.report(prev);
    const lines = r.groups.filter((g) => Array.isArray(g.flags) && g.flags.length).map((g) => `${g.group}: ${(g.flags as string[]).join(', ')}`);
    if (r.earningsParity.flag) lines.push(`Earnings parity: women earn ${r.earningsParity.womenToMenPercent}% of men per assignment`);
    if (r.womenLedMsmes.flag) lines.push(`Women-led MSMEs: ${r.womenLedMsmes.shareOfRegisteredMsmes}% of registered MSMEs`);
    if (lines.length) await this.notifications.notifyRole(['MEL_OFFICER'], `GESI flags for ${prev}`, lines.join('; '), '/console/reports');
    await this.audit.log({ action: 'GESI_FLAGS_SENT', entityType: 'Report', entityId: prev, after: { flags: lines.length } });
    return { month: prev, flags: lines.length };
  }

  /** Monthly GESI report for the month containing `month` (YYYY-MM), cumulative to its end. */
  async report(month?: string) {
    const now = this.clock.now();
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : now.toISOString().slice(0, 7);
    const monthStart = new Date(`${m}-01T00:00:00Z`);
    const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const asOf = new Date(Math.min(nextMonth.getTime() - 1, now.getTime()));
    const targets = await this.params.get<Targets>('GESI_TARGETS');
    const flags = await this.params.get<Flags>('GESI_FLAGS');
    const threshold = await this.params.get<number>('SMALL_CELL_THRESHOLD');

    // --- People ----------------------------------------------------------------
    const talents = await this.prisma.talentProfile.findMany({
      where: { createdAt: { lte: asOf } },
      select: { userId: true, vettingStatus: true, disability: true, displaced: true, otherMarginalised: true, user: { select: { sex: true, dateOfBirth: true } } },
    });
    const person = (t: (typeof talents)[number]): Person => ({
      userId: t.userId,
      sex: t.user.sex,
      age: t.user.dateOfBirth ? Math.floor((asOf.getTime() - t.user.dateOfBirth.getTime()) / (365.25 * DAY)) : null,
      disability: !!t.disability,
      displaced: !!t.displaced,
      otherMarginalised: !!t.otherMarginalised,
    });
    const people = talents.map((t) => ({ ...person(t), vetted: t.vettingStatus === 'APPROVED' }));

    // --- Assignments and earnings ----------------------------------------------
    const closed = await this.prisma.assignment.findMany({ where: { status: 'CLOSED', closedAt: { lte: asOf }, talentId: { not: null } }, select: { talentId: true } });
    const completedBy = new Map<string, number>();
    for (const a of closed) completedBy.set(a.talentId!, (completedBy.get(a.talentId!) ?? 0) + 1);
    const paid = await this.prisma.settlement.findMany({
      where: { status: 'PAID', paidAt: { lte: asOf }, net: { gt: 0 } },
      select: { net: true, milestone: { select: { assignmentId: true, assignment: { select: { talentId: true } } } } },
    });
    const netBy = new Map<string, number>();
    const assignmentsPaidBy = new Map<string, Set<string>>();
    for (const s of paid) {
      const t = s.milestone.assignment.talentId;
      if (!t) continue;
      netBy.set(t, (netBy.get(t) ?? 0) + s.net);
      assignmentsPaidBy.set(t, (assignmentsPaidBy.get(t) ?? new Set()).add(s.milestone.assignmentId));
    }

    // --- Satisfaction (in-platform ratings given by talents) --------------------
    const ratings = await this.prisma.rating.findMany({ where: { direction: 'TALENT_TO_CLIENT', createdAt: { lte: asOf } }, select: { raterId: true, average: true } });

    const rows = GROUPS.map((g) => {
      const members = people.filter((p) => inGroup(p, g));
      const vetted = members.filter((p) => p.vetted);
      const active = vetted.filter((p) => completedBy.has(p.userId));
      const completed = members.reduce((s, p) => s + (completedBy.get(p.userId) ?? 0), 0);
      const earners = members.filter((p) => netBy.has(p.userId));
      const net = earners.reduce((s, p) => s + netBy.get(p.userId)!, 0);
      const paidAssignments = earners.reduce((s, p) => s + assignmentsPaidBy.get(p.userId)!.size, 0);
      const ids = new Set(members.map((p) => p.userId));
      const rs = ratings.filter((r) => ids.has(r.raterId));
      return {
        group: g,
        registered: members.length,
        vetted: vetted.length,
        onboardingRate: pct(vetted.length, members.length),
        activationRate: pct(active.length, vetted.length),
        completedAssignments: completed,
        netIncomeSantim: net,
        averageNetPerActiveTalentSantim: earners.length ? Math.round(net / earners.length) : null,
        averageNetPerAssignmentSantim: paidAssignments ? Math.round(net / paidAssignments) : null,
        satisfiedShare: pct(rs.filter((r) => r.average >= 4).length, rs.length),
        ratings: rs.length,
        earners: earners.length,
      };
    });
    const all = rows.find((r) => r.group === 'ALL')!;

    // --- Targets, trajectory and flags (BR-24 to BR-26) ------------------------
    const start = new Date(`${targets.pilotStart}T00:00:00Z`);
    const end = new Date(`${targets.pilotEnd}T23:59:59Z`);
    const elapsed = Math.min(1, Math.max(0, (asOf.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
    const out = rows.map((r) => {
      const t = targets.vetted[r.group];
      const targetCount = t?.count ?? (t?.share !== undefined ? Math.round((t.share / 100) * targets.vettedTalentTotal) : null);
      const trajectory = targetCount !== null ? Math.round(targetCount * elapsed) : null;
      const raisedFlags: string[] = [];
      if (r.group !== 'ALL' && trajectory && r.vetted < (flags.trajectoryShare / 100) * trajectory) raisedFlags.push('BELOW_TRAJECTORY');
      if (r.group !== 'ALL' && r.onboardingRate !== null && all.onboardingRate !== null && all.onboardingRate - r.onboardingRate > flags.parityGapPoints) raisedFlags.push('ONBOARDING_GAP');
      if (r.group !== 'ALL' && r.activationRate !== null && all.activationRate !== null && all.activationRate - r.activationRate > flags.parityGapPoints) raisedFlags.push('ACTIVATION_GAP');
      if (r.satisfiedShare !== null && r.satisfiedShare < flags.satisfiedShare) raisedFlags.push('SATISFACTION_BELOW_TARGET');
      const completedShare = pct(r.completedAssignments, all.completedAssignments);
      const completedTarget = targets.completedAssignments[r.group] ?? null;
      if (r.group !== 'ALL' && completedTarget !== null && completedShare !== null && completedShare < completedTarget) raisedFlags.push('COMPLETED_SHARE_BELOW_TARGET');
      const row = {
        ...r,
        vettedShare: pct(r.vetted, all.vetted),
        targetShare: t?.share ?? null,
        targetCount,
        trajectoryToDate: trajectory,
        completedShare,
        completedShareTarget: completedTarget,
        flags: raisedFlags,
      };
      return RESTRICTED.includes(r.group) ? suppressRow(row, threshold) : row;
    });

    // Earnings parity: women's average per assignment at least 90% of men's (BR-25).
    const women = rows.find((r) => r.group === 'WOMEN')!;
    const men = rows.find((r) => r.group === 'MEN')!;
    const parity = women.averageNetPerAssignmentSantim !== null && men.averageNetPerAssignmentSantim ? Math.round((women.averageNetPerAssignmentSantim / men.averageNetPerAssignmentSantim) * 1000) / 10 : null;

    // Women-owned or women-led MSMEs registered and transacting (indicator 6).
    const msmes = await this.prisma.clientProfile.findMany({
      where: { level: { in: ['VERIFIED_ENTERPRISE', 'BASIC_ENTERPRISE'] }, createdAt: { lte: asOf } },
      select: { userId: true, womenLed: true },
    });
    const buyers = new Set((await this.prisma.assignment.findMany({ where: { status: 'CLOSED', closedAt: { lte: asOf } }, select: { clientId: true } })).map((a) => a.clientId));
    const womenLed = msmes.filter((c) => c.womenLed);

    // Safeguarding complaints (indicator 9) and accommodation requests (indicator 10), in the month.
    const holidays = await this.params.holidays();
    const cases = await this.prisma.ticket.findMany({ where: { category: 'SAFEGUARDING', safeguardingType: { in: ['HARASSMENT', 'DISCRIMINATION', 'EXPLOITATION'] }, createdAt: { gte: monthStart, lte: asOf } }, select: { safeguardingType: true, createdAt: true, acknowledgedAt: true, status: true, outcome: true } });
    const ackOnTime = cases.filter((c) => c.acknowledgedAt && c.acknowledgedAt <= addWorkingDays(c.createdAt, 2, holidays)).length;
    const accommodation = await this.prisma.ticket.findMany({ where: { category: 'ACCOMMODATION', createdAt: { gte: monthStart, lte: asOf } }, select: { status: true } });

    const sup = (n: number) => (n > 0 && n < threshold ? `<${threshold}` : n);
    return {
      month: m,
      asOf,
      pilotElapsedShare: Math.round(elapsed * 1000) / 10,
      threshold,
      groups: out,
      indicators: {
        '1 Vetted talents by group': 'groups[].vetted, vettedShare, targetShare, targetCount, trajectoryToDate',
        '2 Onboarding completion rate': 'groups[].onboardingRate',
        '3 Activation rate': 'groups[].activationRate',
        '4 Share of completed assignments': 'groups[].completedShare, completedShareTarget',
        '5 Talent income net of commission': 'groups[].netIncomeSantim, averageNetPerActiveTalentSantim',
        '8 User satisfaction by group': 'groups[].satisfiedShare (in-platform ratings; surveys come with FR-MEL-08)',
      },
      earningsParity: { womenToMenPercent: parity, target: flags.earningsParity, flag: parity !== null && parity < flags.earningsParity },
      womenLedMsmes: {
        registered: womenLed.length,
        transacting: womenLed.filter((c) => buyers.has(c.userId)).length,
        shareOfRegisteredMsmes: pct(womenLed.length, msmes.length),
        target: targets.womenLedMsmeShare,
        flag: msmes.length > 0 && (pct(womenLed.length, msmes.length) ?? 0) < targets.womenLedMsmeShare,
      },
      outreach: { note: 'Participants in outreach events and digital-literacy clinics are recorded from attendance sheets outside the platform.' },
      safeguarding: {
        received: sup(cases.length),
        acknowledgedWithinTwoWorkingDays: sup(ackOnTime),
        closedWithOutcome: sup(cases.filter((c) => ['RESOLVED', 'CLOSED'].includes(c.status) && c.outcome).length),
      },
      accommodation: { received: accommodation.length, fulfilled: accommodation.filter((a) => ['RESOLVED', 'CLOSED'].includes(a.status)).length },
    };
  }
}

function suppressRow<T extends { registered: number; group: Group }>(row: T, threshold: number): T {
  if (row.registered >= threshold) {
    const out: any = { ...row };
    for (const [k, v] of Object.entries(row)) {
      if (['registered', 'targetShare', 'targetCount', 'trajectoryToDate', 'completedShareTarget'].includes(k)) continue;
      if (typeof v === 'number' && !k.endsWith('Santim') && !k.endsWith('Rate') && !k.endsWith('Share') && v > 0 && v < threshold) out[k] = `<${threshold}`;
    }
    if (row as any && (row as any).earners > 0 && (row as any).earners < threshold) {
      out.netIncomeSantim = 'suppressed';
      out.averageNetPerActiveTalentSantim = 'suppressed';
      out.averageNetPerAssignmentSantim = 'suppressed';
    }
    return out;
  }
  const out: any = { group: row.group, targetShare: (row as any).targetShare, targetCount: (row as any).targetCount, trajectoryToDate: (row as any).trajectoryToDate };
  for (const k of Object.keys(row)) if (!(k in out)) out[k] = 'suppressed';
  out.flags = [];
  return out;
}
