'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTierLabel } from '@/components/public-common';
import { Badge, Empty, ErrorText, LinkButton, Spinner } from '@/components/ui';
import { etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface ServiceArea {
  id: string;
  code: string;
  nameEn: string;
  nameAm: string;
}
interface PackageRow {
  id: string;
  code: string;
  serviceArea: ServiceArea;
  currentVersion: {
    titleEn: string;
    titleAm: string;
    turnaroundDays: number;
    minTier: string;
    priceMin: number;
    priceMax: number;
    priceStandard: number;
  } | null;
}

export default function Home() {
  const { t, pick } = useLang();
  const { me, isStaff } = useSession();
  const tierLabel = useTierLabel();
  const [area, setArea] = useState('');
  const areas = useApi<ServiceArea[]>('/catalogue/service-areas');
  const packages = useApi<PackageRow[]>(`/catalogue/packages${area ? `?serviceArea=${encodeURIComponent(area)}` : ''}`);

  const steps = [
    { n: 1, title: t('Choose a package', 'ጥቅል ይምረጡ'), body: t('Pick a ready service with a clear price, what you get and when.', 'ግልጽ ዋጋ፣ የሚያገኙትና የሚደርስበት ጊዜ ያለው አገልግሎት ይምረጡ።') },
    { n: 2, title: t('Pay into escrow', 'ክፍያውን በባንክ ያስይዙ'), body: t('Your money is held safely by our partner bank, not by the talent.', 'ገንዘብዎ በባለሙያው ሳይሆን በአጋር ባንካችን በጥንቃቄ ይያዛል።') },
    { n: 3, title: t('Accept the work', 'ሥራውን ይቀበሉ'), body: t('Check the work. When you accept it, the talent is paid.', 'ሥራውን ይመልከቱ። ሲቀበሉት ባለሙያው ይከፈለዋል።') },
  ];

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-brand-700 px-5 py-8 text-white sm:px-10 sm:py-12">
        <h1 className="text-2xl font-bold leading-tight sm:text-4xl">
          {t('Get work done by vetted young talent in Addis Ababa', 'በአዲስ አበባ በተመረመሩ ወጣት ባለሙያዎች ሥራዎን ያሠሩ')}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-brand-50 sm:text-lg">
          {t(
            'Talent on Demand connects small businesses with skilled young people. Prices are fixed, and your payment is held by a partner bank until you accept the work.',
            'ቶድ (Talent on Demand) አነስተኛ ንግዶችን ከሙያ ካላቸው ወጣቶች ጋር ያገናኛል። ዋጋዎቹ የተወሰኑ ናቸው፣ ክፍያዎም ሥራውን እስኪቀበሉ ድረስ በአጋር ባንክ ይያዛል።',
          )}
        </p>
        {me ? (
          <div className="mt-6">
            <LinkButton href={isStaff ? '/console' : '/dashboard'} tone="secondary" className="w-full sm:w-auto">
              {t('Go to my work', 'ወደ ሥራዎቼ ይሂዱ')}
            </LinkButton>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-sm text-brand-50">{t('For businesses', 'ለንግዶች')}</p>
              <p className="mt-1 text-sm">{t('Buy a service package and pay safely.', 'የአገልግሎት ጥቅል ይግዙ፣ በደህና ይክፈሉ።')}</p>
              <LinkButton href="/register?role=CLIENT" tone="secondary" className="mt-3 w-full">
                {t('Join as a business', 'እንደ ንግድ ይቀላቀሉ')}
              </LinkButton>
            </div>
            <div className="rounded-xl bg-white/10 p-4">
              <p className="text-sm text-brand-50">{t('For young talent', 'ለወጣት ባለሙያዎች')}</p>
              <p className="mt-1 text-sm">{t('Get verified, find paid work and build your record.', 'ይረጋገጡ፣ የሚከፈልበት ሥራ ያግኙ፣ ታሪክዎን ይገንቡ።')}</p>
              <LinkButton href="/register?role=TALENT" tone="secondary" className="mt-3 w-full">
                {t('Join as a talent', 'እንደ ባለሙያ ይቀላቀሉ')}
              </LinkButton>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold sm:text-xl">{t('How it works', 'እንዴት ይሠራል')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="rounded-xl border border-stone-200 bg-white p-4">
              <span className="grid size-9 place-items-center rounded-full bg-brand-600 font-bold text-white">{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold sm:text-xl">{t('Services you can buy', 'የሚገዙ አገልግሎቶች')}</h2>
        <p className="mb-4 text-sm text-stone-600">{t('Choose a service area to see its packages.', 'ጥቅሎቹን ለማየት የአገልግሎት ዘርፍ ይምረጡ።')}</p>

        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('Service areas', 'የአገልግሎት ዘርፎች')}>
          <FilterChip active={area === ''} onClick={() => setArea('')}>
            {t('All', 'ሁሉም')}
          </FilterChip>
          {(areas.data ?? []).map((a) => (
            <FilterChip key={a.code} active={area === a.code} onClick={() => setArea(a.code)}>
              {pick(a, 'name')}
            </FilterChip>
          ))}
        </div>
        <ErrorText error={areas.error} />

        {packages.loading ? (
          <Spinner />
        ) : packages.error ? (
          <ErrorText error={packages.error} />
        ) : !packages.data?.length ? (
          <Empty>{t('No packages in this area yet.', 'በዚህ ዘርፍ እስካሁን ጥቅል የለም።')}</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packages.data.map((p) => {
              const v = p.currentVersion;
              if (!v) return null;
              return (
                <li key={p.id}>
                  <Link href={`/packages/${encodeURIComponent(p.code)}`} className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow">
                    <span className="text-xs font-medium uppercase tracking-wide text-brand-700">{pick(p.serviceArea, 'name')}</span>
                    <h3 className="mt-1 font-semibold">{pick(v, 'title')}</h3>
                    <p className="mt-3 text-lg font-bold">{etb(v.priceStandard)}</p>
                    <p className="text-xs text-stone-500">
                      {t('Price range', 'የዋጋ ክልል')}: {etb(v.priceMin)} – {etb(v.priceMax)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="blue">{t(`Ready in ${v.turnaroundDays} days`, `በ${v.turnaroundDays} ቀን ይደርሳል`)}</Badge>
                      <Badge>{t('Level', 'ደረጃ')}: {tierLabel(v.minTier)}</Badge>
                    </div>
                    <span className="mt-auto pt-3 text-sm font-semibold text-brand-700">{t('See details →', 'ዝርዝር ይመልከቱ →')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'}`}
    >
      {children}
    </button>
  );
}
