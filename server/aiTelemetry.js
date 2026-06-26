import { randomUUID } from 'node:crypto';
import { query as dbQuery } from './db.js';

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

let telemetrySchemaPromise = null;

async function ensureTelemetrySchema() {
  if (!telemetrySchemaPromise) {
    telemetrySchemaPromise = dbQuery(`
      create table if not exists ai_interactions (
        request_id text primary key,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        endpoint text not null,
        shift_name text not null,
        active_tab text,
        raw_query text not null,
        normalized_query text not null,
        intent text,
        retrieval_source text,
        retrieval_query_type text,
        sql_text text,
        tables_used jsonb,
        row_count integer,
        latency_ms integer,
        model_name text,
        response_status text not null default 'started',
        fallback_used boolean not null default false,
        response_preview text,
        response_length integer,
        feedback_rating integer,
        feedback_comment text,
        resolved_scope text,
        resolved_window text,
        reasked_or_corrected boolean not null default false
      );
      create table if not exists ai_feedback (
        id serial primary key,
        request_id text not null,
        created_at timestamptz not null default now(),
        rating integer not null,
        comment text,
        correct_answer text,
        shift_name text,
        active_tab text
      );
      create table if not exists ai_failures (
        id serial primary key,
        request_id text,
        created_at timestamptz not null default now(),
        failure_type text not null,
        failure_reason text not null,
        raw_query text not null,
        normalized_query text not null,
        shift_name text not null,
        active_tab text,
        detected_gap text,
        severity text not null default 'medium',
        status text not null default 'open',
        expected_answer text,
        source text,
        query_type text,
        resolved_scope text,
        resolved_window text,
        reasked_or_corrected boolean not null default false
      );
      create table if not exists retrieval_gaps (
        id serial primary key,
        gap_key text not null unique,
        gap_type text not null,
        capability_name text not null,
        example_queries jsonb not null default '[]'::jsonb,
        frequency integer not null default 0,
        failure_count integer not null default 0,
        proposal_json jsonb not null default '{}'::jsonb,
        status text not null default 'proposed',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table if not exists retrieval_proposals (
        id serial primary key,
        gap_id integer not null references retrieval_gaps(id) on delete cascade,
        capability_name text not null,
        patch_json jsonb not null default '{}'::jsonb,
        test_json jsonb not null default '[]'::jsonb,
        status text not null default 'proposed',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        applied_at timestamptz
      );
      create index if not exists idx_ai_interactions_created_at on ai_interactions (created_at desc);
      create index if not exists idx_ai_interactions_request_id on ai_interactions (request_id);
      create index if not exists idx_ai_feedback_request_id on ai_feedback (request_id);
      create index if not exists idx_ai_failures_created_at on ai_failures (created_at desc);
      create index if not exists idx_ai_failures_gap on ai_failures (detected_gap);
      create index if not exists idx_retrieval_gaps_status on retrieval_gaps (status);
      create index if not exists idx_retrieval_proposals_gap_id on retrieval_proposals (gap_id);
      create unique index if not exists idx_retrieval_proposals_gap_capability on retrieval_proposals (gap_id, capability_name);
    `).catch((error) => {
      telemetrySchemaPromise = null;
      throw error;
    });

    await dbQuery(`
      alter table ai_interactions
        add column if not exists resolved_scope text,
        add column if not exists resolved_window text,
        add column if not exists reasked_or_corrected boolean not null default false;
      alter table ai_failures
        add column if not exists resolved_scope text,
        add column if not exists resolved_window text,
        add column if not exists reasked_or_corrected boolean not null default false;
    `).catch((error) => {
      telemetrySchemaPromise = null;
      throw error;
    });
  }

  return telemetrySchemaPromise;
}

function normalizeCorrectionFlag(record = {}) {
  const text = normalize([record.comment, record.correctAnswer, record.rawQuery].filter(Boolean).join(' '));
  if (record.reaskedOrCorrected !== undefined) {
    return Boolean(record.reaskedOrCorrected);
  }
  if (Number(record.rating) <= 2) return true;
  return /\b(correct|wrong|not accurate|incomplete|reask|again|different|should be|instead)\b/.test(text);
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function stripOrdinals(value) {
  return String(value ?? '').replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1');
}

function compact(value, limit = 1800) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function safeJson(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function hasExactDate(text) {
  const normalized = stripOrdinals(text);
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{2}-\d{2}-\d{4}\b/.test(normalized) ||
    /\b(?:\d{1,2})\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?\b/i.test(normalized) ||
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:\s+\d{4})?\b/i.test(normalized)
  );
}

function monthMentions(text) {
  const normalized = stripOrdinals(text).toLowerCase();
  return [...normalized.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g)]
    .map((match) => match[1]);
}

function isComparison(text) {
  const normalized = normalize(text);
  return normalized.includes(' compare ') || normalized.startsWith('compare ') || normalized.includes(' comparison') || normalized.includes(' vs ') || normalized.includes(' versus ') || normalized.includes(' between ') || normalized.includes(' difference ') || normalized.includes(' changed ');
}

function inferIntent(query) {
  const text = normalize(query);
  const months = monthMentions(text);
  if (hasExactDate(text) && isComparison(text)) return 'date_compare';
  if (hasExactDate(text)) return 'exact_day';
  if (months.length >= 2 && isComparison(text)) return 'month_compare';
  if (months.length === 1) return 'month_summary';
  if (text.includes('last 90 days') || text.includes('last 180 days') || text.includes('last 210 days') || /\b(last|past|previous)\s+\d+\s+days?\b/.test(text)) {
    return 'range_summary';
  }
  if (text.includes('capa')) return text.includes('overdue') || text.includes('past due') || text.includes('late') ? 'capa_overdue' : 'capa';
  if (text.includes('ncr')) return 'ncr';
  if (text.includes('workforce') || text.includes('coverage') || text.includes('operator') || text.includes('employee')) return 'workforce';
  if (text.includes('calibration') || text.includes('instrument') || text.includes('certification')) return 'calibration';
  if (text.includes('supplier') || text.includes('audit') || text.includes('vendor')) return 'supplier';
  if (text.includes('quality') || text.includes('defect') || text.includes('scrap') || text.includes('yield')) return 'quality';
  if (text.includes('shift b') || text.includes('shift a') || text.includes('current shift')) return 'shift_context';
  return 'general';
}

function inferGapKey(entry = {}) {
  const query = normalize(entry.rawQuery ?? '');
  const failureType = normalize(entry.failureType ?? '');
  const intent = entry.intent ?? inferIntent(query);

  if (failureType.includes('feedback')) {
    return `feedback:${intent}`;
  }
  if (failureType.includes('no_data')) {
    return `missing-data:${intent}`;
  }
  if (failureType.includes('invalid_date')) {
    return `date-parser:${intent}`;
  }
  if (failureType.includes('no_match')) {
    return `no-match:${intent}`;
  }
  if (hasExactDate(query) && isComparison(query)) return 'comparison:date';
  if (hasExactDate(query)) return 'lookup:date';
  if (monthMentions(query).length >= 2 && isComparison(query)) return 'comparison:month';
  if (monthMentions(query).length === 1) return 'lookup:month';
  if (query.includes('shift b') && entry.shiftName && normalize(entry.shiftName) === 'shift a') return 'shift:override';
  if (query.includes('shift a') && entry.shiftName && normalize(entry.shiftName) === 'shift b') return 'shift:override';
  return `topic:${intent}`;
}

function buildProposal(gap) {
  const capabilityName = gap.capability_name;
  const tests = gap.example_queries.slice(0, 5).flatMap((query) => [
    query,
    `Please answer: ${query}`,
    `Show me the DB-backed answer for: ${query}`
  ]);

  return {
    capability_name: capabilityName,
    gap_type: gap.gap_type,
    gap_key: gap.gap_key,
    summary: `Repeated ${gap.failure_count} failure(s) suggest missing or weak handling for ${capabilityName}.`,
    suggested_files: ['server/retrievalEngine.js', 'server/index.js'],
    suggested_actions: [
      'Add or refine a deterministic retrieval branch.',
      'Add date/shift normalization if the gap is time related.',
      'Add a direct SQL aggregate if the gap is a comparison or summary question.',
      'Add a regression test for each example query.'
    ],
    suggested_tests: tests,
    example_queries: gap.example_queries
  };
}

async function upsertInteractionRecord(record) {
  const requestId = record.requestId ?? randomUUID();
  await dbQuery(
    `insert into ai_interactions (
       request_id, endpoint, shift_name, active_tab, raw_query, normalized_query, intent,
       retrieval_source, retrieval_query_type, sql_text, tables_used, row_count, latency_ms,
       model_name, response_status, fallback_used, response_preview, response_length, feedback_rating,
       feedback_comment, resolved_scope, resolved_window, reasked_or_corrected, created_at, updated_at
     )
     values (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11::jsonb, $12, $13,
       $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23, now(), now()
     )
     on conflict (request_id) do update set
       endpoint = excluded.endpoint,
       shift_name = excluded.shift_name,
       active_tab = excluded.active_tab,
       raw_query = excluded.raw_query,
       normalized_query = excluded.normalized_query,
       intent = excluded.intent,
       retrieval_source = excluded.retrieval_source,
       retrieval_query_type = excluded.retrieval_query_type,
       sql_text = excluded.sql_text,
       tables_used = excluded.tables_used,
       row_count = excluded.row_count,
       latency_ms = excluded.latency_ms,
       model_name = excluded.model_name,
       response_status = excluded.response_status,
       fallback_used = excluded.fallback_used,
       response_preview = excluded.response_preview,
       response_length = excluded.response_length,
       feedback_rating = excluded.feedback_rating,
       feedback_comment = excluded.feedback_comment,
       resolved_scope = excluded.resolved_scope,
       resolved_window = excluded.resolved_window,
       reasked_or_corrected = excluded.reasked_or_corrected,
       updated_at = now()`,
    [
      requestId,
      record.endpoint ?? 'unknown',
      record.shiftName ?? 'Shift A',
      record.activeTab ?? null,
      compact(record.rawQuery ?? ''),
      compact(record.normalizedQuery ?? record.rawQuery ?? ''),
      record.intent ?? inferIntent(record.rawQuery ?? record.normalizedQuery ?? ''),
      record.retrievalSource ?? null,
      record.retrievalQueryType ?? null,
      record.sqlText ?? null,
      safeJson(record.tablesUsed ?? []),
      Number.isFinite(Number(record.rowCount)) ? Number(record.rowCount) : null,
      Number.isFinite(Number(record.latencyMs)) ? Number(record.latencyMs) : null,
      record.modelName ?? null,
      record.responseStatus ?? 'started',
      Boolean(record.fallbackUsed),
      record.responsePreview ? compact(record.responsePreview, 1000) : null,
      Number.isFinite(Number(record.responseLength)) ? Number(record.responseLength) : null,
      Number.isFinite(Number(record.feedbackRating)) ? Number(record.feedbackRating) : null,
      record.feedbackComment ? compact(record.feedbackComment, 1000) : null,
      record.resolvedScope ?? null,
      record.resolvedWindow ?? null,
      normalizeCorrectionFlag(record)
    ]
  );
  return requestId;
}

export async function startAiInteraction(record = {}) {
  await ensureTelemetrySchema();
  return upsertInteractionRecord({
    ...record,
    responseStatus: record.responseStatus ?? 'started',
    reaskedOrCorrected: normalizeCorrectionFlag(record)
  });
}

export async function finishAiInteraction(requestId, patch = {}) {
  if (!requestId) return null;
  await ensureTelemetrySchema();
  await dbQuery(
    `update ai_interactions
     set response_status = coalesce($2, response_status),
         fallback_used = coalesce($3, fallback_used),
         retrieval_source = coalesce($4, retrieval_source),
         retrieval_query_type = coalesce($5, retrieval_query_type),
         sql_text = coalesce($6, sql_text),
         tables_used = coalesce($7::jsonb, tables_used),
         row_count = coalesce($8, row_count),
         latency_ms = coalesce($9, latency_ms),
         model_name = coalesce($10, model_name),
         response_preview = coalesce($11, response_preview),
         response_length = coalesce($12, response_length),
         feedback_rating = coalesce($13, feedback_rating),
         feedback_comment = coalesce($14, feedback_comment),
         resolved_scope = coalesce($15, resolved_scope),
         resolved_window = coalesce($16, resolved_window),
         reasked_or_corrected = coalesce($17, reasked_or_corrected),
         updated_at = now()
     where request_id = $1`,
    [
      requestId,
      patch.responseStatus ?? null,
      patch.fallbackUsed ?? null,
      patch.retrievalSource ?? null,
      patch.retrievalQueryType ?? null,
      patch.sqlText ?? null,
      patch.tablesUsed ? safeJson(patch.tablesUsed) : null,
      Number.isFinite(Number(patch.rowCount)) ? Number(patch.rowCount) : null,
      Number.isFinite(Number(patch.latencyMs)) ? Number(patch.latencyMs) : null,
      patch.modelName ?? null,
      patch.responsePreview ? compact(patch.responsePreview, 1000) : null,
      Number.isFinite(Number(patch.responseLength)) ? Number(patch.responseLength) : null,
      Number.isFinite(Number(patch.feedbackRating)) ? Number(patch.feedbackRating) : null,
      patch.feedbackComment ? compact(patch.feedbackComment, 1000) : null,
      patch.resolvedScope ?? null,
      patch.resolvedWindow ?? null,
      patch.reaskedOrCorrected ?? null
    ]
  );
  return requestId;
}

export async function recordAiFailure(record = {}) {
  await ensureTelemetrySchema();
  await dbQuery(
    `insert into ai_failures (
       request_id, failure_type, failure_reason, raw_query, normalized_query, shift_name,
       active_tab, detected_gap, severity, status, expected_answer, source, query_type,
       resolved_scope, resolved_window, reasked_or_corrected
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      record.requestId ?? null,
      record.failureType ?? 'unknown',
      compact(record.failureReason ?? 'Unknown AI failure', 1800),
      compact(record.rawQuery ?? '', 1800),
      compact(record.normalizedQuery ?? record.rawQuery ?? '', 1800),
      record.shiftName ?? 'Shift A',
      record.activeTab ?? null,
      record.detectedGap ?? null,
      record.severity ?? 'medium',
      record.status ?? 'open',
      record.expectedAnswer ? compact(record.expectedAnswer, 1800) : null,
      record.source ?? null,
      record.queryType ?? null,
      record.resolvedScope ?? null,
      record.resolvedWindow ?? null,
      normalizeCorrectionFlag(record)
    ]
  );
}

export async function recordAiFeedback(record = {}) {
  await ensureTelemetrySchema();
  const requestId = record.requestId ?? randomUUID();
  await dbQuery(
    `insert into ai_feedback (request_id, rating, comment, correct_answer, shift_name, active_tab)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      requestId,
      Number.isFinite(Number(record.rating)) ? Number(record.rating) : 0,
      record.comment ? compact(record.comment, 1800) : null,
      record.correctAnswer ? compact(record.correctAnswer, 1800) : null,
      record.shiftName ?? null,
      record.activeTab ?? null
    ]
  );

  if (Number(record.rating) <= 2) {
    await recordAiFailure({
      requestId,
      failureType: 'feedback',
      failureReason: record.comment || 'Negative feedback from user',
      rawQuery: record.rawQuery ?? record.correctAnswer ?? '',
      normalizedQuery: record.rawQuery ?? record.correctAnswer ?? '',
      shiftName: record.shiftName ?? 'Shift A',
      activeTab: record.activeTab ?? null,
      detectedGap: inferGapKey({
        rawQuery: record.rawQuery ?? record.correctAnswer ?? '',
        failureType: 'feedback',
        shiftName: record.shiftName ?? 'Shift A'
      }),
      severity: 'high',
      status: 'open',
      expectedAnswer: record.correctAnswer ?? null,
      source: record.source ?? null,
      queryType: record.queryType ?? null
    });
  }

  await dbQuery(
    `update ai_interactions
     set feedback_rating = $2,
         feedback_comment = $3,
         reasked_or_corrected = coalesce($4, reasked_or_corrected),
         updated_at = now()
     where request_id = $1`,
    [
      requestId,
      Number.isFinite(Number(record.rating)) ? Number(record.rating) : null,
      record.comment ? compact(record.comment, 1000) : null,
      normalizeCorrectionFlag(record)
    ]
  );

  return requestId;
}

export async function analyzeAiFailures({ days = 30, minCount = 2, limit = 100 } = {}) {
  await ensureTelemetrySchema();
  const result = await dbQuery(
    `select request_id, failure_type, failure_reason, raw_query, normalized_query, shift_name,
            active_tab, detected_gap, severity, status, expected_answer, source, query_type, created_at
     from ai_failures
     where created_at >= now() - ($1::int || ' days')::interval
     order by created_at desc
     limit $2`,
    [days, limit]
  );

  const groups = new Map();
  for (const row of result.rows) {
    const entry = {
      requestId: row.request_id,
      failureType: row.failure_type,
      failureReason: row.failure_reason,
      rawQuery: row.raw_query,
      normalizedQuery: row.normalized_query,
      shiftName: row.shift_name,
      activeTab: row.active_tab,
      detectedGap: row.detected_gap,
      severity: row.severity,
      expectedAnswer: row.expected_answer,
      source: row.source,
      queryType: row.query_type
    };
    const key = row.detected_gap || inferGapKey(entry);
    const capabilityName = inferIntent(row.raw_query);
    if (!groups.has(key)) {
      groups.set(key, {
        gap_key: key,
        gap_type: key.split(':')[0] || 'topic',
        capability_name: capabilityName,
        example_queries: [],
        failure_count: 0
      });
    }
    const group = groups.get(key);
    group.failure_count += 1;
    if (group.example_queries.length < 5 && row.raw_query && !group.example_queries.includes(row.raw_query)) {
      group.example_queries.push(row.raw_query);
    }
  }

  const proposals = [];

  for (const group of groups.values()) {
    if (group.failure_count < minCount) {
      continue;
    }

    const proposal = buildProposal(group);
    proposals.push({ ...group, proposal });

    const gapResult = await dbQuery(
      `insert into retrieval_gaps (gap_key, gap_type, capability_name, example_queries, frequency, failure_count, proposal_json, status, updated_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, 'proposed', now())
       on conflict (gap_key) do update set
         gap_type = excluded.gap_type,
         capability_name = excluded.capability_name,
         example_queries = excluded.example_queries,
         frequency = excluded.frequency,
         failure_count = excluded.failure_count,
         proposal_json = excluded.proposal_json,
         status = 'proposed',
         updated_at = now()
       returning id`,
      [
        group.gap_key,
        group.gap_type,
        group.capability_name,
        safeJson(group.example_queries),
        group.failure_count,
        group.failure_count,
        safeJson(proposal)
      ]
    );
    const gapId = gapResult.rows[0]?.id;
    if (gapId) {
      await dbQuery(
      `insert into retrieval_proposals (gap_id, capability_name, patch_json, test_json, status, updated_at)
         values ($1, $2, $3::jsonb, $4::jsonb, 'proposed', now())
         on conflict (gap_id, capability_name) do update set
           patch_json = excluded.patch_json,
           test_json = excluded.test_json,
           status = 'proposed',
           updated_at = now()`,
        [
          gapId,
          proposal.capability_name,
          safeJson(proposal),
          safeJson(proposal.suggested_tests ?? [])
        ]
      );
    }
  }

  return proposals;
}

export async function listRetrievalGaps({ status = null, limit = 50 } = {}) {
  await ensureTelemetrySchema();
  const where = [];
  const params = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(limit);
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const result = await dbQuery(
    `select id, gap_key, gap_type, capability_name, example_queries, frequency, failure_count,
            proposal_json, status, created_at, updated_at
     from retrieval_gaps
     ${clause}
     order by updated_at desc
     limit $${params.length}`,
    params
  );

  const proposals = await dbQuery(
    `select rp.id, rp.gap_id, rp.capability_name, rp.patch_json, rp.test_json, rp.status, rp.created_at, rp.updated_at, rp.applied_at
     from retrieval_proposals rp
     join retrieval_gaps rg on rg.id = rp.gap_id
     ${status ? `where rg.status = $1` : ''}
     order by rp.updated_at desc
     limit $${status ? 2 : 1}`,
    status ? [status, limit] : [limit]
  );

  const proposalMap = new Map();
  for (const row of proposals.rows) {
    if (!proposalMap.has(row.gap_id)) {
      proposalMap.set(row.gap_id, []);
    }
    proposalMap.get(row.gap_id).push({
      id: row.id,
      gapId: row.gap_id,
      capabilityName: row.capability_name,
      patchJson: row.patch_json,
      testJson: row.test_json,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      appliedAt: row.applied_at
    });
  }

  return result.rows.map((row) => ({
    id: row.id,
    gapKey: row.gap_key,
    gapType: row.gap_type,
    capabilityName: row.capability_name,
    exampleQueries: row.example_queries,
    frequency: Number(row.frequency),
    failureCount: Number(row.failure_count),
    proposal: row.proposal_json,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    proposals: proposalMap.get(row.id) ?? []
  }));
}

export async function getRetrievalGapById(gapId) {
  await ensureTelemetrySchema();
  const result = await dbQuery(
    `select id, gap_key, gap_type, capability_name, example_queries, frequency, failure_count,
            proposal_json, status, created_at, updated_at
     from retrieval_gaps
     where id = $1
     limit 1`,
    [gapId]
  );

  const gap = result.rows[0];
  if (!gap) return null;

  const proposals = await dbQuery(
    `select id, gap_id, capability_name, patch_json, test_json, status, created_at, updated_at, applied_at
     from retrieval_proposals
     where gap_id = $1
     order by updated_at desc`,
    [gapId]
  );

  return {
    id: gap.id,
    gapKey: gap.gap_key,
    gapType: gap.gap_type,
    capabilityName: gap.capability_name,
    exampleQueries: gap.example_queries,
    frequency: Number(gap.frequency),
    failureCount: Number(gap.failure_count),
    proposal: gap.proposal_json,
    status: gap.status,
    createdAt: gap.created_at,
    updatedAt: gap.updated_at,
    proposals: proposals.rows.map((row) => ({
      id: row.id,
      gapId: row.gap_id,
      capabilityName: row.capability_name,
      patchJson: row.patch_json,
      testJson: row.test_json,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      appliedAt: row.applied_at
    }))
  };
}

export async function proposeRetrievalGap(gapId, patchJson = null, testJson = null) {
  await ensureTelemetrySchema();
  const gap = await getRetrievalGapById(gapId);
  if (!gap) return null;

  const proposal = patchJson ?? gap.proposal ?? {};
  const tests = testJson ?? proposal.suggested_tests ?? [];
  await dbQuery(
    `insert into retrieval_proposals (gap_id, capability_name, patch_json, test_json, status, updated_at)
     values ($1, $2, $3::jsonb, $4::jsonb, 'proposed', now())
     on conflict (gap_id, capability_name) do update set
       patch_json = excluded.patch_json,
       test_json = excluded.test_json,
       status = 'proposed',
       updated_at = now()`,
    [gapId, gap.capabilityName, safeJson(proposal), safeJson(tests)]
  );

  await dbQuery(
    `update retrieval_gaps
     set proposal_json = $2::jsonb,
         status = 'proposed',
         updated_at = now()
     where id = $1`,
    [gapId, safeJson(proposal)]
  );

  return getRetrievalGapById(gapId);
}

export async function approveRetrievalGap(gapId) {
  await ensureTelemetrySchema();
  const gap = await getRetrievalGapById(gapId);
  if (!gap) return null;

  await dbQuery(
    `update retrieval_gaps
     set status = 'resolved',
         updated_at = now()
     where id = $1`,
    [gapId]
  );

  await dbQuery(
    `update retrieval_proposals
     set status = 'approved',
         applied_at = now(),
         updated_at = now()
     where gap_id = $1`,
    [gapId]
  );

  return getRetrievalGapById(gapId);
}
