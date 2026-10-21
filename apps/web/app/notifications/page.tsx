'use client';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/shell';
import { Button, Empty, ErrorText, PageTitle, Spinner, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}

function Notifications() {
  const { t, lang } = useLang();
  const router = useRouter();
  const { data, error, loading, setData } = useApi<{ items: Notification[]; unreadCount: number }>(`/notifications?lang=${lang}`);
  const all = useAction();

  const markRead = (id: string) =>
    setData((d) => (d ? { items: d.items.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)), unreadCount: Math.max(0, d.unreadCount - (d.items.find((n) => n.id === id && !n.readAt) ? 1 : 0)) } : d));

  const open = async (n: Notification) => {
    if (!n.readAt) {
      markRead(n.id);
      post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) {
      if (n.link.startsWith('/') && !n.link.startsWith('//')) router.push(n.link);
      else if (/^https?:\/\//i.test(n.link)) window.location.href = n.link;
    }
  };

  const readAll = () =>
    all.run(async () => {
      await post('/notifications/read-all');
      setData((d) => (d ? { items: d.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })), unreadCount: 0 } : d));
    });

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        sub={data ? t(`${data.unreadCount} unread`, `${data.unreadCount} ያልተነበቡ`) : undefined}
        actions={
          data && data.unreadCount > 0 ? (
            <Button tone="secondary" onClick={readAll} busy={all.busy}>
              {t('Mark all as read', 'ሁሉንም እንደተነበበ ምልክት አድርግ')}
            </Button>
          ) : undefined
        }
      >
        {t('Notifications', 'ማሳወቂያዎች')}
      </PageTitle>
      <ErrorText error={all.error} />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorText error={error} />
      ) : !data?.items.length ? (
        <Empty>{t('You have no notifications yet.', 'እስካሁን ምንም ማሳወቂያ የለዎትም።')}</Empty>
      ) : (
        <ul className="space-y-2">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:border-brand-500 ${n.readAt ? 'border-stone-200 bg-white' : 'border-brand-100 bg-brand-50'}`}
              >
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-600'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.readAt ? 'font-medium' : 'font-semibold'}`}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> ({t('unread', 'ያልተነበበ')})</span>}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-line text-sm text-stone-700">{n.body}</span>
                  <span className="mt-1 block text-xs text-stone-500">{date(n.createdAt, lang, true)}</span>
                </span>
                {n.link && <span className="self-center text-brand-700" aria-hidden>›</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
