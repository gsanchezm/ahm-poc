import { sendIntent } from '../../../../kernel/client';
import { logger } from '../../../../utils/logger';
import type { CartItemResponse, CountryInfo } from '../dao/ordering.dao';

const log = logger.child({ layer: 'molecule', action: 'auth' });

export interface BrowserSessionState {
    token: string;
    username: string;
    password: string;
    countryCode: string;
    cartItems: CartItemResponse[];
    countryInfo: CountryInfo;
}

export async function injectBrowserSession(session: BrowserSessionState): Promise<void> {
    // On mobile (React Native), Zustand state is ephemeral — no persistence layer.
    // The auth token is injected via the deep link accessToken param (handled by
    // useDeepLinkParams in OmniPizza), so no UI login or localStorage manipulation needed.
    if (process.env.DRIVER === 'appium') {
        log.info({ countryCode: session.countryCode }, 'Skipping session injection — token injected via deep link accessToken param');
        return;
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }

    // Navigate to the domain first to establish the origin for localStorage
    await sendIntent('NAVIGATE', baseUrl);

    // Build Zustand omnipizza-country payload
    const lang = session.countryInfo.languages[0] ?? 'en';
    const locale = `${lang}-${session.countryInfo.code}`;
    const countryState = JSON.stringify({
        state: {
            countryCode: session.countryInfo.code,
            countryInfo: session.countryInfo,
            language: lang,
            locale,
            currency: session.countryInfo.currency,
        },
        version: 0,
    });

    const setters: string[] = [
        `localStorage.setItem('token', '${session.token}')`,
        `localStorage.setItem('access_token', '${session.token}')`,
        `localStorage.setItem('accessToken', '${session.token}')`,
        `localStorage.setItem('username', '${session.username}')`,
        `localStorage.setItem('user', '${session.username}')`,
        `localStorage.setItem('country_code', '${session.countryCode}')`,
        `localStorage.setItem('countryCode', '${session.countryCode}')`,
        `localStorage.setItem('omnipizza-country', ${JSON.stringify(countryState)})`,
        // Clear stale cart/order state so the frontend fetches fresh from backend for this scenario.
        `localStorage.removeItem('omnipizza-cart')`,
        `localStorage.removeItem('omnipizza-order')`,
    ];

    await sendIntent('EVALUATE', setters.join('; '));

    log.info(
        { cartItemCount: session.cartItems.length, countryCode: session.countryCode, locale },
        'Browser session injected',
    );
}
