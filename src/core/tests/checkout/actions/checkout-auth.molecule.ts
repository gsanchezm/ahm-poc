import { sendIntent } from '../../../../kernel/client';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'molecule', action: 'auth' });

export interface BrowserSessionState {
    token: string;
    username: string;
    countryCode: string;
}

export async function injectBrowserSession(session: BrowserSessionState): Promise<void> {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }

    // Navigate to the domain first to establish the origin for localStorage
    await sendIntent('NAVIGATE', baseUrl);

    // Inject full session state — covers all common key naming conventions
    const script = [
        `localStorage.setItem('token', '${session.token}')`,
        `localStorage.setItem('access_token', '${session.token}')`,
        `localStorage.setItem('accessToken', '${session.token}')`,
        `localStorage.setItem('username', '${session.username}')`,
        `localStorage.setItem('user', '${session.username}')`,
        `localStorage.setItem('country_code', '${session.countryCode}')`,
        `localStorage.setItem('countryCode', '${session.countryCode}')`,
    ].join('; ');

    await sendIntent('EVALUATE', script);

    // Debug: dump localStorage to verify
    const result = await sendIntent(
        'EVALUATE',
        'JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))',
    );
    log.info({ localStorage: result.payload }, 'Browser session injected');
}
