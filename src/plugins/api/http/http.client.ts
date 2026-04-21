import { HttpError } from './http.error';
import { HttpMethod } from './http-method.enum';
import {
    HttpClientOptions,
    HttpRequestOptions,
    HttpTransport,
    QueryParamValue,
} from './http.types';

// 60s covers Render free-tier cold starts (~30–45s after idle) that otherwise
// abort the first login fetch of a scenario with AbortError.
const DEFAULT_TIMEOUT_MS = 60_000;

export class HttpClient {
    private readonly baseUrl?: string;
    private readonly defaultHeaders: Record<string, string>;
    private readonly defaultTimeoutMs: number;
    private readonly transport: HttpTransport;

    constructor(options: HttpClientOptions = {}) {
        this.baseUrl = options.baseUrl?.replace(/\/+$/, '');
        this.defaultHeaders = options.defaultHeaders ?? {};
        this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

        if (options.transport) {
            this.transport = options.transport;
            return;
        }

        const fetchImpl = options.fetchImpl ?? fetch;
        this.transport = {
            send: (url: string, init: RequestInit) => fetchImpl(url, init),
        };
    }

    get<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
        return this.request<TResponse>(HttpMethod.GET, path, options);
    }

    post<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
        return this.request<TResponse>(HttpMethod.POST, path, options);
    }

    put<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
        return this.request<TResponse>(HttpMethod.PUT, path, options);
    }

    patch<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
        return this.request<TResponse>(HttpMethod.PATCH, path, options);
    }

    delete<TResponse>(path: string, options: HttpRequestOptions = {}): Promise<TResponse> {
        return this.request<TResponse>(HttpMethod.DELETE, path, options);
    }

    async request<TResponse>(
        method: HttpMethod,
        path: string,
        options: HttpRequestOptions = {},
    ): Promise<TResponse> {
        const url = this.resolveUrl(path, options.queryParams);
        const headers: Record<string, string> = {
            ...this.defaultHeaders,
            ...options.headers,
        };

        const controller = new AbortController();
        const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const body = this.buildBody(options.body, headers);
            const response = await this.transport.send(url, {
                method,
                headers,
                body,
                signal: controller.signal,
            });

            const rawBody = await response.text();
            const responseBody = this.parseBody(rawBody, response.headers.get('content-type'));

            if (!response.ok) {
                throw new HttpError(this.buildErrorMessage(method, url, response.status, responseBody), {
                    status: response.status,
                    method,
                    url,
                    responseBody,
                });
            }

            return responseBody as TResponse;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private buildBody(body: unknown, headers: Record<string, string>): string | undefined {
        if (typeof body === 'undefined') {
            return undefined;
        }

        if (typeof body === 'string') {
            return body;
        }

        if (!this.hasHeader(headers, 'content-type')) {
            headers['content-type'] = 'application/json';
        }

        return JSON.stringify(body);
    }

    private resolveUrl(path: string, queryParams?: Record<string, QueryParamValue>): string {
        const isAbsoluteUrl = /^https?:\/\//i.test(path);
        const baseUrl = this.baseUrl;

        if (!isAbsoluteUrl && !baseUrl) {
            throw new Error('HttpClient baseUrl is required when using relative paths');
        }

        const normalizedPath = isAbsoluteUrl
            ? path
            : path.startsWith('/')
                ? `${baseUrl}${path}`
                : `${baseUrl}/${path}`;

        const queryString = this.toQueryString(queryParams);
        if (!queryString) {
            return normalizedPath;
        }

        const separator = normalizedPath.includes('?') ? '&' : '?';
        return `${normalizedPath}${separator}${queryString}`;
    }

    private toQueryString(queryParams?: Record<string, QueryParamValue>): string {
        if (!queryParams) {
            return '';
        }

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
            if (value === null || typeof value === 'undefined') {
                continue;
            }
            params.set(key, String(value));
        }

        return params.toString();
    }

    private parseBody(rawBody: string, contentType: string | null): unknown {
        if (!rawBody) {
            return null;
        }

        const shouldParseJson = contentType?.toLowerCase().includes('application/json') ?? true;
        if (!shouldParseJson) {
            return rawBody;
        }

        try {
            return JSON.parse(rawBody) as unknown;
        } catch {
            return rawBody;
        }
    }

    private buildErrorMessage(
        method: HttpMethod,
        url: string,
        status: number,
        responseBody: unknown,
    ): string {
        if (responseBody && typeof responseBody === 'object') {
            const message = (responseBody as Record<string, unknown>).message;
            const error = (responseBody as Record<string, unknown>).error;
            if (typeof message === 'string' && message.trim().length > 0) {
                return message;
            }
            if (typeof error === 'string' && error.trim().length > 0) {
                return error;
            }
        }

        if (typeof responseBody === 'string' && responseBody.trim().length > 0) {
            return responseBody;
        }

        return `${method} ${url} failed with status ${status}`;
    }

    private hasHeader(headers: Record<string, string>, name: string): boolean {
        const expected = name.toLowerCase();
        return Object.keys(headers).some((headerName) => headerName.toLowerCase() === expected);
    }
}
