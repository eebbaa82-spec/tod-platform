'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTierLabel } from '@/components/public-common';
import { Badge, Card, ErrorText, LinkButton, Spinner } from '@/components/ui';
import { etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface PackageDetail {
  code: string;
  status: string;
  serviceArea: { code: string; nameEn: string; nameAm: string };
  currentVersion: {
    version: number;
    titleEn: string;
    titleAm: string;
    scopeEn: string;
    scopeAm: string;
    exclusionsEn: string;
    exclusionsAm: string;
    deliverableEn: string;
    deliverableAm: string;
    turnaroundDays: number;
    revisionLimit: number;
    checklistEn: string[];
    checklistAm: string[];
    minTier: string;
    priceMin: number;
    priceMax: number;
    priceStandard: number;
  } | null;
}

export default function PackagePage() {
  const { code } = useParams<{ code: string }>();
  const { t, pick, lang } = useLang();
  const { me, has } = useSession();
  const tierLabel = useTierLabel();
  const { data, error, loading } = useApi<PackageDetail>(`/catalogue/packages/${encodeURIComponent(code)}`);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorText error={error ?? t('Package not found.', 'ጥቅሉ አልተገኘም።')} />;
  const v = data.currentVersion;
  if (!v) return <ErrorText error={t('This package is not available.', 'ይህ ጥቅል አይገኝም።')} />;

  const checklist = (lang === 'am' && v.checklistAm?.length ? v.checklistAm : v.checklistEn) ?? [];
  const requestHref = `/request/new?package=${encodeURIComponent(data.code)}`;
  const retired = data.status !== 'ACTIVE';

  const cta = retired ? (
    <p className="text-sm text-stone-600">{t('This package is no longer offered.', 'ይህ ጥቅል ከእንግዲህ አይቀርብም።')}</p>
  ) : !me ? (
    <div className="space-y-2">
      <LinkButton href={`/register?role=CLIENT`} className="w-full">
        {t('Request this package', 'ይህን ጥቅል ይጠይቁ')}
      </LinkButton>
      <p className="text-center text-xs text-stone-500">
        {t('You need a free business account. Already have one?', 'ነፃ የንግድ መለያ ያስፈልግዎታል። መለያ አለዎት?')}{' '}
        <Link href={`/login?next=${encodeURIComponent(requestHref)}`} className="font-semibold text-brand-700 underline">
          {t('Sign in', 'ይግቡ')}
        </Link>
      </p>
    </div>
  ) : has('CLIENT') ? (
    <LinkButton href={requestHref} className="w-full">
      {t('Request this package', 'ይህን ጥቅል ይጠይቁ')}
    </LinkButton>
  ) : (
    <div className="space-y-2 text-sm text-stone-600">
      <p>{t('Only business accounts can request packages. You can add a business role to your account.', 'ጥቅል መጠየቅ የሚችሉት የንግድ መለያዎች ብቻ ናቸው። በመለያዎ ላይ የንግድ ሚና መጨመር ይችላሉ።')}</p>
      <LinkButton href="/account" tone="secondary" className="w-full">
        {t('Go to my account', 'ወደ መለያዬ')}
      </LinkButton>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-block py-2 text-sm text-brand-700 hover:underline">
        ← {t('All services', 'ሁሉም አገልግሎቶች')}
      </Link>
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-brand-700">{pick(data.serviceArea, 'name')}</span>
        <h1 className="text-xl font-bold sm:text-2xl">{pick(v, 'title')}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('What is included', 'የሚካተተው')}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{pick(v, 'scope')}</p>
          </Card>
          <Card title={t('What you receive', 'የሚያገኙት')}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{pick(v, 'deliverable')}</p>
          </Card>
          <Card title={t('Not included', 'የማይካተተው')}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">{pick(v, 'exclusions')}</p>
          </Card>
          {checklist.length > 0 && (
            <Card title={t('How the work is checked', 'ሥራው እንዴት ይፈተሻል')}>
              <p className="mb-2 text-sm text-stone-600">{t('Before you accept, check that:', 'ከመቀበልዎ በፊት የሚከተሉትን ያረጋግጡ፦')}</p>
              <ul className="space-y-2">
                {checklist.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span aria-hidden className="mt-0.5 text-brand-600">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <p className="text-sm text-stone-600">{t('Standard price', 'መደበኛ ዋጋ')}</p>
            <p className="text-2xl font-bold">{etb(v.priceStandard)}</p>
            <p className="mt-1 text-xs text-stone-500">
              {t('Price range', 'የዋጋ ክልል')}: {etb(v.priceMin)} – {etb(v.priceMax)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={t('Ready in', 'የሚደርስበት ጊዜ')} value={t(`${v.turnaroundDays} days`, `${v.turnaroundDays} ቀን`)} />
              <Row label={t('Changes included', 'የተካተቱ ማሻሻያዎች')} value={String(v.revisionLimit)} />
              <Row label={t('Talent level', 'የባለሙያ ደረጃ')} value={<Badge>{tierLabel(v.minTier)} {t('or higher', 'ወይም ከዚያ በላይ')}</Badge>} />
            </dl>
            <div className="mt-5">{cta}</div>
          </Card>
          <Card>
            <p className="text-sm text-stone-700">
              {t(
                'Your payment is held by our partner bank. The talent is paid only after you accept the work.',
                'ክፍያዎ በአጋር ባንካችን ይያዛል። ባለሙያው የሚከፈለው ሥራውን ከተቀበሉ በኋላ ብቻ ነው።',
              )}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
