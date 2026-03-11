import { sendIntent } from '../../../../kernel/client';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'molecule', action: 'navigation' });
const CHECKOUT_PATH = '/checkout';

export async function navigateToCheckout(): Promise<void> {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    await sendIntent('NAVIGATE', `${baseUrl}${CHECKOUT_PATH}`);

    // Debug: check current URL and page state after navigation
    const url = await sendIntent('EVALUATE', 'window.location.href');
    const storage = await sendIntent(
        'EVALUATE',
        'JSON.stringify(Object.keys(localStorage))',
    );
    const bodyText = await sendIntent(
        'EVALUATE',
        'document.body?.innerText?.substring(0, 500)',
    );
    // Debug: find all data-testid elements on the page
    const testIds = await sendIntent(
        'EVALUATE',
        'JSON.stringify([...document.querySelectorAll("[data-testid]")].map(el => el.getAttribute("data-testid")))',
    );
    const viewport = await sendIntent(
        'EVALUATE',
        'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })',
    );
    log.info({
        currentUrl: url.payload,
        localStorageKeys: storage.payload,
        pageContent: bodyText.payload,
        dataTestIds: testIds.payload,
        viewport: viewport.payload,
    }, 'Checkout page loaded');
}
