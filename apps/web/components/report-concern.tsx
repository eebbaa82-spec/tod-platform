'use client';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Alert, Button, ErrorText, Field, LinkButton, Modal, Select, Textarea, useAction } from './ui';

// Confidential safeguarding channel, reachable from every screen (FR-SUP-02).
export function ReportConcern({ assignmentId }: { assignmentId?: string }) {
  const { t } = useLang();
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('HARASSMENT');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const submit = () =>
    run(async () => {
      const r = await post('/support/reports', { type, description, assignmentId });
      setDone(r.ref);
      setDescription('');
    });

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-red-700 underline-offset-2 hover:underline">
        {t('Report a concern', 'ስጋት ሪፖርት ያድርጉ')}
      </button>
      <Modal open={open} onClose={() => { setOpen(false); setDone(null); }} title={t('Report a concern in confidence', 'ስጋትዎን በሚስጥር ያሳውቁ')}>
        {!me ? (
          <div className="space-y-3 text-sm">
            <p>{t('Sign in to send a confidential report, or call the ToD help line.', 'ሚስጥራዊ ሪፖርት ለመላክ ይግቡ፣ ወይም ወደ ToD የእርዳታ መስመር ይደውሉ።')}</p>
            <LinkButton href="/login">{t('Sign in', 'ይግቡ')}</LinkButton>
          </div>
        ) : done ? (
          <Alert tone="success">
            {t(`Your report ${done} was received. Only designated safeguarding staff can see it. They will contact you within two working days.`, `ሪፖርትዎ ${done} ደርሷል። የሚያዩት የተመደቡ የጥበቃ ሠራተኞች ብቻ ናቸው። በሁለት የሥራ ቀናት ውስጥ ያገኙዎታል።`)}
          </Alert>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              {t('Only designated safeguarding staff will see this. The other party is not told.', 'ይህን የሚያዩት የተመደቡ የጥበቃ ሠራተኞች ብቻ ናቸው። ለሌላኛው ወገን አይነገርም።')}
            </p>
            <Field label={t('What happened?', 'ምን ተከሰተ?')}>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'HARASSMENT', label: t('Harassment', 'ትንኮሳ') },
                  { value: 'EXPLOITATION', label: t('Exploitation', 'ብዝበዛ') },
                  { value: 'DISCRIMINATION', label: t('Discrimination', 'መድልዎ') },
                  { value: 'FRAUD', label: t('Fraud or scam', 'ማጭበርበር') },
                ]}
              />
            </Field>
            <Field label={t('Tell us what happened', 'የተከሰተውን ይንገሩን')}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            <Button onClick={submit} busy={busy} disabled={description.trim().length < 5} className="w-full">
              {t('Send in confidence', 'በሚስጥር ላክ')}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
