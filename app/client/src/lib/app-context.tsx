import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Role = 'GROUP_DG' | 'STEWARD' | 'VIEWER';
export interface Persona {
  role: Role;
  tenant: string | null;
  label: string;
}
/*
 * Tenants and demo personas come from the server (/api/d360/me, read from the tenants table), so onboarding a BU
 * needs no code change. These module-level registries are filled in place when /me loads; every page re-renders
 * then because the context value changes.
 */
export const PERSONAS: Record<string, Persona> = {};
export const GROUP_FUNCTIONS: string[] = [];
export const TENANT_NAMES: Record<string, string> = {};
/** Owner choices for elements / rules: every tenant. */
export const OWNER_OPTIONS: { value: string; label: string }[] = [];
/** Tenants that own physical data (mappings, results filters): everyone except Group Data Governance. */
export const DATA_TENANTS: string[] = [];
export interface TenantInfo { code: string; name: string; type: string; intake_schema: string | null; intake_mode: string | null }
function loadRegistry(tenants: TenantInfo[], personas: Record<string, Persona>) {
  const replace = <T,>(arr: T[], items: T[]) => arr.splice(0, arr.length, ...items);
  for (const k of Object.keys(PERSONAS)) delete PERSONAS[k];
  Object.assign(PERSONAS, personas);
  replace(GROUP_FUNCTIONS, tenants.filter((t) => t.type === 'GROUP_FUNCTION').map((t) => t.code));
  for (const k of Object.keys(TENANT_NAMES)) delete TENANT_NAMES[k];
  for (const t of tenants) TENANT_NAMES[t.code] = t.name;
  replace(OWNER_OPTIONS, tenants.map((t) => ({ value: t.code, label: `${t.code} · ${t.name}` })));
  replace(DATA_TENANTS, tenants.filter((t) => t.code !== 'GDG').map((t) => t.code));
}
const FALLBACK: Persona = { role: 'VIEWER', tenant: null, label: 'Loading…' };

interface Flash {
  kind: 'success' | 'error';
  text: string;
}
interface Ctx {
  personaKey: string;
  persona: Persona;
  setPersonaKey: (k: string) => void;
  /** '' = see everything; otherwise the BU tenant whose view is applied (Group content + own BU). */
  scope: string;
  /** bumps after every mutation so analytics queries re-run */
  v: number;
  refresh: () => void;
  actor: string;
  catalog: string;
  schema: string;
  host: string;
  authMode: 'demo' | 'users';
  tenants: TenantInfo[];
  stale: boolean;
  flash: Flash | null;
  setFlash: (f: Flash | null) => void;
  canEdit: (owner: string | null | undefined) => boolean;
  api: <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [personaKey, setPersonaKeyState] = useState<string>(() => localStorage.getItem('d360-persona') ?? 'group-dg');
  const [v, setV] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [me, setMe] = useState<{ actor: string; catalog: string; schema: string; host: string; authMode: 'demo' | 'users'; tenants: TenantInfo[]; self: Persona | null }>(
    { actor: '', catalog: '', schema: '', host: '', authMode: 'demo', tenants: [], self: null });
  // users mode: the server resolves the signed-in user's role; demo mode: the chosen persona
  const persona = me.authMode === 'users' ? me.self ?? FALLBACK : PERSONAS[personaKey] ?? PERSONAS['group-dg'] ?? FALLBACK;

  const setPersonaKey = useCallback((k: string) => {
    localStorage.setItem('d360-persona', k);
    setPersonaKeyState(k);
    setFlash(null);
  }, []);

  const api = useCallback(
    async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-d360-persona': personaKey },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `${res.status} ${res.statusText}`);
      return json as T;
    },
    [personaKey],
  );

  const [stale, setStale] = useState(false);
  const build = useRef<string | null>(null);
  useEffect(() => {
    api<{ actor: string; catalog: string; schema?: string; host?: string; build?: string; authMode?: 'demo' | 'users'; tenants?: TenantInfo[]; personas?: Record<string, Persona>; role: Role; tenant: string | null; label: string }>('/api/d360/me')
      .then((m) => {
        loadRegistry(m.tenants ?? [], m.personas ?? {});
        setMe({ actor: m.actor, catalog: m.catalog, schema: m.schema ?? '', host: m.host ?? '', authMode: m.authMode ?? 'demo', tenants: m.tenants ?? [], self: { role: m.role, tenant: m.tenant, label: m.label } });
        build.current ??= m.build ?? null;
      })
      .catch(() => undefined);
  }, [api]);
  // detect a redeploy while this tab is open: the old bundle may call queries with outdated parameters
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/d360/me')
        .then((r) => r.json() as Promise<{ build?: string }>)
        .then((m) => { if (build.current && m.build && m.build !== build.current) setStale(true); })
        .catch(() => undefined);
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.kind === 'error' ? 12000 : 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const value = useMemo<Ctx>(() => {
    const scope = persona.role === 'STEWARD' && persona.tenant && !GROUP_FUNCTIONS.includes(persona.tenant) ? persona.tenant : '';
    return {
      personaKey, persona, setPersonaKey, scope, v, refresh: () => setV((x) => x + 1), actor: me.actor, catalog: me.catalog, schema: me.schema, host: me.host, authMode: me.authMode, tenants: me.tenants, stale,
      flash, setFlash, api,
      canEdit: (owner) => persona.role === 'GROUP_DG' || (persona.role === 'STEWARD' && !!owner && owner === persona.tenant),
    };
  }, [personaKey, persona, setPersonaKey, v, me, flash, api, stale]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}

export const num = (x: unknown) => (x === null || x === undefined || x === '' ? null : Number(x));
export const pct = (x: unknown, d = 2) => {
  const n = num(x);
  return n === null ? '—' : `${n.toFixed(d)}%`;
};
export const int = (x: unknown) => {
  const n = num(x);
  return n === null ? '—' : n.toLocaleString();
};

export function useDebounced<T>(value: T, ms = 400): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

/** AppKit may hand back JSON-looking STRING columns already parsed; normalise to display text. */
export const asText = (x: unknown): string => (x === null || x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x));
