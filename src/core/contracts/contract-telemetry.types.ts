export type ContractType = 'API' | 'VISUAL';
export type ContractStatus = 'PASS' | 'FAIL' | 'SKIP' | 'UNKNOWN';

export const CONTRACT_TELEMETRY_SCHEMA_VERSION = '1.0.0';

export interface ContractTelemetryBase {
  schemaVersion: string;
  runId: string;
  timestamp: string;
  feature: string;
  contractType: ContractType;
  contractId: string;
  platform: string | null;
  viewport: string | null;
  status: ContractStatus;
  durationMs: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface ApiContractTelemetryEvent extends ContractTelemetryBase {
  contractType: 'API';
  endpointId: string;
  method: string;
  path: string;
  requestHeadersHash: string | null;
  requestBodyHash: string | null;
  responseStatus: number | null;
  responseTimeMs: number | null;
  extractedKeys: string[];
  assertionCount: number;
  failedAssertions: number;
}

export interface VisualContractTelemetryEvent extends ContractTelemetryBase {
  contractType: 'VISUAL';
  snapshotId: string;
  regionRef: string;
  resolvedRegionStrategy: string | null;
  maskRefs: string[];
  resolvedMaskCount: number;
  baselinePath: string | null;
  actualPath: string | null;
  diffPath: string | null;
  diffPixels: number | null;
  diffRatio: number | null;
  threshold: number | null;
  passed: boolean | null;
}

export type ContractTelemetryEvent = ApiContractTelemetryEvent | VisualContractTelemetryEvent;
