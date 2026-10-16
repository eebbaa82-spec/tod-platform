'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTicketLabels } from '@/components/public-common';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, PageTitle, Spinner, StatusBadge, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

interface TicketDetail {
  id: string;
  ref: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  confidential: boolean;
  acknowledgeBy?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  outcome?: string | null;
  createdAt: string;
  updates: { id: string; authorId: string; body: string; at: string }[];
  files: { id: string; name: string; size: number }[];
}

export default function TicketPage() {
  return (
    <RequireAuth>
      <Ticket />
    </RequireAuth>
  );
}

function Ticket() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { me } = useSession();
  const labels = useTicketLabels();
  const { data: tk, error, loading, setData } = useApi<TicketDetail>(`/support/tickets/${encodeURIComponent(id)}`);
  const [body, setBody] = useState('');
  const { busy, error: sendError, run } = useAction();

  if (loading && !tk) return <Spinner />;
  if (error || !tk) return <ErrorText error={error ?? t('Request not found.', 'ጥያቄው አልተገኘም።')} />;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const updated = await post<TicketDetail>(`/support/tickets/${encodeURIComponent(tk.id)}`, { body: body.trim() });
      setData(updated);
      setBody('');
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/help" className="inline-block py-2 text-sm text-brand-700 hover:underline">
        ← {t('All my requests', 'ሁሉም ጥያቄዎቼ')}
      </Link>
      <PageTitle sub={`${tk.ref} · ${labels.category(tk.category)} · ${date(tk.createdAt, lang)}`} actions={<StatusBadge status={tk.status} label={labels.status(tk.status)} />}>
        {tk.subject}
      </PageTitle>

      {tk.confidential && (
        <Alert tone="info">
          <Badge tone="red">{t('Confidential', 'ሚስጥራዊ')}</Badge>{' '}
          {tk.acknowledgedAt
            ? t('A safeguarding officer has picked up your report.', 'የጥበቃ ኃላፊ ሪፖርትዎን ተቀብሏል።')
            : tk.acknowledgeBy
              ? t(`A safeguarding officer will contact you by ${date(tk.acknowledgeBy, 'en')}.`, `የጥበቃ ኃላፊ እስከ ${date(tk.acknowledgeBy, 'am')} ያገኝዎታል።`)
              : t('Only designated safeguarding staff can see this.', 'ይህን የሚያዩት የተመደቡ የጥበቃ ሠራተኞች ብቻ ናቸው።')}
        </Alert>
      )}

      <Card title={t('What you told us', 'የነገሩን')}>
        <p className="whitespace-pre-line text-sm">{tk.description}</p>
        {tk.files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {tk.files.map((f) => (
              <li key={f.id}>
                <a href={`/api/files/${f.id}`} className="inline-block py-1 font-semibold text-brand-700 underline">
                  📎 {f.name}
                </a>{' '}
                <span className="text-xs text-stone-500">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {tk.outcome && (
        <Card title={t('Outcome', 'ውጤት')}>
          <p className="whitespace-pre-line text-sm">{tk.outcome}</p>
        </Card>
      )}

      <Card title={t('Conversation', 'ውይይት')}>
        {tk.updates.length === 0 ? (
          <p className="text-sm text-stone-500">{t('No replies yet. We will notify you when the team replies.', 'እስካሁን ምላሽ የለም። ቡድኑ ሲመልስ እናሳውቅዎታለን።')}</p>
        ) : (
          <ul className="space-y-3">
            {tk.updates.map((u) => {
              const mine = u.authorId === me?.id;
              return (
                <li key={u.id} className={`rounded-lg p-3 text-sm ${mine ? 'ml-6 bg-brand-50' : 'mr-6 bg-stone-100'}`}>
                  <p className="text-xs font-semibold text-stone-600">
                    {mine ? t('You', 'እርስዎ') : t('ToD support team', 'የቶድ ድጋፍ ቡድን')} · {date(u.at, lang, true)}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={send} className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          <Field label={t('Write a reply', 'ምላሽ ይጻፉ')}>
            <Textarea rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <ErrorText error={sendError} />
          <Button type="submit" busy={busy} disabled={!body.trim()} className="w-full sm:w-auto">
            {t('Send reply', 'ምላሽ ላክ')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
