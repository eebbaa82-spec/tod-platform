import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { fail } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { CreatePackageDto, PackageContentDto } from './dto';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  serviceAreas() {
    return this.prisma.serviceArea.findMany({ orderBy: { sort: 'asc' } });
  }

  // Public catalogue: active packages at their current version. Extension
  // categories stay hidden unless enabled (FR-CAT-06).
  async list(opts: { serviceArea?: string; includeExtension?: boolean; includeRetired?: boolean } = {}) {
    return this.prisma.package.findMany({
      where: {
        ...(opts.includeRetired ? {} : { status: 'ACTIVE' }),
        ...(opts.includeExtension ? {} : { extensionCategory: false }),
        ...(opts.serviceArea ? { serviceArea: { code: opts.serviceArea } } : {}),
      },
      include: { currentVersion: true, serviceArea: true },
      orderBy: [{ serviceArea: { sort: 'asc' } }, { code: 'asc' }],
    });
  }

  async get(code: string) {
    const p = await this.prisma.package.findUnique({
      where: { code },
      include: { currentVersion: true, serviceArea: true, versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, createdAt: true, createdById: true, priceMin: true, priceMax: true, priceStandard: true } } },
    });
    if (!p) throw fail.notFound('Package');
    return p;
  }

  private checkPrices(c: PackageContentDto) {
    if (!(c.priceMin <= c.priceStandard && c.priceStandard <= c.priceMax)) {
      throw fail.bad('PRICE_BAND', 'The standard price must sit within the price band.');
    }
    if (c.checklistEn.length === 0 || c.checklistEn.length !== c.checklistAm.length) {
      throw fail.bad('CHECKLIST', 'Give the acceptance checklist in both languages, with the same number of items.');
    }
  }

  // Changes never need a software release, and every change creates a new
  // version (FR-CAT-03). Existing assignments keep their version (FR-CAT-04).
  async create(actorId: string, dto: CreatePackageDto) {
    this.checkPrices(dto);
    const area = await this.prisma.serviceArea.findUnique({ where: { code: dto.serviceAreaCode } });
    if (!area) throw fail.bad('UNKNOWN_SERVICE_AREA', 'Unknown service area.');
    if (await this.prisma.package.findUnique({ where: { code: dto.code } })) throw fail.conflict('CODE_TAKEN', 'A package with this code exists.');
    const { code, serviceAreaCode, extensionCategory, ...content } = dto;
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({ data: { code, serviceAreaId: area.id, extensionCategory: !!extensionCategory } });
      const v = await tx.packageVersion.create({ data: { ...content, packageId: pkg.id, version: 1, createdById: actorId } });
      await tx.package.update({ where: { id: pkg.id }, data: { currentVersionId: v.id } });
      await this.audit.log({ actorId, action: 'PACKAGE_CREATED', entityType: 'Package', entityId: pkg.id, after: { code, version: 1, ...content } }, tx);
      return tx.package.findUniqueOrThrow({ where: { id: pkg.id }, include: { currentVersion: true } });
    });
  }

  async revise(actorId: string, code: string, dto: PackageContentDto) {
    this.checkPrices(dto);
    const pkg = await this.prisma.package.findUnique({ where: { code }, include: { currentVersion: true } });
    if (!pkg) throw fail.notFound('Package');
    const last = await this.prisma.packageVersion.findFirst({ where: { packageId: pkg.id }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.packageVersion.create({ data: { ...dto, packageId: pkg.id, version, createdById: actorId } });
      await tx.package.update({ where: { id: pkg.id }, data: { currentVersionId: v.id } });
      await this.audit.log({ actorId, action: 'PACKAGE_REVISED', entityType: 'Package', entityId: pkg.id, before: pkg.currentVersion, after: { version, ...dto } }, tx);
      return tx.package.findUniqueOrThrow({ where: { id: pkg.id }, include: { currentVersion: true } });
    });
  }

  async setStatus(actorId: string, code: string, status: 'ACTIVE' | 'RETIRED', reason: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw fail.notFound('Package');
    const updated = await this.prisma.package.update({ where: { id: pkg.id }, data: { status } });
    await this.audit.log({ actorId, action: status === 'RETIRED' ? 'PACKAGE_RETIRED' : 'PACKAGE_REACTIVATED', entityType: 'Package', entityId: pkg.id, before: { status: pkg.status }, after: { status, reason } });
    return updated;
  }

  async setExtension(actorId: string, code: string, extensionCategory: boolean) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw fail.notFound('Package');
    const updated = await this.prisma.package.update({ where: { id: pkg.id }, data: { extensionCategory } });
    await this.audit.log({ actorId, action: 'PACKAGE_EXTENSION_FLAG', entityType: 'Package', entityId: pkg.id, before: { extensionCategory: pkg.extensionCategory }, after: { extensionCategory } });
    return updated;
  }
}
