'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ReportConcern } from '@/components/report-concern';
import { TICKET_CATEGORIES, useTicketLabels } from '@/components/public-common';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, Empty, ErrorText, Field, Input, PageTitle, Select, Spinner, StatusBadge, Textarea, useAction } from '@/components/ui';
import { post, upload } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

interface TicketRow {
  id: string;
  ref: string;
  category: string;
  subject: string;
  status: string;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function HelpPage() {
  return (
    <RequireAuth>
      <Help />
    </RequireAuth>
  );
}

function Help() {
  const { t, lang } = useLang();
  const labels = useTicketLabels();
  const tickets = useApi<TicketRow[]>('/support/tickets?mine=true');
  const [created, setCreated] = useState<{ id: string; ref: string } | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle sub={t('Ask a question or tell us about a problem. Our team replies here.', 'ጥያቄ ይጠይቁ ወይም ችግር ይንገሩን። ቡድናችን እዚህ ይመልሳል።')}>
        {t('Help and support', 'እርዳታ እና ድጋፍ')}
      </PageTitle>

      <Card>
        <p className="text-sm">
          {t(
            'Were you harassed, exploited, treated unfairly or scammed? Use the confidential channel. Only designated safeguarding staff see it, and the other person is not told.',
            'ትንኮሳ፣ ብዝበዛ፣ መድልዎ ወይም ማጭበርበር ደርሶብዎታል? ሚስጥራዊውን መስመር ይጠቀሙ። የሚያዩት የተመደቡ የጥበቃ ሠራተኞች ብቻ ናቸው፣ ለሌላኛው ሰውም አይነገርም።',
          )}
        </p>
        <div className="mt-2">
          <ReportConcern />
        </div>
      </Card>

      <NewTicket
        onCreated={(tk) => {
          setCreated(tk);
          tickets.reload();
        }}
      />
      {created && (
        <Alert tone="success">
          {t(`Your request ${created.ref} was sent. We will reply here and notify you.`, `ጥያቄዎ ${created.ref} ተልኳል። እዚህ መልስ ሰጥተን እናሳውቅዎታለን።`)}{' '}
          <Link href={`/help/${created.id}`} className="font-semibold underline">
            {t('Open it', 'ይክፈቱት')}
          </Link>
        </Alert>
      )}

      <Card title={t('My requests', 'ጥያቄዎቼ')}>
        {tickets.loading && !tickets.data ? (
          <Spinner />
        ) : tickets.error ? (
          <ErrorText error={tickets.error} />
        ) : !tickets.data?.length ? (
          <Empty>{t('You have not asked for help yet.', 'እስካሁን እርዳታ አልጠየቁም።')}</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tickets.data.map((tk) => (
              <li key={tk.id}>
                <Link href={`/help/${tk.id}`} className="flex items-start justify-between gap-3 py-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block font-medium">{tk.subject}</span>
                    <span className="block text-xs text-stone-500">
                      {tk.ref} · {labels.category(tk.category)} · {date(tk.createdAt, lang)}
                    </span>
                    {tk.confidential && (
                      <span className="mt-1 inline-block">
                        <Badge tone="red">{t('Confidential', 'ሚስጥራዊ')}</Badge>
                      </span>
                    )}
                  </span>
                  <StatusBadge status={tk.status} label={labels.status(tk.status)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NewTicket({ onCreated }: { onCreated: (t: { id: string; ref: string }) => void }) {
  const { t } = useLang();
  const labels = useTicketLabels();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const fileIds: string[] = [];
      if (file) fileIds.push((await upload(file, 'TICKET')).id);
      const r = await post<{ id: string; ref: string }>('/support/tickets', {
        category,
        subject: subject.trim(),
        description: description.trim(),
        ...(fileIds.length ? { fileIds } : {}),
      });
      setCategory('');
      setSubject('');
      setDescription('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setOpen(false);
      onCreated({ id: r.id, ref: r.ref });
    });
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        {t('Ask for help', 'እርዳታ ይጠይቁ')}
      </Button>
    );

  return (
    <Card title={t('New request', 'አዲስ ጥያቄ')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('What is it about?', 'ስለምንድን ነው?')}>
          <Select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: '', label: t('Choose one', 'አንዱን ይምረጡ') }, ...TICKET_CATEGORIES.map((c) => ({ value: c, label: labels.category(c) }))]}
          />
        </Field>
        <Field label={t('Short title', 'አጭር ርዕስ')}>
          <Input required minLength={3} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label={t('Tell us more', 'ተጨማሪ ይንገሩን')} hint={t('What happened, and what did you expect?', 'ምን ተከሰተ፣ ምንስ ጠብቀው ነበር?')}>
          <Textarea required minLength={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('Add a file or photo (optional)', 'ፋይል ወይም ፎቶ ያያይዙ (አማራጭ)')} hint={t('For example a screenshot or a receipt.', 'ለምሳሌ የስክሪን ፎቶ ወይም ደረሰኝ።')}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.zip,.csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:font-semibold"
          />
        </Field>
        <ErrorText error={error} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" busy={busy} disabled={!category || subject.trim().length < 3 || description.trim().length < 5} className="w-full sm:w-auto">
            {t('Send', 'ላክ')}
          </Button>
          <Button type="button" tone="ghost" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            {t('Cancel', 'ይቅር')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
