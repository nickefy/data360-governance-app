import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import {
  Alert, AlertDescription, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@databricks/appkit-ui/react';
import { BookOpen, CheckCircle2, ClipboardCheck, Database, FileUp, Gauge, GitBranch, History, Library, ListChecks, ShieldCheck } from 'lucide-react';
import { AppProvider, GROUP_FUNCTIONS, PERSONAS, useApp } from './lib/app-context';
import { OverviewPage } from './pages/OverviewPage';
import { ElementsPage } from './pages/ElementsPage';
import { RulesPage } from './pages/RulesPage';
import { ResultsPage } from './pages/ResultsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { BulkUploadPage } from './pages/BulkUploadPage';
import { ReferencePage } from './pages/ReferencePage';
import { AuditPage } from './pages/AuditPage';
import { PlatformPage } from './pages/PlatformPage';
import { LineagePage } from './pages/LineagePage';

const NAV = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/elements', label: 'Data Elements', icon: Library },
  { to: '/lineage', label: 'Physical Lineage', icon: GitBranch },
  { to: '/rules', label: 'DQ Rules', icon: ListChecks },
  { to: '/results', label: 'Rule Results', icon: CheckCircle2 },
  { to: '/approvals', label: 'Approvals & BU Intake', icon: ClipboardCheck },
  { to: '/upload', label: 'Bulk Upload', icon: FileUp },
  { to: '/reference', label: 'Reference Data', icon: BookOpen },
  { to: '/audit', label: 'Audit Trail', icon: History },
  { to: '/platform', label: 'How it runs on Databricks', icon: Database },
];

function PersonaSwitcher() {
  const { personaKey, setPersonaKey, persona, actor, authMode } = useApp();
  if (authMode === 'users')
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Signed in</div>
        <div className="text-sm font-medium truncate" title={actor}>{actor || '…'}</div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{persona.role.replace('_', ' ')}</Badge>
          {persona.tenant && <Badge variant="secondary">{persona.tenant}</Badge>}
        </div>
        <div className="text-[11px] text-muted-foreground">{persona.label}. Roles are managed by Group Data Governance.</div>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Acting as (demo persona)</div>
      <Select value={personaKey} onValueChange={setPersonaKey}>
        <SelectTrigger className="w-full" aria-label="Persona">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERSONAS).map(([k, p]) => (
            <SelectItem key={k} value={k}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">{persona.role.replace('_', ' ')}</Badge>
        {persona.tenant && <Badge variant="secondary">{persona.tenant}</Badge>}
      </div>
      {actor && <div className="text-[11px] text-muted-foreground truncate" title={actor}>Signed in: {actor}</div>}
    </div>
  );
}

function Layout() {
  const { flash, setFlash, persona, stale } = useApp();
  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 border-r bg-sidebar flex flex-col">
        <div className="px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold text-foreground">Data360 Governance</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">CDEs, DQ rules and results on Unity Catalog</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t">
          <PersonaSwitcher />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">
        {persona.role === 'STEWARD' && persona.tenant && !GROUP_FUNCTIONS.includes(persona.tenant) && (
          <div className="mb-4 text-xs text-muted-foreground">
            BU view: you see Group-defined content plus {persona.tenant}'s own. You can edit {persona.tenant} content only; changes go to Group Data Governance for approval.
          </div>
        )}
        {stale && (
          <Alert className="mb-4">
            <AlertDescription className="flex items-center justify-between gap-3">
              A new version of the app was deployed. Reload to avoid errors from outdated screens.
              <button className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-sm" onClick={() => window.location.reload()}>Reload</button>
            </AlertDescription>
          </Alert>
        )}
        {flash && (
          <Alert variant={flash.kind === 'error' ? 'destructive' : 'default'} className="mb-4 cursor-pointer" onClick={() => setFlash(null)}>
            <AlertDescription>{flash.text}</AlertDescription>
          </Alert>
        )}
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/elements', element: <ElementsPage /> },
      { path: '/lineage', element: <LineagePage /> },
      { path: '/rules', element: <RulesPage /> },
      { path: '/results', element: <ResultsPage /> },
      { path: '/approvals', element: <ApprovalsPage /> },
      { path: '/upload', element: <BulkUploadPage /> },
      { path: '/reference', element: <ReferencePage /> },
      { path: '/audit', element: <AuditPage /> },
      { path: '/platform', element: <PlatformPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
