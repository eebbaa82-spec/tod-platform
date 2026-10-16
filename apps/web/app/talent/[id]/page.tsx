'use client';
import { useParams } from 'next/navigation';
import { TrustBadge, useTierLabel } from '@/components/public-common';
import { Badge, Card, Empty, ErrorText, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface PublicTalent {
  userId: string;
  name: string;
  verified: boolean;
  provisional: boolean;
  identityMasked?: string | null;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
  subCity?: string | null;
  skills: string[];
  languages: string[];
  education: { level: string; institution: string; field?: string; year?: number }[];
  credentials: { name: string; issuer?: string; year?: number }[];
  experience: { role: string; organisation?: string; years?: number; description?: string }[];
  availability: { hoursPerWeek?: number | null; workingDays: string[]; workMode: 'REMOTE' | 'ONSITE' | 'BOTH' };
  responseTimeMinutes?: number | null;
  tiers: { serviceArea: string; nameEn: string; nameAm: string; tier: string; testScore?: number | null }[];
  portfolio: { id: string; title: string; description: string; url?: string | null; fileId?: string | null; createdAt: string }[];
  trust: { level: string; score: number | null; completed: number; averageRating: number | null; ratingCount: number };
  ratings: { id: string; scores: Record<string, number>; average: number; comment?: string | null; reply?: string | null; publishedAt: string }[];
  memberSince: string;
}

export default function TalentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t, pick, lang } = useLang();
  const { me } = useSession();
  const tierLabel = useTierLabel();
  const { data: p, error, loading } = useApi<PublicTalent>(`/talent/${encodeURIComponent(id)}`);

  if (loading) return <Spinner />;
  if (error || !p) return <ErrorText error={error ?? t('Profile not found.', 'መገለጫው አልተገኘም።')} />;

  const criteria: Record<string, string> = {
    quality: t('Quality', 'ጥራት'),
    timeliness: t('On time', 'በሰዓቱ'),
    communication: t('Communication', 'ግንኙነት'),
  };
  const workMode = { REMOTE: t('Remote', 'ከርቀት'), ONSITE: t('On site', 'በቦታው'), BOTH: t('Remote or on site', 'ከርቀት ወይም በቦታው') }[p.availability?.workMode] ?? '';
  const days: Record<string, string> = {
    MON: t('Mon', 'ሰኞ'), TUE: t('Tue', 'ማክሰኞ'), WED: t('Wed', 'ረቡዕ'), THU: t('Thu', 'ሐሙስ'), FRI: t('Fri', 'ዓርብ'), SAT: t('Sat', 'ቅዳሜ'), SUN: t('Sun', 'እሁድ'),
  };
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-700" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold sm:text-2xl">{p.name}</h1>
            {p.headline && <p className="text-stone-700">{p.headline}</p>}
            <p className="mt-1 text-sm text-stone-500">{[p.subCity, p.city].filter(Boolean).join(', ')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.verified ? (
                <Badge tone="green">
                  ✓ {t('Identity verified', 'ማንነቱ የተረጋገጠ')}
                  {p.identityMasked ? ` · ${p.identityMasked}` : ''}
                </Badge>
              ) : p.provisional ? (
                <Badge tone="amber">{t('Identity check in progress', 'የማንነት ማረጋገጫ በሂደት ላይ')}</Badge>
              ) : null}
              <TrustBadge level={p.trust.level} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label={t('Jobs completed', 'የተጠናቀቁ ሥራዎች')} value={String(p.trust.completed)} />
          <Stat
            label={t(`Rating (${p.trust.ratingCount})`, `ደረጃ (${p.trust.ratingCount})`)}
            value={p.trust.averageRating !== null ? `${p.trust.averageRating.toFixed(1)} / 5` : '—'}
          />
          <Stat label={t('Trust score', 'የእምነት ነጥብ')} value={p.trust.score !== null ? `${p.trust.score}` : t('New', 'አዲስ')} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {p.bio && (
            <Card title={t('About', 'ስለ እኔ')}>
              <p className="whitespace-pre-line text-sm leading-relaxed">{p.bio}</p>
            </Card>
          )}

          <Card title={t('Portfolio', 'የሥራ ናሙናዎች')}>
            {p.portfolio.length === 0 ? (
              <Empty>{t('No work samples yet.', 'እስካሁን የሥራ ናሙና የለም።')}</Empty>
            ) : (
              <ul className="space-y-3">
                {p.portfolio.map((item) => (
                  <li key={item.id} className="rounded-lg border border-stone-200 p-3">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      {item.url && /^https?:\/\//i.test(item.url) && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-block py-1 font-semibold text-brand-700 underline">
                          {t('Open link', 'ሊንኩን ክፈት')}
                        </a>
                      )}
                      {item.fileId &&
                        (me ? (
                          <a href={`/api/files/${item.fileId}`} className="inline-block py-1 font-semibold text-brand-700 underline">
                            {t('Download file', 'ፋይሉን አውርድ')}
                          </a>
                        ) : (
                          <span className="py-1 text-stone-500">{t('Sign in to see the file', 'ፋይሉን ለማየት ይግቡ')}</span>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('What clients say', 'ደንበኞች የሚሉት')}>
            {p.ratings.length === 0 ? (
              <Empty>{t('No published ratings yet.', 'እስካሁን የታተመ ደረጃ የለም።')}</Empty>
            ) : (
              <ul className="space-y-3">
                {p.ratings.map((r) => (
                  <li key={r.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        <span className="text-accent-500" aria-hidden>★</span> {r.average.toFixed(1)} / 5
                      </span>
                      <span className="text-xs text-stone-500">{date(r.publishedAt, lang)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
                      {Object.entries(r.scores ?? {}).map(([k, v]) => (
                        <span key={k}>
                          {criteria[k] ?? k}: {v}
                        </span>
                      ))}
                    </div>
                    {r.comment && <p className="mt-2 whitespace-pre-line text-sm">{r.comment}</p>}
                    {r.reply && (
                      <div className="mt-2 rounded-md bg-stone-50 p-2 text-sm">
                        <span className="text-xs font-semibold text-stone-600">{t('Reply from the talent', 'ከባለሙያው የተሰጠ ምላሽ')}</span>
                        <p className="whitespace-pre-line">{r.reply}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('Service areas and levels', 'የአገልግሎት ዘርፎችና ደረጃዎች')}>
            {p.tiers.length === 0 ? (
              <p className="text-sm text-stone-500">—</p>
            ) : (
              <ul className="space-y-2">
                {p.tiers.map((tr) => (
                  <li key={tr.serviceArea} className="flex items-center justify-between gap-2 text-sm">
                    <span>{pick(tr, 'name')}</span>
                    <Badge tone="blue">{tierLabel(tr.tier)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {p.skills.length > 0 && (
            <Card title={t('Skills', 'ክህሎቶች')}>
              <div className="flex flex-wrap gap-2">
                {p.skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </Card>
          )}

          <Card title={t('Availability', 'የሚገኙበት ጊዜ')}>
            <div className="space-y-1 text-sm">
              {p.availability?.hoursPerWeek ? (
                <div>
                  {t(`${p.availability.hoursPerWeek} hours a week`, `በሳምንት ${p.availability.hoursPerWeek} ሰዓት`)}
                </div>
              ) : null}
              {p.availability?.workingDays?.length ? <div>{p.availability.workingDays.map((d) => days[d] ?? d).join(', ')}</div> : null}
              {workMode && <div>{workMode}</div>}
              {p.responseTimeMinutes ? (
                <div className="text-stone-600">
                  {t('Usually replies in', 'አብዛኛውን ጊዜ የሚመልሱት በ')} {formatMinutes(p.responseTimeMinutes, t)}
                </div>
              ) : null}
              {p.languages.length > 0 && (
                <div className="text-stone-600">
                  {t('Languages', 'ቋንቋዎች')}: {p.languages.join(', ')}
                </div>
              )}
            </div>
          </Card>

          {(p.experience.length > 0 || p.education.length > 0 || p.credentials.length > 0) && (
            <Card title={t('Background', 'ዳራ')}>
              <div className="space-y-3 text-sm">
                {p.experience.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{t('Experience', 'የሥራ ልምድ')}</h3>
                    <ul className="mt-1 space-y-1">
                      {p.experience.map((e, i) => (
                        <li key={i}>
                          {e.role}
                          {e.organisation ? `, ${e.organisation}` : ''}
                          {e.years ? ` (${t(`${e.years} yrs`, `${e.years} ዓመት`)})` : ''}
                          {e.description && <p className="text-stone-600">{e.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.education.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{t('Education', 'ትምህርት')}</h3>
                    <ul className="mt-1 space-y-1">
                      {p.education.map((e, i) => (
                        <li key={i}>
                          {[e.level, e.field, e.institution].filter(Boolean).join(', ')}
                          {e.year ? ` (${e.year})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.credentials.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{t('Certificates', 'የምስክር ወረቀቶች')}</h3>
                    <ul className="mt-1 space-y-1">
                      {p.credentials.map((c, i) => (
                        <li key={i}>
                          {c.name}
                          {c.issuer ? `, ${c.issuer}` : ''}
                          {c.year ? ` (${c.year})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          <p className="text-xs text-stone-500">
            {t('Member since', 'አባል የሆኑበት')} {date(p.memberSince, lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-2">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-stone-600">{label}</p>
    </div>
  );
}

function formatMinutes(m: number, t: (en: string, am: string) => string) {
  if (m < 60) return t(`${m} minutes`, `${m} ደቂቃ`);
  const h = Math.round(m / 60);
  return t(`${h} hours`, `${h} ሰዓት`);
}
