import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';
import { sha256 } from './crypto';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

// Writes the append-only, hash-chained audit log (FR-ADM-05, NFR-SEC-07).
// Each row's hash covers the previous row's hash, so any later alteration
// breaks the chain and is detected by verifyChain().
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Tx): Promise<void> {
    const run = async (db: Tx) => {
      // Serialise writers so the chain never forks.
      await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock(424242)');
      const last = await db.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const at = new Date();
      const body = {
        at: at.toISOString(),
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: normalise(entry.before),
        after: normalise(entry.after),
        ip: entry.ip ?? null,
      };
      const prevHash = last?.hash ?? null;
      const hash = sha256((prevHash ?? '') + canonical(body));
      await db.auditLog.create({
        data: {
          at,
          actorId: body.actorId,
          action: body.action,
          entityType: body.entityType,
          entityId: body.entityId,
          before: body.before ?? Prisma.JsonNull,
          after: body.after ?? Prisma.JsonNull,
          ip: body.ip,
          prevHash,
          hash,
        },
      });
    };
    if (tx) return run(tx);
    await this.prisma.$transaction((t) => run(t));
  }

  async verifyChain(): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    let prev: string | null = null;
    for (const r of rows) {
      const body = {
        at: r.at.toISOString(),
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: (r.before ?? null) as unknown,
        after: (r.after ?? null) as unknown,
        ip: r.ip,
      };
      const expected = sha256((prev ?? '') + canonical(body));
      if (r.prevHash !== prev || r.hash !== expected) {
        return { ok: false, checked: rows.length, brokenAt: r.id.toString() };
      }
      prev = r.hash;
    }
    return { ok: true, checked: rows.length };
  }
}

// Values as PostgreSQL jsonb will hand them back (dates as strings, no undefined).
function normalise(v: unknown): Prisma.InputJsonValue | null {
  if (v === undefined || v === null) return null;
  return JSON.parse(JSON.stringify(v));
}

// jsonb does not keep key order, so the hash is taken over keys in sorted order.
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
