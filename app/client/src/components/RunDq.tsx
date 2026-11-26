import { useEffect, useState } from 'react';
import { Button, Spinner } from '@databricks/appkit-ui/react';
import { Play } from 'lucide-react';
import { useApp } from '../lib/app-context';

/** Triggers the serverless DQ Lakeflow Job (jobs plugin) and polls until it finishes, then refreshes all queries. */
export function RunDqButton() {
  const { api, persona, refresh, setFlash } = useApp();
  const [runId, setRunId] = useState<number | null>(null);
  const [state, setState] = useState<string>('');
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ life_cycle_state?: string; result_state?: string; url?: string }>(`/api/d360/dq/run/${runId}`);
        setState(r.life_cycle_state ?? '');
        if (r.url) setUrl(r.url);
        if (r.life_cycle_state === 'TERMINATED' || r.life_cycle_state === 'INTERNAL_ERROR' || r.life_cycle_state === 'SKIPPED') {
          clearInterval(t);
          setRunId(null);
          refresh();
          setFlash({
            kind: r.result_state === 'SUCCESS' ? 'success' : 'error',
            text: r.result_state === 'SUCCESS' ? 'DQ assessment finished. Results refreshed.' : `DQ run ended: ${r.result_state ?? r.life_cycle_state}`,
          });
        }
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [runId, api, refresh, setFlash]);

  if (persona.role === 'VIEWER') return null;
  const start = async () => {
    try {
      const r = await api<{ run_id: number; tenant: string }>('/api/d360/dq/run', 'POST', { period: '' });
      setRunId(r.run_id);
      setState('PENDING');
      setFlash({ kind: 'success', text: `DQ run ${r.run_id} started on serverless jobs compute (scope: ${r.tenant}). Takes ~1–2 min.` });
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  return (
    <div className="flex items-center gap-2">
      {url && runId && (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
          job run
        </a>
      )}
      <Button onClick={start} disabled={!!runId}>
        {runId ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {runId ? `DQ run ${state.toLowerCase()}…` : 'Run DQ assessment now'}
      </Button>
    </div>
  );
}
