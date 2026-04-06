/**
 * Pre-build script: parses checkout.feature and writes a static
 * checkout-rows.generated.ts so the Gatling simulation bundle
 * has no dependency on Node.js built-ins (fs, path).
 *
 * Run automatically via preperf:* hooks, or manually:
 *   ts-node scripts/generate-checkout-feeder.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { featureToCheckoutRows } from '../src/core/tests/checkout/simulations/checkout-rows';

const OUT_FILE = path.resolve(
    __dirname,
    '../src/core/tests/checkout/simulations/checkout-rows.generated.ts',
);

const rows = featureToCheckoutRows(['Credit Card', 'Cash']);

const lines = [
    '// AUTO-GENERATED — do not edit by hand.',
    '// Re-generate with: ts-node scripts/generate-checkout-feeder.ts',
    "import type { CheckoutRow } from './checkout-rows';",
    '',
    'export const checkoutRows: CheckoutRow[] = ' + JSON.stringify(rows, null, 4) + ';',
    '',
];

fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(`[generate-checkout-feeder] Written ${rows.length} rows → ${OUT_FILE}`);
