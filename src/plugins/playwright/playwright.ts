import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../../utils/logger';

// --- Types ---

type ActionHandler = (page: Page, browser: Browser, target: string) => Promise<string>;

// --- Viewport Profiles ---
// desktop: null viewport + --start-maximized lets the OS control window size
// responsive: fixed mobile dimensions, no maximizing

const isDesktop = (process.env.VIEWPORT ?? 'desktop') === 'desktop';
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

// --- Teardown Helper ---

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

// --- Intent → Handler Map ---

const ACTION_TYPE_SEPARATOR = '||';

const actionHandlers: ReadonlyMap<string, ActionHandler> = new Map([
  [
    'NAVIGATE',
    async (_page, _browser, url) => {
      await _page.goto(url, { waitUntil: 'domcontentloaded' });
      return `Navigated successfully to ${url}`;
    },
  ],
  [
    'CLICK',
    async (_page, _browser, selector) => {
      await _page.click(selector);
      return `Click executed on element: ${selector}`;
    },
  ],
  [
    'TYPE',
    async (_page, _browser, composite) => {
      const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

      if (sepIndex === -1) {
        throw new Error("TYPE action requires 'selector||text' format.");
      }

      const selector = composite.slice(0, sepIndex);
      const text = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);

      if (!text) {
        throw new Error("TYPE action requires non-empty text after 'selector||'.");
      }

      await _page.fill(selector, text);
      return `Typed text into element: ${selector}`;
    },
  ],
  [
    'READ_TEXT',
    async (_page, _browser, selector) => {
      const texts = await _page.locator(selector).allTextContents();
      return texts.join('\n');
    },
  ],
  [
    'WAIT_FOR_ELEMENT',
    async (_page, _browser, composite) => {
      const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);
      const selector  = sepIndex === -1 ? composite : composite.slice(0, sepIndex);
      const timeoutMs = sepIndex === -1
        ? 5000
        : parseInt(composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length), 10);

      await _page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
      return `Element visible: ${selector}`;
    },
  ],
  [
    'ASSERT_TEXT',
    async (_page, _browser, composite) => {
      const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

      if (sepIndex === -1) {
        throw new Error("ASSERT_TEXT action requires 'selector||expectedText' format.");
      }

      const selector = composite.slice(0, sepIndex);
      const expected = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);
      const actual   = await _page.locator(selector).innerText();

      if (actual !== expected) {
        throw new Error(
          `[ASSERT_TEXT] Mismatch on "${selector}": expected "${expected}", got "${actual}"`,
        );
      }

      return actual;
    },
  ],
  [
    'SCROLL_TO',
    async (_page, _browser, selector) => {
      await _page.locator(selector).scrollIntoViewIfNeeded();
      return `Scrolled to: ${selector}`;
    },
  ],
  [
    'EVALUATE',
    async (_page, _browser, script) => {
      const result = await _page.evaluate(script);
      return result !== undefined ? String(result) : '';
    },
  ],
  [
    'TEARDOWN',
    async () => {
      // sessionId is handled in execute() before calling the handler
      return 'Playwright execution environment terminated securely.';
    },
  ],
]);

// --- Public API ---

export async function execute(
  actionId: string,
  targetSelector: string,
  sessionId: string = '0',
): Promise<string> {
  const normalizedAction = actionId.toUpperCase();
  const handler = actionHandlers.get(normalizedAction);

  if (!handler) {
    throw new Error(`Unsupported Playwright actionId: ${actionId}`);
  }

  // TEARDOWN is session-scoped
  if (normalizedAction === 'TEARDOWN') {
    await teardown(sessionId);
    return 'Playwright execution environment terminated securely.';
  }

  const { browser: b, page: p } = await ensureSession(sessionId);
  return handler(p, b, targetSelector);
}
