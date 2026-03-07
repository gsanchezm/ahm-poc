export type QueryParamValue = string | number | boolean | null | undefined;

export interface HttpRequestOptions {
    headers?: Record<string, string>;
    queryParams?: Record<string, QueryParamValue>;
    body?: unknown;
    timeoutMs?: number;
}

export interface HttpTransport {
    send(url: string, init: RequestInit): Promise<Response>;
}

export interface HttpClientOptions {
    baseUrl?: string;
    defaultHeaders?: Record<string, string>;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    transport?: HttpTransport;
}
