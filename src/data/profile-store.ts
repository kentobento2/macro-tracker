// Offline-first store for the signed-in user's profile and targets.

import { profileFromRow, profileToRow, type Profile } from '@/lib/rows';
import { supabase } from '@/lib/supabase';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

export type ProfileState = {
  ready: boolean;
  profile: Profile | null;
  /** Saved on this device but not yet on the server. */
  pending: boolean;
  syncError: string | null;
};

type Persisted = { profile: Profile | null; pending: boolean };

export class ProfileStore {
  private state: ProfileState = { ready: false, profile: null, pending: false, syncError: null };
  private listeners = new Set<() => void>();
  private pushing = false;
  private readonly key: string;

  constructor(private readonly userId: string) {
    this.key = `${userKeyPrefix(userId)}profile`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<ProfileState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
    void writeJSON(this.key, { profile: this.state.profile, pending: this.state.pending } satisfies Persisted);
  }

  async init() {
    const saved = await readJSON<Persisted>(this.key, { profile: null, pending: false });
    this.set({ ...saved, ready: true });
    await (saved.pending ? this.push() : this.refresh());
  }

  async refresh() {
    if (this.state.pending) return this.push();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', this.userId).maybeSingle();
    if (error) return;
    this.set({ profile: data ? profileFromRow(data) : null });
  }

  save(profile: Profile) {
    this.set({ profile, pending: true, syncError: null });
    void this.push();
  }

  async push() {
    if (this.pushing) return;
    this.pushing = true;
    try {
      // Loops if the profile was edited again while a request was in flight.
      while (this.state.pending && this.state.profile) {
        const sent = this.state.profile;
        const result = await supabase.from('profiles').upsert(profileToRow(this.userId, sent));
        if (isRetryable(result)) return;
        const { error } = result;
        if (error) {
          console.warn('Profile save rejected', error);
          this.set({ pending: false, syncError: "Your settings couldn't be saved. Check the values and try again." });
          return;
        }
        if (this.state.profile === sent) this.set({ pending: false });
      }
    } finally {
      this.pushing = false;
    }
  }
}
