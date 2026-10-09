import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import { toDateKey, type DateKey } from '@/lib/dates';
import { recentFoods, type FoodEntry } from '@/lib/entries';
import { findEntry, viewDay } from '@/lib/sync';

import { EntriesStore } from './entries-store';
import { ProfileStore } from './profile-store';
import { removeKeys, userKeyPrefix } from './storage';

type Stores = { entries: EntriesStore; profile: ProfileStore; userId: string };

const DataContext = createContext<Stores | null>(null);

const today = () => toDateKey(new Date());

/** Wraps the signed-in app. Re-mount (key by user id) when the user changes. */
export function DataProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const stores = useMemo<Stores>(
    () => ({ entries: new EntriesStore(today, userId), profile: new ProfileStore(userId), userId }),
    [userId]
  );

  useEffect(() => {
    void stores.entries.init();
    void stores.profile.init();
  }, [stores]);

  // Retry pending changes whenever we might be back online.
  const online = useOnline();
  useEffect(() => {
    if (!online) return;
    void stores.entries.flush();
    void stores.profile.push();
  }, [online, stores]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void stores.entries.flush();
        void stores.profile.push();
      }
    });
    return () => sub.remove();
  }, [stores]);

  return <DataContext.Provider value={stores}>{children}</DataContext.Provider>;
}

function useStores(): Stores {
  const s = useContext(DataContext);
  if (!s) throw new Error('useStores must be used inside <DataProvider>');
  return s;
}

export function useEntriesStore() {
  return useStores().entries;
}

function useEntriesState() {
  const store = useEntriesStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Entries for the given days (local view), refreshed from the server on mount and when back online. */
export function useEntries(dates: readonly DateKey[]): { entries: FoodEntry[]; ready: boolean } {
  const store = useEntriesStore();
  const state = useEntriesState();
  const online = useOnline();
  const key = dates.join(',');

  useEffect(() => {
    if (online) void store.refresh(key.split(','));
  }, [store, key, online]);

  const entries = useMemo(
    () => key.split(',').flatMap((d) => viewDay(state.cache, state.queue, d)),
    [state.cache, state.queue, key]
  );
  return { entries, ready: state.ready };
}

export function useEntry(id: string | undefined): FoodEntry | null {
  const state = useEntriesState();
  return id ? findEntry(state.cache, state.queue, id) : null;
}

/** Distinct recently logged foods from everything cached on this device. */
export function useRecentFoods(limit = 15) {
  const state = useEntriesState();
  return useMemo(() => {
    const all = [
      ...Object.values(state.cache).flat(),
      ...state.queue.flatMap((op) => (op.kind === 'upsert' ? [op.entry] : [])),
    ];
    return recentFoods(all, limit);
  }, [state.cache, state.queue, limit]);
}

export function useSyncStatus() {
  const entries = useEntriesState();
  const profile = useProfileState();
  return {
    pendingCount: entries.queue.length + (profile.pending ? 1 : 0),
    syncError: entries.syncError ?? profile.syncError,
  };
}

export function useProfileStore() {
  return useStores().profile;
}

export function useProfileState() {
  const store = useProfileStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Clears this user's data from the device. Call before signing out. */
export function useClearLocalData() {
  const { userId } = useStores();
  return () => removeKeys(userKeyPrefix(userId));
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Today's date key, updated when the app comes back to the foreground (e.g. after midnight). */
export function useToday(): DateKey {
  const [value, setValue] = useState(today);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setValue(today()));
    return () => sub.remove();
  }, []);
  return value;
}
