// Deck screenshots of the locally running app (cd app && npm run dev, port 8000), using the system Google Chrome.
// Setup once:  cd deck/tools && npm init -y >/dev/null && npm i playwright-core@1
// Usage:       node deck/tools/shoot.mjs deck/shots "<path>|<name>|<persona>|<click>Text>Text|main" ...
//   e.g.       node deck/tools/shoot.mjs deck/shots "|overview|group-dg" "approvals|approvals|group-dg||main"
//              "elements|lineage_dialog|vn-steward|Customer Identifier>Physical mapping & lineage>Lineage graph|main"
// Users auth mode instead of personas: add extraHTTPHeaders {'x-forwarded-email': ...} to newPage().
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await b.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });
const out = process.argv[2];
for (const s of process.argv.slice(3)) {
  const [path, name, persona, clicks, mode] = s.split('|');
  await pg.goto('http://localhost:8000/');
  await pg.evaluate((p) => localStorage.setItem('d360-persona', p), persona || 'group-dg');
  await pg.goto('http://localhost:8000/' + path);
  await pg.waitForTimeout(9000);
  for (const c of (clicks ? clicks.split('>') : [])) { await pg.getByText(c, { exact: false }).first().click(); await pg.waitForTimeout(6000); }
  const opt = mode === 'main' ? { clip: { x: 256, y: 0, width: 1244, height: 940 } } : {};
  await pg.screenshot({ path: `${out}/${name}.png`, ...opt });
  console.log('shot', name);
}
await b.close();
