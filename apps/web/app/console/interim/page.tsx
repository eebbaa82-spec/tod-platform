'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, shortId } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, Empty, ErrorText, PageTitle, Spinner, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

// Interim escrow (FR-ESC-14): every release and refund needs two different finance officers.
export default function InterimPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.interim]}>
      <PageTitle sub={t('While escrow runs in interim mode, one finance officer authorises each release or refund and a second one approves it.', 'ዕግዱ በጊዜያዊ ሁኔታ ሲሠራ፣ እያንዳንዱን ክፍያ ወይም ተመላሽ አንድ የፋይናንስ ባለሙያ ይፈቅዳል ሁለተኛው ያጸድቃል።')}>
        {t('Interim payouts', 'ጊዜያዊ ክፍያዎች')}
      </PageTitle>
      <Interim />
    </RequireAuth>
  );
}

function Interim() {
  const { t, lang } = useLang();
  const { me, has } = useSession();
  const list = useApi<any[]>('/payments/interim');
  const [ok, setOk] = useState<string | null>(null);
  const a = useAction();
  const canAct = has('FINANCE_OFFICER');
  const act = async (path: string, body: object, msg: string) => {
    const r = await a.run(() => post(path, body));
    if (r) {
      setOk(msg);
      list.reload();
    }
  };

  return (
    <div className="space-y-4">
      <Alert tone="warning">{t('Interim arrangement: these funds are not in regulated escrow and are kept apart from consortium operating funds.', 'ጊዜያዊ ዝግጅት፦ እነዚህ ገንዘቦች በተቆጣጣሪ ዕግድ ውስጥ አይደሉም፤ ከጥምረቱ የሥራ ማስኬጃ ገንዘብ ተለይተው ይቀመጣሉ።')}</Alert>
      <Notice ok={ok} />
      <ErrorText error={list.error || a.error} />
      {list.loading && !list.data && <Spinner />}
      {list.data && !list.data.length && <Empty>{t('Nothing is waiting.', 'የሚጠብቅ የለም።')}</Empty>}
      {(list.data ?? []).map((s) => {
        const asg = s.milestone.assignment;
        const mine = s.approval?.requestedById === me?.id;
        return (
          <Card key={s.id} title={`${s.kind === 'REFUND' ? t('Refund to the client', 'ለደንበኛው ተመላሽ') : t('Release to the talent', 'ለባለሙያው ክፍያ')} · ${s.instructionRef}`}>
            <div className="space-y-2 text-sm">
              <p>
                <Link href={`/assignments/${asg.id}`} className="font-semibold text-brand-700 hover:underline">
                  {asg.ref} {asg.title}
                </Link>{' '}
                · {t('milestone', 'ደረጃ')} {s.milestone.seq}
              </p>
              <p>
                {s.kind === 'REFUND'
                  ? t(`Refund ${etb(s.refundAmount)}`, `ተመላሽ ${etb(s.refundAmount)}`)
                  : t(`Gross ${etb(s.gross)}, commission ${etb(s.commission)}, to the talent ${etb(s.net)}`, `ጠቅላላ ${etb(s.gross)}፣ ኮሚሽን ${etb(s.commission)}፣ ለባለሙያው ${etb(s.net)}`)}
              </p>
              <p className="text-stone-500">
                {t('Waiting since', 'ከ')} {date(s.createdAt, lang, true)} · {t('case owner', 'ኃላፊ')} {shortId(asg.caseOwnerId)}
              </p>
              {canAct && !s.approval && (
                <Button busy={a.busy} onClick={() => act(`/payments/settlements/${s.id}/authorise`, {}, t('Authorised. A second finance officer must now approve it.', 'ተፈቅዷል። አሁን ሁለተኛ የፋይናንስ ባለሙያ ማጽደቅ አለበት።'))}>
                  {t('Authorise', 'ፍቀድ')}
                </Button>
              )}
              {s.approval && mine && <Alert tone="info">{t('You authorised this. A different finance officer must approve it.', 'ይህንን የፈቀዱት እርስዎ ነዎት። ሌላ የፋይናንስ ባለሙያ ማጽደቅ አለበት።')}</Alert>}
              {canAct && s.approval && !mine && (
                <div className="flex flex-wrap gap-2">
                  <Button busy={a.busy} onClick={() => act(`/payments/interim-approvals/${s.approval.id}/decide`, { approve: true }, t('Approved and sent.', 'ጸድቆ ተልኳል።'))}>
                    {t('Approve and send', 'አጽድቅ እና ላክ')}
                  </Button>
                  <Button tone="secondary" busy={a.busy} onClick={() => act(`/payments/interim-approvals/${s.approval.id}/decide`, { approve: false }, t('Sent back.', 'ተመልሷል።'))}>
                    {t('Reject', 'ውድቅ አድርግ')}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
