import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { hasLocatorKey } from '../../kernel/locator-resolver';
import { VisualContract, VisualSnapshot } from './visual-contract.types';

const REPO_ROOT = resolve(__dirname, '../../..');
const cache = new Map<string, VisualContract>();

function contractPath(feature: string): string {
  return resolve(REPO_ROOT, 'src/core/tests', feature, 'contracts', `${feature}.visual.json`);
}

function fail(msg: string): never {
  throw new Error(`[visual-contract] ${msg}`);
}

function validate(feature: string, raw: unknown): VisualContract {
  if (!raw || typeof raw !== 'object') fail(`contract for '${feature}' is not an object`);
  const c = raw as Partial<VisualContract>;
  if (!c.feature || typeof c.feature !== 'string') fail(`'${feature}': missing 'feature'`);
  if (!c.version || typeof c.version !== 'string') fail(`'${feature}': missing 'version'`);
  if (!Array.isArray(c.snapshots) || c.snapshots.length === 0) {
    fail(`'${feature}': 'snapshots' must be a non-empty array`);
  }

  const ids = new Set<string>();
  for (const snap of c.snapshots) {
    if (!snap || typeof snap !== 'object') fail(`'${feature}': invalid snapshot entry`);
    if (!snap.id) fail(`'${feature}': snapshot is missing 'id'`);
    if (ids.has(snap.id)) fail(`'${feature}': duplicate snapshot id '${snap.id}'`);
    ids.add(snap.id);
    if (!snap.regionRef) fail(`'${feature}': snapshot '${snap.id}' is missing 'regionRef'`);
    if (!hasLocatorKey(snap.regionRef)) {
      fail(`'${feature}': snapshot '${snap.id}' regionRef '${snap.regionRef}' not found in locators`);
    }
    const maskRefs = snap.maskRefs ?? [];
    if (!Array.isArray(maskRefs)) fail(`'${feature}': snapshot '${snap.id}' maskRefs must be array`);
    for (const m of maskRefs) {
      if (!hasLocatorKey(m)) {
        fail(`'${feature}': snapshot '${snap.id}' maskRef '${m}' not found in locators`);
      }
    }
  }
  return c as VisualContract;
}

export const VisualContractLoader = {
  load(feature: string): VisualContract {
    const cached = cache.get(feature);
    if (cached) return cached;
    const file = contractPath(feature);
    if (!existsSync(file)) fail(`contract file not found: ${file}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (e) {
      fail(`'${feature}': invalid JSON — ${(e as Error).message}`);
    }
    const valid = validate(feature, parsed);
    cache.set(feature, valid);
    return valid;
  },

  getSnapshot(feature: string, snapshotId: string): VisualSnapshot {
    const contract = VisualContractLoader.load(feature);
    const snap = contract.snapshots.find((s) => s.id === snapshotId);
    if (!snap) fail(`'${feature}': snapshot '${snapshotId}' not found`);
    return snap;
  },

  reset(): void {
    cache.clear();
  },
};
