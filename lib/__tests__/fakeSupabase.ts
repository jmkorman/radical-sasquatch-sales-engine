// Minimal in-memory fake of the @supabase/supabase-js client surface used
// by this codebase. Only the chain methods we actually call are supported.
// Intentionally NOT a general-purpose mock — each test should use a fresh
// instance via createFakeSupabase().
//
// Supported chains (mirroring lib/supabase/queries.ts + events/queries.ts):
//   from(table).select("*").order(...).order(...) => { data, error }
//   from(table).select("*").eq(col, val).single() => { data, error }
//   from(table).select("id", { count: "exact", head: true }) => { error }
//   from(table).insert([rows]).select().single() => { data, error }
//   from(table).update(payload).eq(col, val) => { error }
//   from(table).update(payload).eq(col, val).select().single() => { data, error }
//   from(table).update(payload).or(...).neq(col, val) => { error }
//   from(table).upsert(rows, { onConflict }) => { error }
//   from(table).delete().eq(col, val) => { error }
//
// The fake is also "thenable" at every step so `await` works regardless of
// where the caller stops chaining — matching how the real client behaves.

type Row = Record<string, unknown>;

export interface FakeSupabaseState {
  tables: Record<string, Row[]>;
  // Tables that should respond as if missing (PGRST204-style).
  missingTables: Set<string>;
  // Tables that should error on the next mutation with the given error.
  errorOnNextMutation: Map<string, { code?: string; message?: string }>;
  // Stored last operation for diagnostics.
  lastOp?: string;
}

export interface FakeSupabaseClient {
  state: FakeSupabaseState;
  from(table: string): QueryBuilder;
}

interface QueryResult<T = Row[] | Row | null> {
  data: T;
  error: { code?: string; message?: string } | null;
  count?: number;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string, opts?: { count?: string; head?: boolean }): QueryBuilder;
  insert(rows: Row[]): QueryBuilder;
  update(payload: Row): QueryBuilder;
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): QueryBuilder;
  delete(): QueryBuilder;
  eq(col: string, val: unknown): QueryBuilder;
  neq(col: string, val: unknown): QueryBuilder;
  ilike(col: string, pattern: string): QueryBuilder;
  or(expr: string): QueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): QueryBuilder;
  single(): PromiseLike<QueryResult<Row | null>>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

type Op =
  | { kind: "select"; head: boolean; count: boolean }
  | { kind: "insert"; rows: Row[] }
  | { kind: "update"; payload: Row }
  | { kind: "upsert"; rows: Row[]; onConflict?: string }
  | { kind: "delete" };

interface Filter {
  kind: "eq" | "neq" | "ilike" | "or";
  col?: string;
  val?: unknown;
  expr?: string;
}

function matchesFilter(row: Row, filter: Filter): boolean {
  if (filter.kind === "eq") return row[filter.col!] === filter.val;
  if (filter.kind === "neq") return row[filter.col!] !== filter.val;
  if (filter.kind === "ilike") {
    const v = String(row[filter.col!] ?? "");
    const pat = String(filter.expr ?? filter.val ?? "").replace(/%/g, "");
    return v.toLowerCase().includes(pat.toLowerCase());
  }
  if (filter.kind === "or") {
    // Parse very simple "a.eq.X,b.eq.Y" expressions (no nested groups).
    const parts = (filter.expr ?? "").split(",");
    return parts.some((p) => {
      const m = p.match(/^([a-z_]+)\.eq\.(.+)$/i);
      if (!m) return false;
      return row[m[1]] === m[2];
    });
  }
  return true;
}

function applyAll(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
}

function makeBuilder(state: FakeSupabaseState, table: string): QueryBuilder {
  let op: Op | null = null;
  const filters: Filter[] = [];
  let wantSingle = false;
  let wantHead = false;

  const exec = async (): Promise<QueryResult> => {
    state.lastOp = `${table}:${op?.kind ?? "select"}`;
    if (state.missingTables.has(table)) {
      return { data: null, error: { code: "PGRST204", message: "Could not find the table" } };
    }
    const errorOverride = state.errorOnNextMutation.get(table);
    if (errorOverride && op && op.kind !== "select") {
      state.errorOnNextMutation.delete(table);
      return { data: null, error: errorOverride };
    }
    state.tables[table] = state.tables[table] ?? [];
    const rows = state.tables[table];

    if (!op || op.kind === "select") {
      const matched = applyAll(rows, filters);
      if (wantHead) return { data: null, error: null, count: matched.length };
      if (wantSingle) {
        if (matched.length !== 1) {
          return {
            data: null,
            error: { code: "PGRST116", message: `expected single row, got ${matched.length}` },
          };
        }
        return { data: matched[0], error: null };
      }
      return { data: matched, error: null };
    }

    if (op.kind === "insert") {
      for (const r of op.rows) rows.push({ ...r });
      if (wantSingle) return { data: { ...op.rows[op.rows.length - 1] }, error: null };
      return { data: op.rows.map((r) => ({ ...r })), error: null };
    }

    if (op.kind === "update") {
      const matched = applyAll(rows, filters);
      for (const r of matched) Object.assign(r, op.payload);
      if (wantSingle) {
        if (matched.length !== 1) {
          return {
            data: null,
            error: { code: "PGRST116", message: `expected single row, got ${matched.length}` },
          };
        }
        return { data: { ...matched[0] }, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    }

    if (op.kind === "upsert") {
      const conflict = op.onConflict ?? "id";
      for (const r of op.rows) {
        const idx = rows.findIndex((existing) => existing[conflict] === r[conflict]);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
        else rows.push({ ...r });
      }
      return { data: op.rows.map((r) => ({ ...r })), error: null };
    }

    if (op.kind === "delete") {
      const remaining = rows.filter((row) => !filters.every((f) => matchesFilter(row, f)));
      state.tables[table] = remaining;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  };

  const builder: QueryBuilder = {
    select(_columns?: string, opts?: { head?: boolean; count?: string }) {
      // For .insert().select().single() — the existing op stays.
      if (!op) op = { kind: "select", head: Boolean(opts?.head), count: Boolean(opts?.count) };
      wantHead = Boolean(opts?.head);
      return builder;
    },
    insert(rows: Row[]) {
      op = { kind: "insert", rows };
      return builder;
    },
    update(payload: Row) {
      op = { kind: "update", payload };
      return builder;
    },
    upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
      const arr = Array.isArray(rows) ? rows : [rows];
      op = { kind: "upsert", rows: arr, onConflict: opts?.onConflict };
      return builder;
    },
    delete() {
      op = { kind: "delete" };
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push({ kind: "eq", col, val });
      return builder;
    },
    neq(col: string, val: unknown) {
      filters.push({ kind: "neq", col, val });
      return builder;
    },
    ilike(col: string, pattern: string) {
      filters.push({ kind: "ilike", col, val: pattern });
      return builder;
    },
    or(expr: string) {
      filters.push({ kind: "or", expr });
      return builder;
    },
    order() {
      // Sort is not relevant for assertion-level tests; leave as-is.
      return builder;
    },
    single() {
      wantSingle = true;
      return { then: (resolve: (r: QueryResult<Row | null>) => unknown) => exec().then(resolve as never) } as PromiseLike<QueryResult<Row | null>>;
    },
    then(onfulfilled, onrejected) {
      return exec().then(onfulfilled as never, onrejected as never);
    },
  };

  return builder;
}

export function createFakeSupabase(seed?: Record<string, Row[]>): FakeSupabaseClient {
  const state: FakeSupabaseState = {
    tables: {},
    missingTables: new Set(),
    errorOnNextMutation: new Map(),
  };
  if (seed) {
    for (const [table, rows] of Object.entries(seed)) {
      state.tables[table] = rows.map((r) => ({ ...r }));
    }
  }
  return {
    state,
    from(table: string) {
      return makeBuilder(state, table);
    },
  };
}
