import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  API_HTTP_METHODS,
  ApiContract,
  ApiEndpointContract,
  ApiHttpMethod,
} from './api-contract.types';

const REPO_ROOT = resolve(__dirname, '../../..');
const cache = new Map<string, ApiContract>();

function contractPath(feature: string): string {
  return resolve(REPO_ROOT, 'src/core/tests', feature, 'contracts', `${feature}.api.contract.json`);
}

function fail(msg: string): never {
  throw new Error(`[api-contract] ${msg}`);
}

function validate(feature: string, raw: unknown): ApiContract {
  if (!raw || typeof raw !== 'object') fail(`contract for '${feature}' is not an object`);
  const c = raw as Partial<ApiContract>;
  if (!c.feature || typeof c.feature !== 'string') fail(`'${feature}': missing 'feature'`);
  if (!c.version || typeof c.version !== 'string') fail(`'${feature}': missing 'version'`);
  if (!Array.isArray(c.endpoints) || c.endpoints.length === 0) {
    fail(`'${feature}': 'endpoints' must be a non-empty array`);
  }

  const ids = new Set<string>();
  for (const ep of c.endpoints) {
    if (!ep || typeof ep !== 'object') fail(`'${feature}': invalid endpoint entry`);
    if (!ep.id) fail(`'${feature}': endpoint missing 'id'`);
    if (ids.has(ep.id)) fail(`'${feature}': duplicate endpoint id '${ep.id}'`);
    ids.add(ep.id);
    if (!ep.method) fail(`'${feature}': endpoint '${ep.id}' missing 'method'`);
    if (!API_HTTP_METHODS.includes(ep.method as ApiHttpMethod)) {
      fail(`'${feature}': endpoint '${ep.id}' has invalid method '${ep.method}'`);
    }
    if (!ep.path) fail(`'${feature}': endpoint '${ep.id}' missing 'path'`);
    if (!ep.expect || typeof ep.expect !== 'object') {
      fail(`'${feature}': endpoint '${ep.id}' missing 'expect'`);
    }
    const status = (ep.expect as ApiEndpointContract['expect']).status;
    if (status === undefined || status === null) {
      fail(`'${feature}': endpoint '${ep.id}' missing 'expect.status'`);
    }
  }
  return c as ApiContract;
}

export const ApiContractLoader = {
  load(feature: string): ApiContract {
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

  getEndpoint(feature: string, endpointId: string): ApiEndpointContract {
    const contract = ApiContractLoader.load(feature);
    const ep = contract.endpoints.find((e) => e.id === endpointId);
    if (!ep) fail(`'${feature}': endpoint '${endpointId}' not found`);
    return ep;
  },

  reset(): void {
    cache.clear();
  },
};
