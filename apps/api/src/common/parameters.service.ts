import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PARAMETER_DEFAULTS } from './parameters';

@Injectable()
export class ParametersService implements OnModuleInit {
  private cache = new Map<string, unknown>();
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    for (const p of PARAMETER_DEFAULTS) {
      await this.prisma.parameter.upsert({
        where: { key: p.key },
        create: { key: p.key, value: p.value as any, category: p.category, description: p.description },
        update: { category: p.category, description: p.description },
      });
    }
    this.loadedAt = 0;
  }

  private async load() {
    if (Date.now() - this.loadedAt < 5000 && this.cache.size) return;
    const rows = await this.prisma.parameter.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    this.loadedAt = Date.now();
  }

  invalidate() {
    this.loadedAt = 0;
  }

  async get<T = any>(key: string): Promise<T> {
    await this.load();
    if (!this.cache.has(key)) {
      const def = PARAMETER_DEFAULTS.find((d) => d.key === key);
      if (!def) throw new Error(`Unknown parameter ${key}`);
      return def.value as T;
    }
    return this.cache.get(key) as T;
  }

  async holidays(): Promise<string[]> {
    return this.get<string[]>('HOLIDAYS');
  }
}
