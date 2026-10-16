import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from './prisma.service';

// Human-readable references such as TOD-A-26-000123.
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(name: string, prefix: string, tx?: Tx): Promise<string> {
    const db = tx ?? this.prisma;
    const row = await db.sequence.upsert({
      where: { name },
      create: { name, value: 1 },
      update: { value: { increment: 1 } },
    });
    const yy = String(new Date().getUTCFullYear()).slice(-2);
    return `${prefix}-${yy}-${String(row.value).padStart(6, '0')}`;
  }
}
