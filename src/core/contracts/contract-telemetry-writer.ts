import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import {
  ApiContractTelemetryEvent,
  CONTRACT_TELEMETRY_SCHEMA_VERSION,
  ContractTelemetryEvent,
  VisualContractTelemetryEvent,
} from './contract-telemetry.types';

const REPO_ROOT = resolve(__dirname, '../../..');

let cachedRunId: string | null = null;

export function resolveRunId(): string {
  if (cachedRunId) return cachedRunId;
  const env = process.env.TOM_RUN_ID || process.env.GITHUB_RUN_ID;
  if (env && env.trim()) {
    cachedRunId = env.trim();
    return cachedRunId;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const layer = (process.env.PLATFORM || 'local').toLowerCase();
  cachedRunId = `tom-${ts}-pid${process.pid}-${layer}`;
  return cachedRunId;
}

export function sha256(input: string | Buffer | object | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const data =
    typeof input === 'string' || Buffer.isBuffer(input)
      ? input
      : JSON.stringify(input, Object.keys(input as object).sort());
  return createHash('sha256').update(data).digest('hex');
}

function targetPath(kind: 'api' | 'visual', runId: string): string {
  const dir = join(REPO_ROOT, 'metrics', 'raw', kind);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${runId}.jsonl`);
}

function isStrict(): boolean {
  return (process.env.TOM_TELEMETRY_STRICT || '').toLowerCase() === 'true';
}

function appendJsonl(file: string, event: ContractTelemetryEvent): void {
  try {
    const dir = file.substring(0, file.lastIndexOf('/'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(file, JSON.stringify(event) + '\n');
  } catch (err) {
    if (isStrict()) throw err;
    process.stderr.write(`[contract-telemetry] write failed (non-strict): ${(err as Error).message}\n`);
  }
}

type ApiInput = Partial<ApiContractTelemetryEvent> & {
  feature: string;
  contractId: string;
  endpointId: string;
  method: string;
  path: string;
  status: ApiContractTelemetryEvent['status'];
};

type VisualInput = Partial<VisualContractTelemetryEvent> & {
  feature: string;
  contractId: string;
  snapshotId: string;
  regionRef: string;
  status: VisualContractTelemetryEvent['status'];
};

export const ContractTelemetryWriter = {
  resolveRunId,
  sha256,

  async writeApiEvent(input: ApiInput): Promise<ApiContractTelemetryEvent> {
    const runId = input.runId || resolveRunId();
    const event: ApiContractTelemetryEvent = {
      schemaVersion: CONTRACT_TELEMETRY_SCHEMA_VERSION,
      runId,
      timestamp: input.timestamp || new Date().toISOString(),
      feature: input.feature,
      contractType: 'API',
      contractId: input.contractId,
      platform: input.platform ?? null,
      viewport: input.viewport ?? null,
      status: input.status,
      durationMs: input.durationMs ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      endpointId: input.endpointId,
      method: input.method,
      path: input.path,
      requestHeadersHash: input.requestHeadersHash ?? null,
      requestBodyHash: input.requestBodyHash ?? null,
      responseStatus: input.responseStatus ?? null,
      responseTimeMs: input.responseTimeMs ?? null,
      extractedKeys: input.extractedKeys ?? [],
      assertionCount: input.assertionCount ?? 0,
      failedAssertions: input.failedAssertions ?? 0,
    };
    appendJsonl(targetPath('api', runId), event);
    return event;
  },

  async writeVisualEvent(input: VisualInput): Promise<VisualContractTelemetryEvent> {
    const runId = input.runId || resolveRunId();
    const event: VisualContractTelemetryEvent = {
      schemaVersion: CONTRACT_TELEMETRY_SCHEMA_VERSION,
      runId,
      timestamp: input.timestamp || new Date().toISOString(),
      feature: input.feature,
      contractType: 'VISUAL',
      contractId: input.contractId,
      platform: input.platform ?? null,
      viewport: input.viewport ?? null,
      status: input.status,
      durationMs: input.durationMs ?? null,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      snapshotId: input.snapshotId,
      regionRef: input.regionRef,
      resolvedRegionStrategy: input.resolvedRegionStrategy ?? null,
      maskRefs: input.maskRefs ?? [],
      resolvedMaskCount: input.resolvedMaskCount ?? 0,
      baselinePath: input.baselinePath ?? null,
      actualPath: input.actualPath ?? null,
      diffPath: input.diffPath ?? null,
      diffPixels: input.diffPixels ?? null,
      diffRatio: input.diffRatio ?? null,
      threshold: input.threshold ?? null,
      passed: input.passed ?? null,
    };
    appendJsonl(targetPath('visual', runId), event);
    return event;
  },
};
