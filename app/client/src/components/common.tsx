import type { ReactNode } from 'react';
import {
  Alert, AlertDescription, AlertTitle, Badge, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Skeleton,
} from '@databricks/appkit-ui/react';
import { AlertCircle } from 'lucide-react';
import { num, TENANT_NAMES } from '../lib/app-context';

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? '—';
  const cls =
    s === 'Approved' || s === 'PASS' || s === 'APPROVED'
      ? 'bg-success text-success-foreground border-transparent'
      : s === 'Pending Approval' || s === 'PENDING'
        ? 'bg-warning text-warning-foreground border-transparent'
        : s === 'Rejected' || s === 'FAIL' || s === 'REJECTED'
          ? 'bg-destructive text-destructive-foreground border-transparent'
          : '';
  return (
    <Badge variant={cls ? 'default' : 'outline'} className={cls}>
      {s}
    </Badge>
  );
}

export function TenantBadge({ code }: { code: string | null | undefined }) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" title={TENANT_NAMES[code] ?? code}>
      {code}
    </Badge>
  );
}

export function CdeBadge({ on }: { on: unknown }) {
  return on === true || on === 'true' ? <Badge className="bg-primary text-primary-foreground">CDE</Badge> : null;
}

/** pass % with semantic colour vs threshold */
export function PassPct({ value, threshold }: { value: unknown; threshold?: unknown }) {
  const v = num(value);
  const t = num(threshold);
  if (v === null) return <span className="text-muted-foreground">not run</span>;
  const bad = t !== null ? v < t : v < 98;
  return (
    <span className={`tabular-nums font-medium ${bad ? 'text-destructive' : 'text-success'}`}>
      {v.toFixed(2)}%{t !== null && <span className="text-muted-foreground font-normal"> / {t}%</span>}
    </span>
  );
}

export function QueryState({ loading, error, empty, emptyText, children, rows = 4 }: {
  loading: boolean; error: string | null; empty?: boolean; emptyText?: string; children: ReactNode; rows?: number;
}) {
  if (loading)
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  if (error)
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Query failed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (empty)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>{emptyText ?? 'No rows match the current filters.'}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return <>{children}</>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function UcNote({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground border-l-2 border-primary pl-3 py-1 my-2">
      <span className="font-semibold text-foreground">Unity Catalog: </span>
      {children}
    </div>
  );
}
