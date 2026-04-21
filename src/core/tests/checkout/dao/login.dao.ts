import { HttpClient } from '../../../../plugins/api/http';

const LOGIN_PATH = '/api/auth/login';
// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

export interface LoginRequest {
    email?: string;
    username?: string;
    password: string;
    [key: string]: unknown;
}

export interface LoginResponse {
    token?: string;
    accessToken?: string;
    access_token?: string;
    refreshToken?: string;
    user?: unknown;
    [key: string]: unknown;
}

export interface LoginDaoOptions {
    url?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
}

export class LoginDao {
    private readonly loginEndpoint: string;
    private readonly httpClient: HttpClient;

    constructor(options: LoginDaoOptions = {}) {
        const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/+$/, '');
        const loginApiUrl = options.url ?? process.env.LOGIN_API_URL;

        if (!apiBaseUrl && !loginApiUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.loginEndpoint = loginApiUrl ?? LOGIN_PATH;
        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            defaultHeaders: options.headers,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    async login(credentials: LoginRequest): Promise<LoginResponse> {
        if (!credentials.email && !credentials.username) {
            throw new Error('Login request requires either email or username');
        }

        return this.httpClient.post<LoginResponse>(this.loginEndpoint, {
            body: credentials,
        });
    }

    extractToken(response: LoginResponse): string | undefined {
        if (typeof response.token === 'string' && response.token.length > 0) {
            return response.token;
        }

        if (typeof response.accessToken === 'string' && response.accessToken.length > 0) {
            return response.accessToken;
        }

        if (typeof response.access_token === 'string' && response.access_token.length > 0) {
            return response.access_token;
        }

        const responseData = response.data;
        if (responseData && typeof responseData === 'object') {
            const data = responseData as Record<string, unknown>;
            const nestedToken = data.token ?? data.accessToken ?? data.access_token;
            if (typeof nestedToken === 'string' && nestedToken.length > 0) {
                return nestedToken;
            }
        }

        return undefined;
    }
}
