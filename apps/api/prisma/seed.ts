import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PACKAGES, SERVICE_AREAS } from './catalogue-data';
import { PARAMETER_DEFAULTS } from '../src/common/parameters';

const prisma = new PrismaClient();

// Demo staff for development only. Never seed these in production.
const STAFF: { phone: string; name: string; roles: Role[]; safeguarding?: boolean }[] = [
  { phone: '+251911000001', name: 'Super Admin', roles: ['SUPER_ADMIN'] },
  { phone: '+251911000002', name: 'Platform Admin', roles: ['PLATFORM_ADMIN'] },
  { phone: '+251911000003', name: 'Support Agent', roles: ['SUPPORT_AGENT'], safeguarding: true },
  { phone: '+251911000004', name: 'Vetting Officer', roles: ['VETTING_OFFICER'] },
  { phone: '+251911000005', name: 'Finance Officer', roles: ['FINANCE_OFFICER'] },
  { phone: '+251911000006', name: 'MEL Officer', roles: ['MEL_OFFICER'] },
];

async function main() {
  for (const p of PARAMETER_DEFAULTS) {
    await prisma.parameter.upsert({ where: { key: p.key }, update: {}, create: { key: p.key, value: p.value as any, category: p.category, description: p.description } });
  }
  for (const [i, a] of SERVICE_AREAS.entries()) {
    await prisma.serviceArea.upsert({ where: { code: a.code }, update: { nameEn: a.nameEn, nameAm: a.nameAm, sort: i }, create: { ...a, sort: i } });
  }
  for (const p of PACKAGES) {
    if (await prisma.package.findUnique({ where: { code: p.code } })) continue;
    const area = await prisma.serviceArea.findUniqueOrThrow({ where: { code: p.area } });
    const { code, area: _a, etb, ...content } = p;
    const pkg = await prisma.package.create({ data: { code, serviceAreaId: area.id } });
    const v = await prisma.packageVersion.create({
      data: { ...content, packageId: pkg.id, version: 1, priceMin: etb[0] * 100, priceStandard: etb[1] * 100, priceMax: etb[2] * 100 },
    });
    await prisma.package.update({ where: { id: pkg.id }, data: { currentVersionId: v.id } });
  }
  if (process.env.APP_ENV !== 'production') {
    const hash = await bcrypt.hash('ChangeMe-2026!', 10);
    for (const s of STAFF) {
      await prisma.user.upsert({
        where: { phone: s.phone },
        update: {},
        create: { phone: s.phone, displayName: s.name, roles: s.roles, status: 'ACTIVE', passwordHash: hash, safeguardingDesignated: !!s.safeguarding },
      });
    }
    console.log('Demo staff: phones +251911000001..6, password ChangeMe-2026! (MFA is set up at first sign-in).');
  }
  console.log(`Seeded ${SERVICE_AREAS.length} service areas, ${PACKAGES.length} packages, ${PARAMETER_DEFAULTS.length} parameters.`);
}

main().finally(() => prisma.$disconnect());
