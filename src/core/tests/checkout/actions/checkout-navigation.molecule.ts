import { sendIntent } from '../../../../kernel/client';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'molecule', action: 'navigation' });
const CHECKOUT_PATH = '/checkout';

export async function navigateToCheckout(market?: string, accessToken?: string): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';

    // Atomic mobile path: deep link directly to the checkout screen, bypassing the
    // full user journey (Login → Catalog → PizzaBuilder). The app hydrates the cart
    // from the backend via hydrateCart=true; market sets the country context;
    // accessToken seeds the Zustand auth store via useDeepLinkParams.
    if (driver === 'appium') {
        const params = new URLSearchParams({ hydrateCart: 'true' });
        if (market) params.set('market', market);
        if (accessToken) params.set('accessToken', accessToken);
        await sendIntent('DEEP_LINK', `omnipizza://checkout?${params.toString()}`);
        await sendIntent('WAIT_FOR_ELEMENT', 'checkoutHeader||8000');
        // Wait for the first form input to confirm the checkout form is fully rendered,
        // not just the navigation bar header.
        await sendIntent('WAIT_FOR_ELEMENT', 'streetInput||10000');
        log.info({ market }, 'Deep linked to checkout screen (atomic mobile path)');
        return;
    }

    // Web path: navigate via URL
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
