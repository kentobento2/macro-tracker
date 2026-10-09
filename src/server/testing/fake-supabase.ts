// A small in-memory stand-in for the parts of supabase-js the MCP server uses. It applies every filter
// faithfully, so a query that forgot its user_id condition would return (or change) other users' rows,
// which is exactly what the isolation tests check for. Test-only.

type Row = Record<string, unknown>;
type Filter = { col: string; op: 'eq' | 'gte' | 'lte'; value: unknown };

export type FakeDb = {
  tables: Record<string, Row[]>;
  /** OAuth access token -> user id, for auth.getUser. */
  sessions: Record<string, string>;
  rateLimitAllows: boolean;
};

let seq = 0;
const nowIso = () => new Date(Date.UTC(2026, 9, 9, 0, 0, seq++)).toISOString();

class Query {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row | Row[] | null = null;
  private conflict: string[] = [];
  private returning = false;
  private single = false;
  private orderCol: string | null = null;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_cols?: string) {
    if (this.op === 'select') return this;
    this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(row: Row, opts: { onConflict: string }) {
    this.op = 'upsert';
    this.payload = row;
    this.conflict = opts.onConflict.split(',');
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ col, op: 'eq', value });
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push({ col, op: 'gte', value });
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push({ col, op: 'lte', value });
    return this;
  }
  order(col: string) {
    this.orderCol = col;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private rows() {
    return (this.db.tables[this.table] ??= []);
  }
  private matches(row: Row) {
    return this.filters.every(({ col, op, value }) => {
      const v = row[col] as string | number;
      if (op === 'eq') return v === value;
      if (op === 'gte') return v >= (value as string | number);
      return v <= (value as string | number);
    });
  }
  private withDefaults(row: Row): Row {
    const t = nowIso();
    return { created_at: t, updated_at: t, ...row };
  }

  private execute(): { data: unknown; error: { message: string } | null } {
    const rows = this.rows();
    switch (this.op) {
      case 'select': {
        let found = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
        if (this.orderCol) {
          const c = this.orderCol;
          found = found.sort((a, b) => String(a[c]).localeCompare(String(b[c])));
        }
        if (this.single) {
          if (found.length > 1) return { data: null, error: { message: 'multiple rows' } };
          return { data: found[0] ?? null, error: null };
        }
        return { data: found, error: null };
      }
      case 'insert': {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => this.withDefaults(r));
        for (const r of list) {
          if (r.id !== undefined && rows.some((x) => x.id === r.id)) return { data: null, error: { message: 'duplicate key' } };
        }
        rows.push(...list);
        return { data: this.returning ? list : null, error: null };
      }
      case 'upsert': {
        const row = this.payload as Row;
        const existing = rows.find((r) => this.conflict.every((c) => r[c] === row[c]));
        if (existing) Object.assign(existing, row, { updated_at: nowIso() });
        else rows.push(this.withDefaults(row));
        return { data: null, error: null };
      }
      case 'update': {
        const found = rows.filter((r) => this.matches(r));
        for (const r of found) Object.assign(r, this.payload, { updated_at: nowIso() });
        return { data: this.returning ? found.map((r) => ({ ...r })) : null, error: null };
      }
      case 'delete': {
        const removed = rows.filter((r) => this.matches(r));
        this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
        return { data: this.returning ? removed : null, error: null };
      }
    }
  }

  // Awaitable like a supabase-js query builder.
  then<A, B>(onfulfilled?: (v: { data: unknown; error: { message: string } | null }) => A, onrejected?: (e: unknown) => B) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createFakeDb(initial: Partial<FakeDb> = {}): FakeDb {
  return { tables: {}, sessions: {}, rateLimitAllows: true, ...initial };
}

/** A supabase-js-shaped client over a FakeDb. Cast to Db at the call site. */
export function fakeClient(db: FakeDb) {
  return {
    from: (table: string) => new Query(db, table),
    rpc: async (_fn: string, _args: unknown) => ({ data: db.rateLimitAllows, error: null }),
    auth: {
      getUser: async (token: string) => {
        const id = db.sessions[token];
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
  };
}
