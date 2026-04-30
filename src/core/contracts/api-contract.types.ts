export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const API_HTTP_METHODS: ApiHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface ApiRequestTemplate {
  headersTemplate?: Record<string, string>;
  queryTemplate?: Record<string, string>;
  bodyTemplate?: unknown;
}

export interface ApiExpectation {
  status: number | number[];
  headers?: Record<string, string>;
  body?: unknown;
  jsonPathAssertions?: Array<{ path: string; equals?: unknown; matches?: string }>;
}

export interface ApiExtractionRule {
  name: string;
  from: 'header' | 'body' | 'status';
  path?: string;
  pattern?: string;
}

export interface ApiTelemetryConfig {
  enabled?: boolean;
  emitOnLoad?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApiEndpointContract extends ApiRequestTemplate {
  id: string;
  description?: string;
  method: ApiHttpMethod;
  path: string;
  expect: ApiExpectation;
  extract?: ApiExtractionRule[];
  tags?: string[];
  telemetry?: ApiTelemetryConfig;
}

export interface ApiContract {
  feature: string;
  version: string;
  baseUrlRef?: string;
  endpoints: ApiEndpointContract[];
}
