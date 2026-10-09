import { useOnline, useSyncStatus } from '@/data/data-provider';

import { Banner } from './ui';

export function SyncBanner() {
  const online = useOnline();
  const { pendingCount, syncError } = useSyncStatus();

  if (syncError) return <Banner>{syncError}</Banner>;
  if (!online) {
    return (
      <Banner>
        {"You're offline."}
        {pendingCount ? ` ${pendingCount} change${pendingCount === 1 ? '' : 's'} will sync when you reconnect.` : ' Showing saved data.'}
      </Banner>
    );
  }
  if (pendingCount) return <Banner tone="info">Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}…</Banner>;
  return null;
}
