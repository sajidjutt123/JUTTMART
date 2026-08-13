/**
 * Re-seed the catalogue into the active database (SQLite or Postgres).
 *   npm run seed
 */
import { seed, queries } from './db.js';

await seed();

const stats = await queries.stats();
console.log('\n  ✅ Catalogue seeded');
console.log(`     products : ${stats.products}`);
console.log(`     orders   : ${stats.orders}`);
console.log(`     revenue  : Rs ${stats.revenue.toLocaleString('en-US')}\n`);
