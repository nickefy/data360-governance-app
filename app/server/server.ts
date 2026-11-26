import { createApp, analytics, server, jobs } from '@databricks/appkit';
import { registerGovernanceRoutes } from './governance';

createApp({
  plugins: [analytics(), jobs(), server()],
  // Governance data is edited through this app, so reads must never be served from a stale cache.
  cache: { enabled: false },
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      registerGovernanceRoutes(app, appkit.analytics, () => {
        try {
          return appkit.jobs('default');
        } catch {
          return null;
        }
      });
    });
  },
}).catch(console.error);
