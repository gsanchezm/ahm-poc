import { HttpClient } from './http/http.client';
import { getApiActionRegistry } from '../actions/api/registerApiActions';

// HTTP_BASE_URL is consumed by every contract action; configurable per-env.
const baseUrl = process.env.API_BASE_URL || process.env.HTTP_BASE_URL;

let cachedClient: HttpClient | null = null;

function getHttpClient(): HttpClient {
    if (cachedClient) return cachedClient;
    cachedClient = new HttpClient({ baseUrl });
    return cachedClient;
}

const registry = getApiActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    return registry.execute(normalizedAction, {
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        client: getHttpClient(),
        driver: getHttpClient(),
        metadata: { plugin: 'api' },
    });
}
