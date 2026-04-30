import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../../utils/logger';
import { getPlaywrightActionRegistry } from '../actions/playwright/registerPlaywrightActions';

// --- Viewport Profiles ---
// desktop: null viewport + --start-maximized lets the OS control window size
// responsive: fixed mobile dimensions, no maximizing

const isDesktop = (process.env.VIEWPORT ?? 'desktop') === 'desktop';
const VIEWPORT_TAG = isDesktop ? 'desktop' : 'responsive';
const RESPONSIVE_VIEWPORT = { width: 390, height: 844 };  // iPhone 14 Pro

// --- Browser singleton + per-session context map ---
// Each parallel Cucumber worker gets its own isolated BrowserContext → Page.

let browser: Browser | null = null;
const sessions: Map<string, { context: BrowserContext; page: Page }> = new Map();

async function ensureBrowser(): Promise<Browser> {
    if (browser) return browser;

    const headless = process.env.HEADLESS !== 'false';
    const launchArgs = isDesktop && !headless ? ['--start-maximized'] : [];

    logger.info(`[Playwright Adapter] Launching browser (viewport: ${isDesktop ? 'maximized' : '390x844'}, headless: ${headless})...`);
    browser = await chromium.launch({ headless, args: launchArgs });
    return browser;
}

async function ensureSession(sessionId: string): Promise<{ browser: Browser; page: Page }> {
    if (sessions.has(sessionId)) {
        const s = sessions.get(sessionId)!;
        return { browser: browser!, page: s.page };
    }

    const b = await ensureBrowser();
    const context = await b.newContext({ viewport: isDesktop ? null : RESPONSIVE_VIEWPORT });
    const page = await context.newPage();
    sessions.set(sessionId, { context, page });
    logger.info(`[Playwright Adapter] Session "${sessionId}" created (total active: ${sessions.size})`);
    return { browser: b, page };
}

async function teardown(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
        await session.context.close();
        sessions.delete(sessionId);
        logger.info(`[Playwright Adapter] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }

    // Close browser when all sessions are done
    if (sessions.size === 0 && browser) {
        await browser.close();
        browser = null;
        logger.info('[Playwright Adapter] Browser closed — all sessions complete');
    }
}

// --- Public API ---

const registry = getPlaywrightActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a browser just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Playwright execution environment terminated securely.';
    }

    const { browser: b, page: p } = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        browser: b,
        page: p,
        driver: p,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: 'web',
        viewport: VIEWPORT_TAG,
        metadata: { plugin: 'playwright' },
    });
}
