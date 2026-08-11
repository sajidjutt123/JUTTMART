/**
 * Re-seed the catalogue into the SQLite database.
 *   npm run seed
 */
import { seed, queries } from './db.js';

seed();

const stats = queries.stats();
console.log('\n  ✅ Catalogue seeded');
console.log(`     products : ${stats.products}`);
console.log(`     orders   : ${stats.orders}`);
console.log(`     revenue  : Rs ${stats.revenue.toLocaleString('en-US')}\n`);
