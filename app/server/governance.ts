// Data360 governance API: mutations (create/edit/delete/approve), bulk upload, UC sync, lineage, DQ run trigger.
// Reads go through config/queries (analytics plugin); this file only holds writes and non-SQL Databricks APIs.
import type { Application, Request, Response } from 'express';
import { sql, getExecutionContext } from '@databricks/appkit';
import { z } from 'zod';

type SqlParam = ReturnType<typeof sql.string> | ReturnType<typeof sql.number> | ReturnType<typeof sql.boolean>;
interface QueryRunner {
  query: (q: string, p?: Record<string, SqlParam | null | undefined>) => Promise<unknown>;
}
interface JobHandle {
  runNow: (p?: Record<string, unknown>) => Promise<{ ok: true; data: { run_id?: number } } | { ok: false; status: number; message: string }>;
  getRun: (id: number) => Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }>;
}

const CAT = process.env.D360_CATALOG ?? '';
const PREFIX = process.env.D360_SCHEMA_PREFIX ?? 'd360';
// demo = persona switcher (one login acts as any role); users = role looked up in user_roles by the signed-in email
const AUTH_MODE: 'demo' | 'users' = process.env.D360_AUTH_MODE === 'users' ? 'users' : 'demo';
// changes on every deploy/restart; the client compares it to detect a stale bundle
const BUILD_ID = `${Date.now()}`;
const G = `${CAT}.${PREFIX}_governance`;

type Role = 'GROUP_DG' | 'STEWARD' | 'VIEWER';
interface Persona { role: Role; tenant: string | null; label: string }
export interface Tenant { code: string; name: string; type: string; intake_schema: string | null; intake_mode: string | null }

/** Demo personas, generated from the tenants table: Group DG, one steward per tenant, a viewer. */
function buildPersonas(list: Tenant[]): Record<string, Persona> {
  const out: Record<string, Persona> = { 'group-dg': { role: 'GROUP_DG', tenant: 'GDG', label: 'Group Data Governance' } };
  for (const t of list) if (t.code !== 'GDG') out[`${t.code.toLowerCase()}-steward`] = { role: 'STEWARD', tenant: t.code, label: `${t.name} steward` };
  out.viewer = { role: 'VIEWER', tenant: null, label: 'Read-only viewer' };
  return out;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Ctx extends Persona { key: string; actor: string; gf: Set<string> }

function canEdit(c: Ctx, owner: string) {
  if (c.role === 'GROUP_DG') return true;
  if (c.role === 'STEWARD') return c.tenant === owner;
  return false;
}
function assertEdit(c: Ctx, owner: string, what: string) {
  if (!canEdit(c, owner))
    throw new HttpError(403, `${c.label} cannot modify ${what} owned by ${owner}. Group Data Governance can edit everything; stewards can only edit their own tenant's content.`);
}

function rows(r: unknown): Record<string, unknown>[] {
  const res = r as { data?: Record<string, unknown>[] } | undefined;
  return res?.data ?? [];
}

// analytics.query parses JSON-looking STRING columns into objects; stringify them back before binding.
const s = (v: unknown) => sql.string(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean));

const elementSchema = z.object({
  de_id: z.string().trim().optional().default(''),
  name: z.string().trim().min(3),
  description: z.string().trim().min(5),
  status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Retired']).default('Draft'),
  cde_flag: z.coerce.boolean().default(false),
  subject_area: z.string().trim().min(1),
  data_domain: z.string().trim().min(1),
  data_subdomain: z.string().trim().min(1),
  defined_by: z.string().trim().min(2),
  de_type: z.enum(['Atomic', 'Derived']).default('Atomic'),
  parent_de_id: z.string().trim().optional().default(''),
  data_owner: z.string().trim().optional().default(''),
});

const RULE_TYPES = ['not_null_or_blank', 'regex', 'in_reference', 'unique', 'range', 'sql_expr'] as const;
const ruleSchema = z.object({
  rule_id: z.string().trim().optional().default(''),
  name: z.string().trim().min(3),
  status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Retired']).default('Draft'),
  dq_dimension: z.enum(['Completeness', 'Validity', 'Uniqueness', 'Consistency', 'Timeliness', 'Accuracy']),
  description: z.string().trim().min(3),
  rule_type: z.enum(RULE_TYPES),
  rule_params: z.string().trim().default('{}'),
  applicable_to: z.string().trim().min(3),
  defined_by: z.string().trim().min(2),
  parent_rule_id: z.string().trim().optional().default(''),
  threshold_pct: z.coerce.number().min(0).max(100).default(98),
});

function validateRuleParams(type: string, raw: string) {
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'rule_params must be valid JSON');
  }
  const need: Record<string, string[]> = { regex: ['pattern'], in_reference: ['ref_set'], sql_expr: ['expr'] };
  for (const k of need[type] ?? []) if (!p[k]) throw new HttpError(400, `rule_type ${type} requires "${k}" in rule_params`);
  if (type === 'regex') {
    try {
      new RegExp(String(p.pattern));
    } catch {
      throw new HttpError(400, 'pattern is not a valid regular expression');
    }
  }
  if (type === 'sql_expr' && /;|\b(drop|delete|insert|update|merge|alter|grant)\b/i.test(String(p.expr)))
    throw new HttpError(400, 'sql_expr must be a boolean expression, not a statement');
  return JSON.stringify(p);
}

export function registerGovernanceRoutes(app: Application, db: QueryRunner, dqJob: () => JobHandle | null) {
  if (!CAT) throw new Error('D360_CATALOG is not set (see app/app.yaml; scripts/configure_app.py writes it per bundle target)');
  const q = (stmt: string, p?: Record<string, SqlParam>) => db.query(stmt, p);

  // tenants + user roles are read from the registry and cached briefly (onboarding a BU needs no redeploy)
  let tenantCache: { at: number; list: Tenant[] } | null = null;
  async function tenants(): Promise<Tenant[]> {
    if (tenantCache && Date.now() - tenantCache.at < 60_000) return tenantCache.list;
    const list = rows(await q(`SELECT tenant_code, tenant_name, tenant_type, intake_schema, intake_mode FROM ${G}.tenants ORDER BY tenant_type DESC, tenant_code`)).map((r) => ({
      code: String(r.tenant_code), name: String(r.tenant_name ?? r.tenant_code), type: String(r.tenant_type ?? ''),
      intake_schema: r.intake_schema ? String(r.intake_schema) : null, intake_mode: r.intake_mode ? String(r.intake_mode) : null,
    }));
    tenantCache = { at: Date.now(), list };
    return list;
  }
  let roleCache: { at: number; map: Map<string, { role: Role; tenant: string | null }> } | null = null;
  async function userRole(email: string) {
    if (!roleCache || Date.now() - roleCache.at > 60_000) {
      const rank: Record<string, number> = { GROUP_DG: 0, STEWARD: 1, VIEWER: 2 };
      const map = new Map<string, { role: Role; tenant: string | null }>();
      const list = rows(await q(`SELECT lower(principal) AS p, role, tenant_code FROM ${G}.user_roles WHERE principal NOT LIKE 'persona:%'`));
      list.sort((a, b) => (rank[String(a.role)] ?? 9) - (rank[String(b.role)] ?? 9));
      for (const r of list) if (!map.has(String(r.p))) map.set(String(r.p), { role: String(r.role) as Role, tenant: r.tenant_code ? String(r.tenant_code) : null });
      roleCache = { at: Date.now(), map };
    }
    return roleCache.map.get(email.toLowerCase()) ?? { role: 'VIEWER' as Role, tenant: null };
  }
  async function ctx(req: Request): Promise<Ctx> {
    const list = await tenants();
    const gf = new Set(list.filter((t) => t.type === 'GROUP_FUNCTION').map((t) => t.code));
    const actor = String(req.header('x-forwarded-email') ?? req.header('x-forwarded-user') ?? 'local-dev');
    if (AUTH_MODE === 'users') {
      const r = await userRole(actor);
      const tn = list.find((t) => t.code === r.tenant)?.name ?? r.tenant;
      const label = r.role === 'GROUP_DG' ? 'Group Data Governance' : r.role === 'STEWARD' ? `${tn} steward` : 'Read-only viewer';
      return { key: `${r.role.toLowerCase()}${r.tenant ? `-${r.tenant.toLowerCase()}` : ''}`, ...r, label, actor, gf };
    }
    const personas = buildPersonas(list);
    const key = String(req.header('x-d360-persona') ?? 'group-dg');
    const persona = personas[key] ?? personas['group-dg'];
    return { key: personas[key] ? key : 'group-dg', ...persona, actor, gf };
  }

  async function audit(c: Ctx, action: string, type: string, id: string, details: unknown) {
    await q(`INSERT INTO ${G}.audit_log VALUES (current_timestamp(), :actor, :persona, :action, :type, :id, :details)`, {
      actor: s(c.actor), persona: s(`persona:${c.key}`), action: s(action), type: s(type), id: s(id), details: s(JSON.stringify(details)),
    });
  }

  async function nextId(table: 'data_elements' | 'dq_rules', tenant: string) {
    const col = table === 'data_elements' ? 'de_id' : 'rule_id';
    const prefix = table === 'data_elements' ? `${tenant}_` : `${tenant}_DQ_`;
    const r = rows(await q(
      `SELECT coalesce(max(try_cast(regexp_extract(${col}, '([0-9]+)$', 1) AS INT)), 0) + 1 AS n FROM ${G}.${table} WHERE ${col} LIKE :p`,
      { p: s(`${prefix}%`) },
    ));
    return `${prefix}${String(Number(r[0]?.n ?? 1)).padStart(5, '0')}`;
  }

  // Status rules: BU stewards' changes always go to Group for approval; only Group DG can set Approved on others' behalf.
  function effectiveStatus(c: Ctx, owner: string, requested: string) {
    if (c.role === 'GROUP_DG') return requested;
    if (!c.gf.has(owner)) return requested === 'Draft' ? 'Draft' : 'Pending Approval';
    return requested; // Group function stewards approve their own function's content
  }

  const wrap = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 500;
      const message = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (e as Error).message;
      if (status === 500) console.error(e);
      res.status(status).json({ error: message });
    }
  };

  app.get('/api/d360/me', wrap(async (req, res) => {
    const c = await ctx(req);
    const list = await tenants();
    const h = process.env.DATABRICKS_HOST ?? '';
    const host = h ? (h.startsWith('http') ? h : `https://${h}`).replace(/\/$/, '') : '';
    res.json({
      actor: c.actor, persona: c.key, role: c.role, tenant: c.tenant, label: c.label, authMode: AUTH_MODE,
      personas: AUTH_MODE === 'demo' ? buildPersonas(list) : {}, tenants: list, catalog: CAT, schema: `${PREFIX}_governance`, host, build: BUILD_ID,
    });
  }));

  // ---------------- data elements ----------------
  async function upsertElement(c: Ctx, body: unknown, existingId?: string) {
    const d = elementSchema.parse(body);
    if (c.role === 'STEWARD') d.defined_by = c.tenant!; // stewards always create for their own tenant
    if (existingId) {
      const cur = rows(await q(`SELECT * FROM ${G}.data_elements WHERE de_id = :id`, { id: s(existingId) }))[0];
      if (!cur) throw new HttpError(404, `Data element ${existingId} not found`);
      assertEdit(c, String(cur.defined_by), `data element ${existingId}`);
      d.defined_by = String(cur.defined_by);
      const status = effectiveStatus(c, d.defined_by, d.status);
      await q(
        `UPDATE ${G}.data_elements SET name = :name, description = :description, status = :status, cde_flag = :cde, subject_area = :sa,
           data_domain = :dd, data_subdomain = :sd, de_type = :dt, parent_de_id = nullif(:parent, ''), data_owner = nullif(:owner, ''),
           version = version + 1, updated_by = :actor, updated_at = current_timestamp() WHERE de_id = :id`,
        { name: s(d.name), description: s(d.description), status: s(status), cde: sql.boolean(d.cde_flag), sa: s(d.subject_area), dd: s(d.data_domain),
          sd: s(d.data_subdomain), dt: s(d.de_type), parent: s(d.parent_de_id), owner: s(d.data_owner), actor: s(c.actor), id: s(existingId) },
      );
      await audit(c, 'UPDATE', 'DATA_ELEMENT', existingId, { before: cur, after: { ...d, status } });
      return { de_id: existingId, status };
    }
    assertEdit(c, d.defined_by, 'a data element');
    const id = d.de_id || (await nextId('data_elements', d.defined_by));
    const dup = rows(await q(`SELECT 1 FROM ${G}.data_elements WHERE de_id = :id`, { id: s(id) }));
    if (dup.length) throw new HttpError(409, `Data element ${id} already exists`);
    const status = effectiveStatus(c, d.defined_by, d.status);
    await q(
      `INSERT INTO ${G}.data_elements VALUES (:id, :name, :description, :status, :cde, :sa, :dd, :sd, :by, :dt, nullif(:parent, ''), nullif(:owner, ''), 1,
         current_timestamp(), :actor, current_timestamp())`,
      { id: s(id), name: s(d.name), description: s(d.description), status: s(status), cde: sql.boolean(d.cde_flag), sa: s(d.subject_area),
        dd: s(d.data_domain), sd: s(d.data_subdomain), by: s(d.defined_by), dt: s(d.de_type), parent: s(d.parent_de_id), owner: s(d.data_owner), actor: s(c.actor) },
    );
    await audit(c, 'CREATE', 'DATA_ELEMENT', id, { ...d, status });
    return { de_id: id, status };
  }

  app.post('/api/d360/elements', wrap(async (req, res) => {
    res.status(201).json(await upsertElement(await ctx(req), req.body));
  }));
  app.put('/api/d360/elements/:id', wrap(async (req, res) => {
    res.json(await upsertElement(await ctx(req), req.body, String(req.params.id)));
  }));
  app.delete('/api/d360/elements/:id', wrap(async (req, res) => {
    const c = await ctx(req);
    const id = String(req.params.id);
    const cur = rows(await q(`SELECT * FROM ${G}.data_elements WHERE de_id = :id`, { id: s(id) }))[0];
    if (!cur) throw new HttpError(404, `Data element ${id} not found`);
    assertEdit(c, String(cur.defined_by), `data element ${id}`);
    const attached = rows(await q(
      `SELECT rule_id FROM ${G}.dq_rules WHERE array_contains(transform(split(applicable_to, ','), x -> trim(x)), :id)`, { id: s(id) }));
    if (attached.length)
      throw new HttpError(409, `${id} still has ${attached.length} rule(s) attached (${attached.map((r) => r.rule_id).join(', ')}). Retire or re-point them first, or set the element to Retired.`);
    await q(`DELETE FROM ${G}.cde_mapping WHERE de_id = :id`, { id: s(id) });
    await q(`DELETE FROM ${G}.data_elements WHERE de_id = :id`, { id: s(id) });
    await audit(c, 'DELETE', 'DATA_ELEMENT', id, { before: cur });
    res.json({ deleted: id });
  }));

  // ---------------- DQ rules ----------------
  async function upsertRule(c: Ctx, body: unknown, existingId?: string) {
    const r = ruleSchema.parse(body);
    if (c.role === 'STEWARD') r.defined_by = c.tenant!;
    r.rule_params = validateRuleParams(r.rule_type, r.rule_params);
    const des = r.applicable_to.split(',').map((x) => x.trim()).filter(Boolean);
    const known = rows(await q(`SELECT de_id FROM ${G}.data_elements WHERE array_contains(split(:ids, ','), de_id)`, { ids: s(des.join(',')) }));
    const missing = des.filter((d) => !known.some((k) => k.de_id === d));
    if (missing.length) throw new HttpError(400, `Unknown data element(s) in Applicable To: ${missing.join(', ')}`);
    if (r.parent_rule_id) {
      const parent = rows(await q(`SELECT rule_id FROM ${G}.dq_rules WHERE rule_id = :p`, { p: s(r.parent_rule_id) }));
      if (!parent.length) throw new HttpError(400, `Parent rule ${r.parent_rule_id} does not exist`);
    }
    const params = {
      name: s(r.name), dim: s(r.dq_dimension), description: s(r.description), type: s(r.rule_type), params: s(r.rule_params),
      applies: s(des.join(',')), parent: s(r.parent_rule_id), thr: sql.number(r.threshold_pct), actor: s(c.actor),
    };
    if (existingId) {
      const cur = rows(await q(`SELECT * FROM ${G}.dq_rules WHERE rule_id = :id`, { id: s(existingId) }))[0];
      if (!cur) throw new HttpError(404, `Rule ${existingId} not found`);
      assertEdit(c, String(cur.defined_by), `rule ${existingId}`);
      const status = effectiveStatus(c, String(cur.defined_by), r.status);
      await q(
        `UPDATE ${G}.dq_rules SET name = :name, status = :status, dq_dimension = :dim, description = :description, rule_type = :type,
           rule_params = :params, applicable_to = :applies, parent_rule_id = nullif(:parent, ''), threshold_pct = :thr,
           version = version + 1, updated_by = :actor, updated_at = current_timestamp() WHERE rule_id = :id`,
        { ...params, status: s(status), id: s(existingId) },
      );
      await audit(c, 'UPDATE', 'DQ_RULE', existingId, { before: cur, after: { ...r, status } });
      return { rule_id: existingId, status };
    }
    assertEdit(c, r.defined_by, 'a rule');
    const id = r.rule_id || (await nextId('dq_rules', r.defined_by));
    if (rows(await q(`SELECT 1 FROM ${G}.dq_rules WHERE rule_id = :id`, { id: s(id) })).length) throw new HttpError(409, `Rule ${id} already exists`);
    const status = effectiveStatus(c, r.defined_by, r.status);
    await q(
      `INSERT INTO ${G}.dq_rules VALUES (:id, :name, :status, :dim, :description, :type, :params, :applies, :by, nullif(:parent, ''), :thr, 1,
         current_timestamp(), :actor, current_timestamp())`,
      { ...params, id: s(id), status: s(status), by: s(r.defined_by) },
    );
    await audit(c, 'CREATE', 'DQ_RULE', id, { ...r, status });
    return { rule_id: id, status };
  }

  app.post('/api/d360/rules', wrap(async (req, res) => {
    res.status(201).json(await upsertRule(await ctx(req), req.body));
  }));
  app.put('/api/d360/rules/:id', wrap(async (req, res) => {
    res.json(await upsertRule(await ctx(req), req.body, String(req.params.id)));
  }));
  app.delete('/api/d360/rules/:id', wrap(async (req, res) => {
    const c = await ctx(req);
    const id = String(req.params.id);
    const cur = rows(await q(`SELECT * FROM ${G}.dq_rules WHERE rule_id = :id`, { id: s(id) }))[0];
    if (!cur) throw new HttpError(404, `Rule ${id} not found`);
    assertEdit(c, String(cur.defined_by), `rule ${id}`);
    const children = rows(await q(`SELECT rule_id FROM ${G}.dq_rules WHERE parent_rule_id = :id`, { id: s(id) }));
    if (children.length)
      throw new HttpError(409, `${id} is customised by ${children.map((x) => x.rule_id).join(', ')}. Delete or re-parent the BU overrides first.`);
    await q(`DELETE FROM ${G}.dq_rules WHERE rule_id = :id`, { id: s(id) });
    await audit(c, 'DELETE', 'DQ_RULE', id, { before: cur });
    res.json({ deleted: id });
  }));

  // ---------------- approval workflow ----------------
  app.post('/api/d360/approve', wrap(async (req, res) => {
    const c = await ctx(req);
    const b = z.object({ object_type: z.enum(['DATA_ELEMENT', 'DQ_RULE']), object_id: z.string(), decision: z.enum(['Approved', 'Rejected']), comment: z.string().optional().default('') }).parse(req.body);
    const table = b.object_type === 'DATA_ELEMENT' ? 'data_elements' : 'dq_rules';
    const col = b.object_type === 'DATA_ELEMENT' ? 'de_id' : 'rule_id';
    const cur = rows(await q(`SELECT defined_by, status FROM ${G}.${table} WHERE ${col} = :id`, { id: s(b.object_id) }))[0];
    if (!cur) throw new HttpError(404, `${b.object_id} not found`);
    const owner = String(cur.defined_by);
    const allowed = c.role === 'GROUP_DG' || (c.role === 'STEWARD' && c.gf.has(c.tenant!) && c.gf.has(owner) && c.tenant === owner);
    if (!allowed) throw new HttpError(403, `${c.label} cannot approve. BU-defined content is approved by Group Data Governance (separation of duties).`);
    await q(`UPDATE ${G}.${table} SET status = :st, updated_by = :actor, updated_at = current_timestamp() WHERE ${col} = :id`, {
      st: s(b.decision), actor: s(c.actor), id: s(b.object_id) });
    await audit(c, b.decision === 'Approved' ? 'APPROVE' : 'REJECT', b.object_type, b.object_id, { from: cur.status, comment: b.comment });
    res.json({ object_id: b.object_id, status: b.decision });
  }));

  // ---------------- CDE -> physical mapping + UC sync ----------------
  app.post('/api/d360/mappings', wrap(async (req, res) => {
    const c = await ctx(req);
    const m = z.object({ de_id: z.string(), tenant_code: z.string(), table_fqn: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/), column_name: z.string().regex(/^\w+$/), source_system: z.string().optional().default('') }).parse(req.body);
    assertEdit(c, m.tenant_code, `mappings for ${m.tenant_code}`);
    const cols = rows(await q(
      `SELECT column_name FROM ${CAT}.information_schema.columns WHERE table_schema = :sch AND table_name = :tbl AND column_name = :col`,
      { sch: s(m.table_fqn.split('.')[1]), tbl: s(m.table_fqn.split('.')[2]), col: s(m.column_name) }));
    if (!cols.length) throw new HttpError(400, `Column ${m.table_fqn}.${m.column_name} not found in Unity Catalog`);
    await q(`DELETE FROM ${G}.cde_mapping WHERE de_id = :de AND tenant_code = :t AND table_fqn = :tbl AND column_name = :col`,
      { de: s(m.de_id), t: s(m.tenant_code), tbl: s(m.table_fqn), col: s(m.column_name) });
    await q(`INSERT INTO ${G}.cde_mapping VALUES (:de, :t, :tbl, :col, nullif(:src, ''))`,
      { de: s(m.de_id), t: s(m.tenant_code), tbl: s(m.table_fqn), col: s(m.column_name), src: s(m.source_system) });
    await audit(c, 'MAP', 'DATA_ELEMENT', m.de_id, m);
    res.status(201).json(m);
  }));
  app.delete('/api/d360/mappings', wrap(async (req, res) => {
    const c = await ctx(req);
    const m = z.object({ de_id: z.string(), tenant_code: z.string(), table_fqn: z.string(), column_name: z.string() }).parse(req.body);
    assertEdit(c, m.tenant_code, `mappings for ${m.tenant_code}`);
    await q(`DELETE FROM ${G}.cde_mapping WHERE de_id = :de AND tenant_code = :t AND table_fqn = :tbl AND column_name = :col`,
      { de: s(m.de_id), t: s(m.tenant_code), tbl: s(m.table_fqn), col: s(m.column_name) });
    await audit(c, 'UNMAP', 'DATA_ELEMENT', m.de_id, m);
    res.json({ deleted: m });
  }));

  // Push business metadata into Unity Catalog: column comment + tags on every mapped physical column.
  app.post('/api/d360/sync-uc/:id', wrap(async (req, res) => {
    const c = await ctx(req);
    if (c.role === 'VIEWER') throw new HttpError(403, 'Viewers cannot sync metadata');
    const id = String(req.params.id);
    const de = rows(await q(`SELECT * FROM ${G}.data_elements WHERE de_id = :id`, { id: s(id) }))[0];
    if (!de) throw new HttpError(404, `${id} not found`);
    const maps = rows(await q(`SELECT * FROM ${G}.cde_mapping WHERE de_id = :id`, { id: s(id) }));
    const done: string[] = [];
    const ident = (x: string) => x.split('.').map((p) => `\`${p.replace(/`/g, '')}\``).join('.');
    for (const m of maps) {
      if (c.role === 'STEWARD' && c.tenant !== m.tenant_code && c.tenant !== de.defined_by) continue;
      const tbl = ident(String(m.table_fqn));
      const col = `\`${String(m.column_name).replace(/`/g, '')}\``;
      await q(`COMMENT ON COLUMN ${tbl}.${col} IS :c`, { c: s(`[${id}] ${de.name}: ${de.description}`) });
      const tags = { d360_de_id: id, d360_cde: String(de.cde_flag), d360_domain: String(de.data_domain ?? ''), d360_subdomain: String(de.data_subdomain ?? ''), d360_owner: String(de.defined_by) };
      const kv = Object.entries(tags).map(([k, v]) => `'${k}' = '${v.replace(/'/g, '')}'`).join(', ');
      await q(`ALTER TABLE ${tbl} ALTER COLUMN ${col} SET TAGS (${kv})`);
      done.push(`${m.table_fqn}.${m.column_name}`);
    }
    await audit(c, 'SYNC_UC', 'DATA_ELEMENT', id, { columns: done });
    res.json({ synced: done });
  }));

  // UC lineage for a mapped column: walk column lineage upstream (and table lineage for context).
  app.get('/api/d360/lineage', wrap(async (req, res) => {
    const table = String(req.query.table ?? '');
    const column = String(req.query.column ?? '');
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(table)) throw new HttpError(400, 'table must be catalog.schema.table');
    const client = getExecutionContext().client;
    const call = async (path: string, query: Record<string, string | boolean>) =>
      client.apiClient.request({ path, method: 'GET', query, headers: new Headers({ Accept: 'application/json' }), raw: false }) as Promise<Record<string, unknown>>;
    type Node = { id: string; table: string; column: string | null; depth: number };
    const nodes: Node[] = [{ id: `${table}.${column}`, table, column: column || null, depth: 0 }];
    const edges: { from: string; to: string }[] = [];
    const seen = new Set(nodes.map((n) => n.id));
    let frontier = [...nodes];
    for (let depth = 1; depth <= 4 && frontier.length; depth++) {
      const next: Node[] = [];
      for (const n of frontier) {
        if (!n.column) continue;
        const r = await call('/api/2.0/lineage-tracking/column-lineage', { table_name: n.table, column_name: n.column });
        for (const u of (r.upstream_cols as Array<Record<string, string>> | undefined) ?? []) {
          const t = `${u.catalog_name}.${u.schema_name}.${u.table_name}`;
          const id = `${t}.${u.name}`;
          edges.push({ from: id, to: n.id });
          if (!seen.has(id)) {
            seen.add(id);
            const node = { id, table: t, column: u.name, depth };
            nodes.push(node);
            next.push(node);
          }
        }
      }
      frontier = next;
    }
    const tl = await call('/api/2.0/lineage-tracking/table-lineage', { table_name: table, include_entity_lineage: true });
    const consumers = ((tl.downstreams as Array<Record<string, unknown>> | undefined) ?? []).flatMap((d) => {
      const out: string[] = [];
      const ti = d.tableInfo as Record<string, string> | undefined;
      if (ti?.name) out.push(`table ${ti.catalog_name}.${ti.schema_name}.${ti.name}`);
      for (const j of (d.jobInfos as Array<Record<string, unknown>> | undefined) ?? []) out.push(`job ${j.job_id}`);
      for (const nb of (d.notebookInfos as Array<Record<string, unknown>> | undefined) ?? []) out.push(`notebook ${nb.notebook_id}`);
      return out;
    });
    res.json({ nodes, edges, consumers: [...new Set(consumers)] });
  }));

  // Catalog-Explorer-style lineage graph: table nodes (with columns from UC), table edges, column edges for the focus column,
  // and non-table consumers (jobs / notebooks). Everything comes from Unity Catalog lineage + table metadata APIs.
  app.get('/api/d360/lineage-graph', wrap(async (req, res) => {
    const table = typeof req.query.table === 'string' ? req.query.table : '';
    const column = typeof req.query.column === 'string' ? req.query.column : '';
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(table)) throw new HttpError(400, 'table must be catalog.schema.table');
    const client = getExecutionContext().client;
    const call = async (path: string, query: Record<string, string | boolean> = {}) =>
      client.apiClient.request({ path, method: 'GET', query, headers: new Headers({ Accept: 'application/json' }), raw: false }) as Promise<Record<string, unknown>>;
    type TInfo = { catalog_name?: string; schema_name?: string; name?: string };
    type Rel = { tableInfo?: TInfo; jobInfos?: { job_id?: number }[]; notebookInfos?: { notebook_id?: number }[] };
    const fqn = (t: TInfo) => `${t.catalog_name}.${t.schema_name}.${t.name}`;

    const depth = new Map<string, number>([[table, 0]]);
    const tableEdges = new Set<string>();
    const entities = new Map<string, { id: string; kind: 'job' | 'notebook'; ref: number; depth: number }>();
    // upstream BFS (tables)
    let frontier = [table];
    for (let d = 1; d <= 4 && frontier.length; d++) {
      const next: string[] = [];
      const resps = await Promise.all(frontier.map(async (t) => ({ t, r: await call('/api/2.0/lineage-tracking/table-lineage', { table_name: t, include_entity_lineage: true }) })));
      for (const { t, r } of resps) {
        for (const u of (r.upstreams as Rel[] | undefined) ?? []) {
          if (!u.tableInfo?.name) continue;
          const id = fqn(u.tableInfo);
          tableEdges.add(`${id}>${t}`);
          if (!depth.has(id)) { depth.set(id, -d); next.push(id); }
        }
      }
      frontier = next;
    }
    // downstream BFS (tables + entities)
    frontier = [table];
    for (let d = 1; d <= 2 && frontier.length; d++) {
      const next: string[] = [];
      const resps = await Promise.all(frontier.map(async (t) => ({ t, r: await call('/api/2.0/lineage-tracking/table-lineage', { table_name: t, include_entity_lineage: true }) })));
      for (const { t, r } of resps) {
        for (const dn of (r.downstreams as Rel[] | undefined) ?? []) {
          if (dn.tableInfo?.name) {
            const id = fqn(dn.tableInfo);
            tableEdges.add(`${t}>${id}`);
            if (!depth.has(id)) { depth.set(id, d); next.push(id); }
          }
          for (const j of dn.jobInfos ?? []) {
            const id = `job:${j.job_id}`;
            tableEdges.add(`${t}>${id}`);
            if (!entities.has(id)) entities.set(id, { id, kind: 'job', ref: Number(j.job_id), depth: d });
          }
          for (const n of dn.notebookInfos ?? []) {
            const id = `notebook:${n.notebook_id}`;
            tableEdges.add(`${t}>${id}`);
            if (!entities.has(id)) entities.set(id, { id, kind: 'notebook', ref: Number(n.notebook_id), depth: d });
          }
        }
      }
      frontier = next;
    }
    // column lineage for the focus column, both directions
    const colEdges = new Set<string>();
    const colKey = (t: string, c: string) => `${t}::${c}`;
    if (column) {
      const walk = async (dir: 'upstream_cols' | 'downstream_cols', max: number) => {
        let f = [colKey(table, column)];
        const seen = new Set(f);
        for (let d = 1; d <= max && f.length; d++) {
          const next: string[] = [];
          const resps = await Promise.all(f.map(async (k) => {
            const [t, c] = k.split('::');
            return { k, r: await call('/api/2.0/lineage-tracking/column-lineage', { table_name: t, column_name: c }) };
          }));
          for (const { k, r } of resps) {
            for (const u of (r[dir] as Array<Record<string, string>> | undefined) ?? []) {
              const ot = `${u.catalog_name}.${u.schema_name}.${u.table_name}`;
              const ok = colKey(ot, u.name);
              colEdges.add(dir === 'upstream_cols' ? `${ok}>${k}` : `${k}>${ok}`);
              if (!depth.has(ot)) depth.set(ot, dir === 'upstream_cols' ? -d : d);
              if (!seen.has(ok)) { seen.add(ok); next.push(ok); }
            }
          }
          f = next;
        }
      };
      await Promise.all([walk('upstream_cols', 4), walk('downstream_cols', 2)]);
    }
    // table metadata from UC
    const tables = await Promise.all([...depth.entries()].map(async ([id, d]) => {
      try {
        const t = await call(`/api/2.1/unity-catalog/tables/${encodeURIComponent(id)}`);
        const cols = ((t.columns as Array<Record<string, unknown>> | undefined) ?? []).map((c) => ({
          name: typeof c.name === 'string' ? c.name : '', type: typeof c.type_text === 'string' ? c.type_text : '', comment: typeof c.comment === 'string' ? c.comment : '',
        }));
        return { id, kind: 'table' as const, depth: d, comment: typeof t.comment === 'string' ? t.comment : '', owner: typeof t.owner === 'string' ? t.owner : '', columns: cols };
      } catch {
        return { id, kind: 'table' as const, depth: d, comment: 'No access to table metadata', owner: '', columns: [] };
      }
    }));
    const ents = await Promise.all([...entities.values()].map(async (e) => {
      let name = `${e.kind} ${e.ref}`;
      if (e.kind === 'job') {
        try {
          const j = await call('/api/2.2/jobs/get', { job_id: String(e.ref) });
          const st = j.settings as { name?: string } | undefined;
          if (st?.name) name = st.name;
        } catch { /* keep id */ }
      }
      return { ...e, name };
    }));
    const split = (k: string) => { const [a, b] = k.split('>'); return { from: a, to: b }; };
    res.json({
      focus: { table, column },
      tables,
      entities: ents,
      tableEdges: [...tableEdges].map(split),
      columnEdges: [...colEdges].map((k) => {
        const { from, to } = split(k);
        const [ft, fc] = from.split('::');
        const [tt, tc] = to.split('::');
        return { fromTable: ft, fromColumn: fc, toTable: tt, toColumn: tc };
      }),
    });
  }));

  // ---------------- reference data ----------------
  app.post('/api/d360/reference', wrap(async (req, res) => {
    const c = await ctx(req);
    const r = z.object({ ref_set: z.string().trim().min(2).transform((x) => x.toUpperCase()), code: z.string().trim().min(1), label: z.string().trim().min(1), tenant_code: z.string().default('GROUP'), active: z.coerce.boolean().default(true) }).parse(req.body);
    if (c.role === 'STEWARD') r.tenant_code = c.tenant!;
    if (r.tenant_code === 'GROUP' && c.role !== 'GROUP_DG') throw new HttpError(403, 'Only Group Data Governance maintains Group reference data; stewards can add BU extensions');
    if (c.role === 'VIEWER') throw new HttpError(403, 'Viewers cannot edit reference data');
    await q(
      `MERGE INTO ${G}.reference_data t USING (SELECT :rs AS ref_set, :code AS code, :t AS tenant_code) s
       ON t.ref_set = s.ref_set AND t.code = s.code AND t.tenant_code = s.tenant_code
       WHEN MATCHED THEN UPDATE SET label = :label, active = :active, updated_by = :actor, updated_at = current_timestamp()
       WHEN NOT MATCHED THEN INSERT (ref_set, code, label, tenant_code, active, updated_by, updated_at) VALUES (:rs, :code, :label, :t, :active, :actor, current_timestamp())`,
      { rs: s(r.ref_set), code: s(r.code), t: s(r.tenant_code), label: s(r.label), active: sql.boolean(r.active), actor: s(c.actor) });
    await audit(c, 'UPSERT', 'REFERENCE_DATA', `${r.ref_set}/${r.code}`, r);
    res.status(201).json(r);
  }));
  app.delete('/api/d360/reference', wrap(async (req, res) => {
    const c = await ctx(req);
    const r = z.object({ ref_set: z.string(), code: z.string(), tenant_code: z.string() }).parse(req.body);
    if (r.tenant_code === 'GROUP' ? c.role !== 'GROUP_DG' : !canEdit(c, r.tenant_code)) throw new HttpError(403, `${c.label} cannot delete this code`);
    await q(`DELETE FROM ${G}.reference_data WHERE ref_set = :rs AND code = :code AND tenant_code = :t`, { rs: s(r.ref_set), code: s(r.code), t: s(r.tenant_code) });
    await audit(c, 'DELETE', 'REFERENCE_DATA', `${r.ref_set}/${r.code}`, r);
    res.json({ deleted: r });
  }));

  // ---------------- bulk upload (standard BU template) ----------------
  // Group DG uploads go straight into the registry. Steward uploads land in the BU's intake table (shared to Group via Delta Sharing)
  // and wait for Group review.
  app.post('/api/d360/bulk', wrap(async (req, res) => {
    const c = await ctx(req);
    const b = z.object({ object_type: z.enum(['DATA_ELEMENT', 'DQ_RULE']), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500), dry_run: z.boolean().default(true) }).parse(req.body);
    if (c.role === 'VIEWER') throw new HttpError(403, 'Viewers cannot upload');
    const report: { row: number; id: string; ok: boolean; errors: string[] }[] = [];
    const parsed: Record<string, unknown>[] = [];
    const norm = (r: Record<string, unknown>) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) o[k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = typeof v === 'string' ? v.trim() : v;
      // accept the AIA column labels from the email sample
      const alias: Record<string, string> = { data_sub_domain_l2: 'data_subdomain', data_sub_domain: 'data_subdomain', de_id: 'de_id', cde_flag: 'cde_flag', defined_by: 'defined_by', de_type: 'de_type', rule_definition: 'rule_params', definition: 'rule_params', dq_dimensions: 'dq_dimension', threshold: 'threshold_pct' };
      for (const [a, t] of Object.entries(alias)) if (o[a] !== undefined && o[t] === undefined) o[t] = o[a];
      if (typeof o.cde_flag === 'string') o.cde_flag = ['true', 'yes', 'y', '1'].includes(String(o.cde_flag).toLowerCase());
      const tenants: Record<string, string> = { 'group operations': 'GO', 'group compliance': 'GC', 'group investments': 'GI', 'group data governance': 'GDG', 'bu vietnam': 'VN', vietnam: 'VN', 'bu philippines': 'PH', philippines: 'PH', 'bu malaysia': 'MY', malaysia: 'MY' };
      if (typeof o.defined_by === 'string') o.defined_by = tenants[o.defined_by.toLowerCase()] ?? o.defined_by.toUpperCase();
      if (c.role === 'STEWARD') o.defined_by = c.tenant;
      return o;
    };
    const existing = new Set(rows(await q(b.object_type === 'DATA_ELEMENT' ? `SELECT de_id AS id FROM ${G}.data_elements` : `SELECT rule_id AS id FROM ${G}.dq_rules`)).map((r) => String(r.id)));
    const des = new Set(rows(await q(`SELECT de_id FROM ${G}.data_elements`)).map((r) => String(r.de_id)));
    const seenIds = new Set<string>();
    b.rows.forEach((raw, i) => {
      const o = norm(raw);
      const errors: string[] = [];
      const res2 = (b.object_type === 'DATA_ELEMENT' ? elementSchema : ruleSchema).safeParse(o);
      let id = String(o.de_id ?? o.rule_id ?? '');
      if (!res2.success) errors.push(...res2.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`));
      else {
        const v = res2.data as Record<string, unknown>;
        id = String(v.de_id ?? v.rule_id ?? '');
        if (!id) errors.push('ID is required in bulk upload');
        if (id && seenIds.has(id)) errors.push('duplicate ID within file');
        if (id && !id.startsWith(`${v.defined_by}_`)) errors.push(`ID must start with the owning tenant prefix ${v.defined_by}_`);
        if (b.object_type === 'DQ_RULE') {
          try {
            v.rule_params = validateRuleParams(String(v.rule_type), typeof v.rule_params === "object" ? JSON.stringify(v.rule_params) : String(v.rule_params));
          } catch (e) {
            errors.push((e as Error).message);
          }
          const unknown = String(v.applicable_to).split(',').map((x) => x.trim()).filter((x) => x && !des.has(x) && !seenIds.has(x));
          if (unknown.length) errors.push(`unknown data element(s): ${unknown.join(', ')}`);
        }
        if (!canEdit(c, String(v.defined_by))) errors.push(`you cannot load content owned by ${v.defined_by}`);
        v._exists = existing.has(id);
        parsed.push({ ...v, _row: i + 1 });
      }
      seenIds.add(id);
      report.push({ row: i + 1, id, ok: errors.length === 0, errors });
    });
    const okAll = report.every((r) => r.ok);
    if (b.dry_run || !okAll) {
      res.json({ dry_run: true, valid: okAll, report, would_update: parsed.filter((p) => p._exists).length, would_create: parsed.filter((p) => !p._exists).length });
      return;
    }
    const tenant = c.role === 'GROUP_DG' ? null : c.tenant!;
    const batchId = `${tenant ?? 'GDG'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    const bu = tenant ? (await tenants()).find((t) => t.code === tenant && t.type === 'BU') : undefined;
    if (bu) {
      if (!bu.intake_schema) throw new HttpError(400, `${bu.code} is not onboarded yet (no intake schema). Run the d360_onboard_bu job first.`);
      if (bu.intake_mode === 'DELTA_SHARE')
        throw new HttpError(400, `${bu.code} submits from its own workspace: its intake tables arrive read-only over Delta Sharing (${bu.intake_schema}). Load the standard template there; it appears under Approvals automatically.`);
      const tbl = `${bu.intake_schema}.${b.object_type === 'DATA_ELEMENT' ? 'intake_data_elements' : 'intake_dq_rules'}`;
      for (const p of parsed) {
        if (b.object_type === 'DATA_ELEMENT')
          await q(`INSERT INTO ${tbl} VALUES (:b, :actor, current_timestamp(), :id, :name, :descr, 'Pending Approval', :cde, :sa, :dd, :sd, :by, :dt, nullif(:parent, ''), nullif(:ptbl, ''), nullif(:pcol, ''))`,
            { b: s(batchId), actor: s(c.actor), id: s(p.de_id), name: s(p.name), descr: s(p.description), cde: sql.boolean(Boolean(p.cde_flag)), sa: s(p.subject_area), dd: s(p.data_domain), sd: s(p.data_subdomain), by: s(p.defined_by), dt: s(p.de_type), parent: s(p.parent_de_id), ptbl: s(b.rows[Number(p._row) - 1].physical_table ?? ''), pcol: s(b.rows[Number(p._row) - 1].physical_column ?? '') });
        else
          await q(`INSERT INTO ${tbl} VALUES (:b, :actor, current_timestamp(), :id, :name, 'Pending Approval', :dim, :descr, :by, :applies, nullif(:parent, ''), :type, :params, :thr)`,
            { b: s(batchId), actor: s(c.actor), id: s(p.rule_id), name: s(p.name), dim: s(p.dq_dimension), descr: s(p.description), by: s(p.defined_by), applies: s(p.applicable_to), parent: s(p.parent_rule_id), type: s(p.rule_type), params: s(p.rule_params), thr: sql.number(Number(p.threshold_pct)) });
      }
      await audit(c, 'BULK_SUBMIT', b.object_type, batchId, { rows: parsed.length, intake_table: tbl });
      res.json({ dry_run: false, batch_id: batchId, submitted_to: tbl, rows: parsed.length, routed: 'intake' });
      return;
    }
    // Group (or Group-function steward): write straight to the registry
    for (const p of parsed) {
      if (b.object_type === 'DATA_ELEMENT') await upsertElement(c, p, p._exists ? String(p.de_id) : undefined);
      else await upsertRule(c, p, p._exists ? String(p.rule_id) : undefined);
    }
    await audit(c, 'BULK_LOAD', b.object_type, batchId, { rows: parsed.length });
    res.json({ dry_run: false, batch_id: batchId, rows: parsed.length, routed: 'registry' });
  }));

  // Group review of a BU intake batch (received over Delta Sharing): approve merges into the registry.
  app.post('/api/d360/intake/:batch/decision', wrap(async (req, res) => {
    const c = await ctx(req);
    if (c.role !== 'GROUP_DG') throw new HttpError(403, 'Only Group Data Governance reviews BU submissions');
    const batch = String(req.params.batch);
    const b = z.object({ tenant_code: z.string(), decision: z.enum(['APPROVED', 'REJECTED']), object_ids: z.array(z.string()).optional(), comment: z.string().optional().default('') }).parse(req.body);
    const schema = (await tenants()).find((t) => t.code === b.tenant_code && t.intake_schema)?.intake_schema;
    if (!schema) throw new HttpError(400, `Unknown or not-onboarded BU ${b.tenant_code}`);
    const filt = b.object_ids?.length ? `AND array_contains(split(:ids, ','), %ID%)` : '';
    const ids = s((b.object_ids ?? []).join(','));
    const reviewed = new Set(rows(await q(`SELECT object_id FROM ${G}.submission_reviews WHERE batch_id = :b`, { b: s(batch) })).map((r) => String(r.object_id)));
    const deRows = rows(await q(`SELECT * FROM ${schema}.intake_data_elements WHERE batch_id = :b ${filt.replace('%ID%', 'de_id')}`, { b: s(batch), ...(filt ? { ids } : {}) })).filter((r) => !reviewed.has(String(r.de_id)));
    const ruRows = rows(await q(`SELECT * FROM ${schema}.intake_dq_rules WHERE batch_id = :b ${filt.replace('%ID%', 'rule_id')}`, { b: s(batch), ...(filt ? { ids } : {}) })).filter((r) => !reviewed.has(String(r.rule_id)));
    if (b.decision === 'APPROVED') {
      for (const d of deRows) {
        await q(
          `MERGE INTO ${G}.data_elements t USING (SELECT :id AS de_id) s ON t.de_id = s.de_id
           WHEN MATCHED THEN UPDATE SET name = :name, description = :descr, status = 'Approved', cde_flag = :cde, subject_area = :sa, data_domain = :dd,
             data_subdomain = :sd, de_type = :dt, parent_de_id = nullif(:parent, ''), version = t.version + 1, updated_by = :actor, updated_at = current_timestamp()
           WHEN NOT MATCHED THEN INSERT (de_id, name, description, status, cde_flag, subject_area, data_domain, data_subdomain, defined_by, de_type, parent_de_id, data_owner, version, created_at, updated_by, updated_at) VALUES (:id, :name, :descr, 'Approved', :cde, :sa, :dd, :sd, :by, :dt, nullif(:parent, ''), NULL, 1, current_timestamp(), :actor, current_timestamp())`,
          { id: s(d.de_id), name: s(d.name), descr: s(d.description), cde: sql.boolean(Boolean(d.cde_flag)), sa: s(d.subject_area), dd: s(d.data_domain), sd: s(d.data_subdomain), dt: s(d.de_type), parent: s(d.parent_de_id), by: s(d.defined_by), actor: s(c.actor) });
        if (d.physical_table && d.physical_column) {
          await q(`DELETE FROM ${G}.cde_mapping WHERE de_id = :de AND tenant_code = :t`, { de: s(d.de_id), t: s(b.tenant_code) });
          await q(`INSERT INTO ${G}.cde_mapping VALUES (:de, :t, :tbl, :col, NULL)`, { de: s(d.de_id), t: s(b.tenant_code), tbl: s(d.physical_table), col: s(d.physical_column) });
        }
      }
      for (const r of ruRows) {
        await q(
          `MERGE INTO ${G}.dq_rules t USING (SELECT :id AS rule_id) s ON t.rule_id = s.rule_id
           WHEN MATCHED THEN UPDATE SET name = :name, status = 'Approved', dq_dimension = :dim, description = :descr, rule_type = :type, rule_params = :params,
             applicable_to = :applies, parent_rule_id = nullif(:parent, ''), threshold_pct = :thr, version = t.version + 1, updated_by = :actor, updated_at = current_timestamp()
           WHEN NOT MATCHED THEN INSERT (rule_id, name, status, dq_dimension, description, rule_type, rule_params, applicable_to, defined_by, parent_rule_id, threshold_pct, version, created_at, updated_by, updated_at) VALUES (:id, :name, 'Approved', :dim, :descr, :type, :params, :applies, :by, nullif(:parent, ''), :thr, 1, current_timestamp(), :actor, current_timestamp())`,
          { id: s(r.rule_id), name: s(r.name), dim: s(r.dq_dimension), descr: s(r.description), type: s(r.rule_type), params: s(r.rule_params), applies: s(r.applicable_to), parent: s(r.parent_rule_id), thr: sql.number(Number(r.threshold_pct ?? 98)), by: s(r.defined_by), actor: s(c.actor) });
      }
    }
    for (const [type, list, col] of [['DATA_ELEMENT', deRows, 'de_id'], ['DQ_RULE', ruRows, 'rule_id']] as const) {
      for (const r of list)
        await q(`INSERT INTO ${G}.submission_reviews VALUES (:b, :t, :type, :id, :d, :actor, current_timestamp(), :c)`,
          { b: s(batch), t: s(b.tenant_code), type: s(type), id: s(r[col]), d: s(b.decision), actor: s(c.actor), c: s(b.comment) });
    }
    await audit(c, `INTAKE_${b.decision}`, 'BATCH', batch, { tenant: b.tenant_code, elements: deRows.length, rules: ruRows.length });
    res.json({ batch, decision: b.decision, elements: deRows.length, rules: ruRows.length });
  }));

  // ---------------- DQ execution (Lakeflow Job via jobs plugin) ----------------
  app.post('/api/d360/dq/run', wrap(async (req, res) => {
    const c = await ctx(req);
    if (c.role === 'VIEWER') throw new HttpError(403, 'Viewers cannot trigger DQ runs');
    const job = dqJob();
    if (!job) throw new HttpError(503, 'DQ job not configured (DATABRICKS_JOB_ID)');
    const tenant = c.role === 'STEWARD' && !c.gf.has(c.tenant!) ? c.tenant! : String(req.body?.tenant ?? 'ALL');
    const r = await job.runNow({ job_parameters: { period: String(req.body?.period ?? ''), triggered_by: `${c.actor} (${c.label})`, tenant } });
    if (!r.ok) throw new HttpError(r.status, r.message);
    await audit(c, 'RUN_DQ', 'JOB', String(r.data.run_id), { tenant });
    res.json({ run_id: r.data.run_id, tenant });
  }));
  app.get('/api/d360/dq/run/:id', wrap(async (req, res) => {
    const job = dqJob();
    if (!job) throw new HttpError(503, 'DQ job not configured');
    const r = await job.getRun(Number(req.params.id));
    if (!r.ok) throw new HttpError(r.status, r.message);
    const run = r.data as { state?: { life_cycle_state?: string; result_state?: string }; run_page_url?: string };
    res.json({ life_cycle_state: run.state?.life_cycle_state, result_state: run.state?.result_state, url: run.run_page_url });
  }));
}
