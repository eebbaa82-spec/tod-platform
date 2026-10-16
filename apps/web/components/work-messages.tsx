'use client';
import { useEffect, useRef, useState } from 'react';
import { post } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { Alert, Button, Card, Empty, ErrorText, Select, Spinner, Textarea, useAction } from './ui';
import { FileLink, FileUploader } from './work-common';

// Conversation for one assignment. Before agreement a client has one thread
// per invited talent; afterwards only the chosen talent's thread.
export function MessagesPanel({ a, talentId, setTalentId }: { a: any; talentId: string | null; setTalentId: (id: string) => void }) {
  const { t } = useLang();
  const role = a.viewerRole as string;
  const choosing = role === 'CLIENT' && !a.talentId;
  const threads = useApi<{ talentId: string; count: number; lastAt: string }[]>(choosing ? `/assignments/${a.id}/messages/threads` : null);

  // Talents the client may write to before agreement: those who sent offers, plus any thread already started.
  const names = new Map<string, string>();
  for (const p of a.proposals ?? []) names.set(p.talentId, p.talent?.name ?? '');
  const options: { value: string; label: string }[] = [];
  if (choosing) {
    for (const [id, name] of names) options.push({ value: id, label: name });
    for (const th of threads.data ?? []) if (!names.has(th.talentId)) options.push({ value: th.talentId, label: t('Invited talent', 'የተጋበዘ ባለሙያ') });
  }

  const effective = role === 'CLIENT' ? (a.talentId ?? talentId) : role === 'STAFF' ? a.talentId : null;
  const usable = role === 'CLIENT' ? !!effective : role === 'STAFF' ? !!a.talentId : role === 'TALENT' || (role === 'INVITED_TALENT' && a.status === 'OPEN');

  useEffect(() => {
    if (choosing && !talentId && options.length) setTalentId(options[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choosing, talentId, options.length]);

  if (a.status === 'REQUESTED') return null;

  return (
    <Card title={<span id="messages">{t('Messages', 'መልእክቶች')}</span>}>
      {choosing && (
        <div className="mb-3">
          {options.length === 0 ? (
            <Empty>{t('You can message a talent once they send an offer.', 'ባለሙያው ቅናሽ ሲልክ መልእክት መላክ ይችላሉ።')}</Empty>
          ) : (
            <Select aria-label={t('Talk to', 'ያነጋግሩ')} value={talentId ?? ''} onChange={(e) => setTalentId(e.target.value)} options={options} />
          )}
        </div>
      )}
      {usable ? <Thread a={a} talentId={role === 'CLIENT' ? effective : role === 'STAFF' ? effective : null} readOnly={role === 'STAFF'} /> : !choosing && <Empty>{t('Messages are not available for this job.', 'ለዚህ ሥራ መልእክቶች አይገኙም።')}</Empty>}
    </Card>
  );
}

function Thread({ a, talentId, readOnly }: { a: any; talentId: string | null; readOnly: boolean }) {
  const { t, lang } = useLang();
  const { me } = useSession();
  const path = `/assignments/${a.id}/messages${talentId ? `?talentId=${encodeURIComponent(talentId)}` : ''}`;
  const { data, error, loading, reload } = useApi<any>(path);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [maskedNow, setMaskedNow] = useState(false);
  const send = useAction();
  const end = useRef<HTMLDivElement>(null);
  const closed = ['CLOSED', 'CANCELLED'].includes(a.status);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [data?.messages?.length]);

  const fileName = (id: string) => data?.files?.find((f: any) => f.id === id)?.name;

  const submit = () =>
    send.run(async () => {
      const m = await post<any>(`/assignments/${a.id}/messages`, { body: body.trim(), fileIds: files.length ? files.map((f) => f.id) : undefined, talentId: talentId ?? undefined });
      setMaskedNow(!!m.masked);
      setBody('');
      setFiles([]);
      reload();
    });

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <Alert tone="info">{lang === 'am' ? data.notice?.am : data.notice?.en}</Alert>
      {data.contactsHidden && <p className="text-xs text-stone-500">{t('Phone numbers, emails and chat handles are hidden until the payment is held by the bank.', 'ክፍያው በባንኩ እስኪያዝ ድረስ ስልክ ቁጥሮች፣ ኢሜይሎች እና የቻት መለያዎች ይደበቃሉ።')}</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-2">
        {data.messages.length === 0 ? (
          <p className="p-4 text-center text-sm text-stone-500">{t('No messages yet. Say hello!', 'ገና መልእክት የለም። ሰላም ይበሉ!')}</p>
        ) : (
          data.messages.map((m: any) => {
            const mine = m.senderId === me?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand-600 text-white' : 'bg-white text-stone-900 ring-1 ring-stone-200'}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {m.fileIds?.length > 0 && (
                    <div className={`mt-1 flex flex-col gap-1 ${mine ? '[&_a]:text-white' : ''}`}>
                      {m.fileIds.map((f: string) => <FileLink key={f} id={f} name={fileName(f)} />)}
                    </div>
                  )}
                  {m.masked && <p className={`mt-1 text-xs ${mine ? 'text-white/80' : 'text-stone-500'}`}>{t('Contact details were hidden.', 'የመገናኛ ዝርዝሮች ተደብቀዋል።')}</p>}
                  <p className={`mt-1 text-[11px] ${mine ? 'text-white/70' : 'text-stone-400'}`}>{date(m.createdAt, lang, true)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      {maskedNow && <Alert tone="warning">{t('We hid the phone number or contact details in your message. Please keep talking here until the payment is in the bank.', 'በመልእክትዎ ውስጥ ያለውን ስልክ ቁጥር ወይም የመገናኛ ዝርዝር ደብቀናል። ክፍያው ባንክ እስኪገባ ድረስ እባክዎ እዚህ ይነጋገሩ።')}</Alert>}
      {readOnly ? (
        <p className="text-xs text-stone-500">{t('Staff can read this conversation but not post in it.', 'ሠራተኞች ይህን ውይይት ማንበብ ይችላሉ ግን መጻፍ አይችሉም።')}</p>
      ) : closed ? (
        <p className="text-xs text-stone-500">{t('This conversation is closed.', 'ይህ ውይይት ተዘግቷል።')}</p>
      ) : (
        <div className="space-y-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder={t('Write a message…', 'መልእክት ይጻፉ…')} aria-label={t('Message', 'መልእክት')} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <FileUploader purpose="MESSAGE" files={files} onChange={setFiles} label={t('Attach', 'አያይዝ')} />
            <div className="flex gap-2">
              <Button tone="ghost" onClick={reload}>{t('Refresh', 'አድስ')}</Button>
              <Button onClick={submit} busy={send.busy} disabled={!body.trim()} className="flex-1 sm:flex-none">
                {t('Send', 'ላክ')}
              </Button>
            </div>
          </div>
          <ErrorText error={send.error} />
        </div>
      )}
    </div>
  );
}
