'use client';
import { useState } from 'react';
import { post } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, ErrorText, Field, Textarea, useAction } from './ui';
import { StarInput, Stars } from './work-common';

type T = (en: string, am: string) => string;

// Mirrors CRITERIA in apps/api/src/ratings/ratings.service.ts.
const CRITERIA: Record<string, string[]> = {
  CLIENT_TO_TALENT: ['quality', 'timeliness', 'communication'],
  TALENT_TO_CLIENT: ['clarityOfBrief', 'responsiveness', 'conduct'],
};

function criterionLabel(c: string, t: T) {
  const map: Record<string, [string, string]> = {
    quality: ['Quality of the work', 'የሥራው ጥራት'],
    timeliness: ['Delivered on time', 'በሰዓቱ ማስረከብ'],
    communication: ['Communication', 'ግንኙነት'],
    clarityOfBrief: ['Clear instructions', 'ግልጽ መመሪያ'],
    responsiveness: ['Answered quickly', 'በፍጥነት መመለስ'],
    conduct: ['Respectful behaviour', 'አክብሮት የተሞላበት ባሕሪ'],
  };
  const v = map[c];
  return v ? t(v[0], v[1]) : c;
}

export function RatingsPanel({ a, reload }: { a: any; reload: () => void }) {
  const { t } = useLang();
  const { me } = useSession();
  const role = a.viewerRole;
  if (a.status !== 'CLOSED' || (role !== 'CLIENT' && role !== 'TALENT')) return null;
  const direction = role === 'CLIENT' ? 'CLIENT_TO_TALENT' : 'TALENT_TO_CLIENT';
  const ratings: any[] = a.ratings ?? [];
  const given = ratings.find((r) => r.raterId === me?.id);
  const received = ratings.find((r) => r.rateeId === me?.id);
  const settled = (a.milestones ?? []).some((m: any) => m.settlement?.status === 'PAID' && m.settlement.gross > 0);

  return (
    <Card title={<span id="rate">{t('Ratings', 'ግምገማዎች')}</span>}>
      <div className="space-y-4">
        {given ? (
          <div>
            <p className="text-sm font-semibold">{t('Your rating', 'የእርስዎ ግምገማ')}</p>
            <RatingView r={given} />
            {!given.publishedAt && <p className="text-xs text-stone-500">{t('It will be shown once the other side rates too, or after 7 days.', 'ሌላኛው ወገንም ሲገመግም ወይም ከ7 ቀናት በኋላ ይታያል።')}</p>}
          </div>
        ) : settled ? (
          <RateForm a={a} direction={direction} reload={reload} />
        ) : (
          <p className="text-sm text-stone-600">{t('Only paid work can be rated.', 'መገምገም የሚቻለው የተከፈለበት ሥራ ብቻ ነው።')}</p>
        )}
        {received && (
          <div className="border-t border-stone-100 pt-3">
            <p className="text-sm font-semibold">{role === 'CLIENT' ? t('What the talent said about you', 'ባለሙያው ስለ እርስዎ የተናገረው') : t('What the client said about you', 'ደንበኛው ስለ እርስዎ የተናገረው')}</p>
            <RatingView r={received} />
            {received.reply ? (
              <p className="mt-2 rounded bg-stone-50 p-2 text-sm">
                <span className="font-medium">{t('Your reply', 'የእርስዎ ምላሽ')}:</span> {received.reply}
              </p>
            ) : (
              received.publishedAt && !received.removedReason && <ReplyForm ratingId={received.id} reload={reload} />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function RatingView({ r }: { r: any }) {
  const { t, lang } = useLang();
  const scores = (r.scores ?? {}) as Record<string, number>;
  return (
    <div className="mt-1 space-y-1 text-sm">
      <p className="flex items-center gap-2">
        <Stars value={r.average} /> <span className="font-semibold">{r.average}</span>
        {r.publishedAt && <span className="text-xs text-stone-500">{date(r.publishedAt, lang)}</span>}
      </p>
      <ul className="text-stone-600">
        {Object.entries(scores).map(([k, v]) => (
          <li key={k}>
            {criterionLabel(k, t)}: {v}/5
          </li>
        ))}
      </ul>
      {r.removedReason ? <p className="text-xs text-stone-500">{t('The comment was removed by a moderator.', 'አስተያየቱ በአወያይ ተወግዷል።')}</p> : r.comment && <p className="whitespace-pre-wrap">“{r.comment}”</p>}
    </div>
  );
}

function RateForm({ a, direction, reload }: { a: any; direction: string; reload: () => void }) {
  const { t } = useLang();
  const criteria = CRITERIA[direction];
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();
  const complete = criteria.every((c) => scores[c] >= 1);
  return (
    <div className="space-y-3">
      <p className="text-sm">{direction === 'CLIENT_TO_TALENT' ? t('How did the talent do? Your rating helps other businesses choose.', 'ባለሙያው እንዴት ሠራ? ግምገማዎ ሌሎች ንግዶች እንዲመርጡ ይረዳል።') : t('How was working with this client?', 'ከዚህ ደንበኛ ጋር መሥራት እንዴት ነበር?')}</p>
      {criteria.map((c) => (
        <StarInput key={c} label={criterionLabel(c, t)} value={scores[c] ?? 0} onChange={(v) => setScores({ ...scores, [c]: v })} />
      ))}
      <Field label={t('Comment (optional)', 'አስተያየት (አማራጭ)')}>
        <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
      </Field>
      <ErrorText error={error} />
      <Button onClick={() => run(async () => { await post(`/ratings/assignments/${a.id}`, { scores, comment: comment.trim() || undefined }); reload(); })} busy={busy} disabled={!complete} className="w-full sm:w-auto">
        {t('Send rating', 'ግምገማ ላክ')}
      </Button>
      <p className="text-xs text-stone-500">{t('Both ratings are shown together, so neither side sees the other first.', 'ሁለቱም ግምገማዎች አብረው ይታያሉ፣ ስለዚህ አንዱ ወገን የሌላውን ቀድሞ አያይም።')}</p>
    </div>
  );
}

function ReplyForm({ ratingId, reload }: { ratingId: string; reload: () => void }) {
  const { t } = useLang();
  const [reply, setReply] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  if (done) return <Alert tone="success">{t('Reply posted.', 'ምላሽ ተለጥፏል።')}</Alert>;
  return (
    <div className="mt-2 space-y-2">
      <Field label={t('Reply once, publicly (optional)', 'አንድ ጊዜ በይፋ ይመልሱ (አማራጭ)')}>
        <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} />
      </Field>
      <ErrorText error={error} />
      <Button tone="secondary" onClick={() => run(async () => { await post(`/ratings/${ratingId}/reply`, { reply: reply.trim() }); setDone(true); reload(); })} busy={busy} disabled={reply.trim().length < 2}>
        {t('Post reply', 'ምላሽ ለጥፍ')}
      </Button>
    </div>
  );
}
