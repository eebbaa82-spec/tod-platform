'use client';
import { LanguageProvider } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';
import { Shell } from '@/components/shell';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SessionProvider>
        <Shell>{children}</Shell>
      </SessionProvider>
    </LanguageProvider>
  );
}
