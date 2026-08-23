import { loadFixture, REQUIRED_FIELDS } from "./fixtures.js";
import { createCloudflareTunnelPublisher } from "./publish.js";

const html = await loadFixture();
const publisher = await createCloudflareTunnelPublisher({ initialHtml: html });

console.log(`\nTunnel is up: ${publisher.url}`);
console.log(`\nIn another terminal, run:`);
console.log(`  bdata scraper create ${publisher.url} "extract ${REQUIRED_FIELDS.join(", ")}"`);
console.log(`\nThen copy the collector_id it returns and run:`);
console.log(`  COLLECTOR_ID=c_xxx npm run chaos:real -- -n 3`);
console.log(`\n(leave this running while you create the collector — Ctrl+C when done)`);

process.stdin.resume(); // keep the process (and tunnel) alive