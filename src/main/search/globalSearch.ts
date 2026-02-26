import type Database from 'better-sqlite3';

export type GlobalSearchEntityKind =
  | 'memo'
  | 'note'
  | 'todo_item'
  | 'todo_list'
  | 'collection_item';

export interface GlobalSearchResultItem {
  kind: GlobalSearchEntityKind;
  id: string;
  title: string;
  preview: string;
  updatedAtMs: number;
  matchSnippet: string | null;
}

export interface GlobalSearchQueryArgs {
  query: string;
  page: number;
  pageSize: number;
}

export type GlobalSearchQueryMode = 'fts' | 'fallback';

export interface GlobalSearchQueryResult {
  mode: GlobalSearchQueryMode;
  ftsAvailable: boolean;
  degradedReason: string | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: GlobalSearchResultItem[];
}

export interface GlobalSearchRebuildIndexResult {
  ok: true;
  ftsAvailable: boolean;
  rebuilt: boolean;
  message: string;
}

function clampPageSize(input: number): number {
  if (!Number.isFinite(input)) return 20;
  const n = Math.floor(input);
  if (n <= 0) return 20;
  return Math.min(n, 50);
}

function safePage(input: number): number {
  if (!Number.isFinite(input)) return 0;
  const n = Math.floor(input);
  return Math.max(0, n);
}

function normalizeQuery(input: string): string {
  return String(input ?? '').trim();
}

function safeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input;
}

function safeNumber(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 0;
  return input;
}

function trimToOneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function buildFallbackSnippet(text: string, query: string): string | null {
  const q = query.trim();
  if (q.length === 0) return null;

  const hay = text;
  const lowerHay = hay.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerHay.indexOf(lowerQ);
  if (idx < 0) return null;

  const context = 40;
  const start = Math.max(0, idx - context);
  const end = Math.min(hay.length, idx + q.length + context);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < hay.length ? '…' : '';
  const before = hay.slice(start, idx);
  const hit = hay.slice(idx, idx + q.length);
  const after = hay.slice(idx + q.length, end);
  return `${prefix}${before}<mark>${hit}</mark>${after}${suffix}`;
}

function isFtsTablePresent(db: Database.Database): boolean {
  try {
    const row = db
      .prepare(
        `
          SELECT 1 AS ok
          FROM sqlite_master
          WHERE type = 'table' AND name = 'global_search_fts'
          LIMIT 1
        `
      )
      .get() as { ok?: 1 } | undefined;
    return row?.ok === 1;
  } catch {
    return false;
  }
}

function ftsQueryOnePage(db: Database.Database, args: {
  query: string;
  offset: number;
  limit: number;
}): { items: GlobalSearchResultItem[]; hasMore: boolean } {
  const pageSize = args.limit;
  const rows = db
    .prepare(
      `
        SELECT
          kind,
          entity_id,
          title,
          body,
          updated_at_ms,
          bm25(global_search_fts) AS rank,
          snippet(global_search_fts, 2, '<mark>', '</mark>', '…', 10) AS title_snippet,
          snippet(global_search_fts, 3, '<mark>', '</mark>', '…', 16) AS body_snippet
        FROM global_search_fts
        WHERE global_search_fts MATCH @query
        ORDER BY rank ASC, updated_at_ms DESC
        LIMIT @limit_plus_one
        OFFSET @offset
      `
    )
    .all({
      query: args.query,
      limit_plus_one: pageSize + 1,
      offset: args.offset,
    }) as Array<{
    kind: GlobalSearchEntityKind;
    entity_id: string;
    title: string;
    body: string;
    updated_at_ms: number;
    title_snippet: string;
    body_snippet: string;
  }>;

  const hasMore = rows.length > pageSize;
  const sliced = rows.slice(0, pageSize);

  const items: GlobalSearchResultItem[] = sliced.map((r) => {
    const kind = r.kind;
    const id = safeString(r.entity_id);

    const titleRaw = trimToOneLine(safeString(r.title));
    const bodyRaw = trimToOneLine(safeString(r.body));
    const title =
      titleRaw.length > 0
        ? truncate(titleRaw, 80)
        : truncate(bodyRaw.length > 0 ? bodyRaw : '(无标题)', 80);

    const preview = truncate(bodyRaw, 140);

    const titleSnippet = safeString(r.title_snippet).trim();
    const bodySnippet = safeString(r.body_snippet).trim();
    const matchSnippet = bodySnippet.length > 0 ? bodySnippet : titleSnippet.length > 0 ? titleSnippet : null;

    const updatedAtMs = Math.max(0, Math.floor(safeNumber(r.updated_at_ms)));

    return {
      kind,
      id,
      title,
      preview,
      updatedAtMs,
      matchSnippet,
    };
  });

  return { items, hasMore };
}

function fallbackQueryOnePage(db: Database.Database, args: {
  query: string;
  offset: number;
  limit: number;
}): { items: GlobalSearchResultItem[]; hasMore: boolean } {
  // 降级策略：只在每张表中扫描“最近 N 条”，避免全表扫描。
  const recentLimit = 300;
  const q = args.query;

  const rows = db
    .prepare(
      `
        WITH
          recent_memos AS (
            SELECT
              'memo' AS kind,
              local_uuid AS entity_id,
              '' AS title,
              content AS body,
              updated_at_ms AS updated_at_ms
            FROM memos
            ORDER BY updated_at_ms DESC
            LIMIT @recent_limit
          ),
          recent_notes AS (
            SELECT
              'note' AS kind,
              id AS entity_id,
              title AS title,
              body_md AS body,
              CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms
            FROM notes
            WHERE deleted_at IS NULL
            ORDER BY client_updated_at_ms DESC
            LIMIT @recent_limit
          ),
          recent_todo_items AS (
            SELECT
              'todo_item' AS kind,
              id AS entity_id,
              title AS title,
              note AS body,
              CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms
            FROM todo_items
            WHERE deleted_at IS NULL
            ORDER BY client_updated_at_ms DESC
            LIMIT @recent_limit
          ),
          recent_todo_lists AS (
            SELECT
              'todo_list' AS kind,
              id AS entity_id,
              name AS title,
              '' AS body,
              CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms
            FROM todo_lists
            WHERE deleted_at IS NULL
            ORDER BY client_updated_at_ms DESC
            LIMIT @recent_limit
          ),
          recent_collection_items AS (
            SELECT
              'collection_item' AS kind,
              id AS entity_id,
              name AS title,
              '' AS body,
              CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms
            FROM collection_items
            WHERE deleted_at IS NULL
            ORDER BY client_updated_at_ms DESC
            LIMIT @recent_limit
          ),
          unioned AS (
            SELECT * FROM recent_memos
            UNION ALL SELECT * FROM recent_notes
            UNION ALL SELECT * FROM recent_todo_items
            UNION ALL SELECT * FROM recent_todo_lists
            UNION ALL SELECT * FROM recent_collection_items
          )
        SELECT kind, entity_id, title, body, updated_at_ms
        FROM unioned
        WHERE
          lower(title) LIKE '%' || lower(@q) || '%'
          OR lower(body) LIKE '%' || lower(@q) || '%'
        ORDER BY updated_at_ms DESC
        LIMIT @limit_plus_one
        OFFSET @offset
      `
    )
    .all({
      q,
      recent_limit: recentLimit,
      limit_plus_one: args.limit + 1,
      offset: args.offset,
    }) as Array<{
    kind: GlobalSearchEntityKind;
    entity_id: string;
    title: string;
    body: string;
    updated_at_ms: number;
  }>;

  const hasMore = rows.length > args.limit;
  const sliced = rows.slice(0, args.limit);

  const items: GlobalSearchResultItem[] = sliced.map((r) => {
    const kind = r.kind;
    const id = safeString(r.entity_id);
    const titleRaw = trimToOneLine(safeString(r.title));
    const bodyRaw = trimToOneLine(safeString(r.body));

    const title =
      titleRaw.length > 0
        ? truncate(titleRaw, 80)
        : truncate(bodyRaw.length > 0 ? bodyRaw : '(无标题)', 80);

    const preview = truncate(bodyRaw, 140);

    const updatedAtMs = Math.max(0, Math.floor(safeNumber(r.updated_at_ms)));

    const snippet =
      buildFallbackSnippet(titleRaw, q) ??
      buildFallbackSnippet(bodyRaw, q) ??
      null;

    return {
      kind,
      id,
      title,
      preview,
      updatedAtMs,
      matchSnippet: snippet,
    };
  });

  return { items, hasMore };
}

export function queryGlobalSearch(
  db: Database.Database,
  input: GlobalSearchQueryArgs
): GlobalSearchQueryResult {
  const query = normalizeQuery(input.query);
  const pageSize = clampPageSize(input.pageSize);
  const page = safePage(input.page);
  const offset = page * pageSize;

  if (query.length === 0) {
    return {
      mode: 'fts',
      ftsAvailable: isFtsTablePresent(db),
      degradedReason: null,
      page,
      pageSize,
      hasMore: false,
      items: [],
    };
  }

  const ftsPresent = isFtsTablePresent(db);
  if (ftsPresent) {
    try {
      const res = ftsQueryOnePage(db, { query, offset, limit: pageSize });
      return {
        mode: 'fts',
        ftsAvailable: true,
        degradedReason: null,
        page,
        pageSize,
        hasMore: res.hasMore,
        items: res.items,
      };
    } catch (error) {
      const res = fallbackQueryOnePage(db, { query, offset, limit: pageSize });
      return {
        mode: 'fallback',
        ftsAvailable: false,
        degradedReason: `fts_query_failed:${String(error)}`,
        page,
        pageSize,
        hasMore: res.hasMore,
        items: res.items,
      };
    }
  }

  const degraded = fallbackQueryOnePage(db, { query, offset, limit: pageSize });
  return {
    mode: 'fallback',
    ftsAvailable: false,
    degradedReason: 'fts_table_missing',
    page,
    pageSize,
    hasMore: degraded.hasMore,
    items: degraded.items,
  };
}

export function rebuildGlobalSearchIndex(db: Database.Database): GlobalSearchRebuildIndexResult {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS global_search_fts
      USING fts5(
        kind UNINDEXED,
        entity_id UNINDEXED,
        title,
        body,
        tags,
        updated_at_ms UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  } catch (error) {
    return {
      ok: true,
      ftsAvailable: false,
      rebuilt: false,
      message: `FTS5 不可用：${String(error)}`,
    };
  }

  try {
    db.exec(`
      DELETE FROM global_search_fts;

      INSERT INTO global_search_fts(kind, entity_id, title, body, tags, updated_at_ms)
      SELECT 'memo', local_uuid, '', content, '', updated_at_ms
        FROM memos;

      INSERT INTO global_search_fts(kind, entity_id, title, body, tags, updated_at_ms)
      SELECT
        'note',
        id,
        title,
        body_md,
        tags_json,
        CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER)
        FROM notes
        WHERE deleted_at IS NULL;

      INSERT INTO global_search_fts(kind, entity_id, title, body, tags, updated_at_ms)
      SELECT
        'todo_item',
        id,
        title,
        note,
        tags_json,
        CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER)
        FROM todo_items
        WHERE deleted_at IS NULL;

      INSERT INTO global_search_fts(kind, entity_id, title, body, tags, updated_at_ms)
      SELECT
        'todo_list',
        id,
        name,
        '',
        '',
        CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER)
        FROM todo_lists
        WHERE deleted_at IS NULL;

      INSERT INTO global_search_fts(kind, entity_id, title, body, tags, updated_at_ms)
      SELECT
        'collection_item',
        id,
        name,
        '',
        '',
        CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER)
        FROM collection_items
        WHERE deleted_at IS NULL;
    `);

    return {
      ok: true,
      ftsAvailable: true,
      rebuilt: true,
      message: '索引已重建',
    };
  } catch (error) {
    return {
      ok: true,
      ftsAvailable: true,
      rebuilt: false,
      message: `重建失败：${String(error)}`,
    };
  }
}
