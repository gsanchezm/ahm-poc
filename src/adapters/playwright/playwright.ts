import { chromium, Browser, Page } from 'playwright';
import { logger } from '../../utils/logger';

// --- Types ---

type ActionHandler = (page: Page, browser: Browser, target: string) => Promise<string>;

// --- State Encapsulation ---
// The container isolates the process (S_A1 ∩ S_A2 = ∅),
// so this singleton state is safe and perfectly atomic.
let browser: Browser | null = null;
let page: Page | null = null;

// --- Lazy Engine Bootstrap ---

async function ensureEngine(): Promise<{ browser: Browser; page: Page }> {
  if (browser && page) return { browser, page };

  logger.info('[Playwright Adapter] Bootstrapping chromium engine...');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  return { browser, page };
}

// --- Teardown Helper ---

async function teardown(): Promise<void> {
  await browser?.close();
  browser = null;
  page = null;
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
      // Playwright's native auto-waiting applies here.
      // If the DOM is highly unstable, Playwright throws a TimeoutError
      // that bubbles up the gRPC channel to the Chaos Suppressor.
      await _page.click(selector);
      return `Click executed on element: ${selector}`;
    },
  ],
  [
    'TYPE',
    async (_page, _browser, composite) => {
      const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

      // Guard: malformed input
      if (sepIndex === -1) {
        throw new Error("TYPE action requires 'selector||text' format.");
      }

      const selector = composite.slice(0, sepIndex);
      const text = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);

      // Guard: empty text payload
      if (!text) {
        throw new Error("TYPE action requires non-empty text after 'selector||'.");
      }

      await _page.fill(selector, text);
      return `Typed text into element: ${selector}`;
    },
  ],
  [
    'TEARDOWN',
    async () => {
      // Crucial for freeing up memory (the 512MB cgroup limit)
      await teardown();
      return 'Playwright execution environment terminated securely.';
    },
  ],
]);

// --- Public API ---

export async function execute(
  actionId: string,
  targetSelector: string,
): Promise<string> {
  const normalizedAction = actionId.toUpperCase();
  const handler = actionHandlers.get(normalizedAction);

  // Guard: unknown intent is a deterministic logic failure, not chaos
  if (!handler) {
    throw new Error(`Unsupported Playwright actionId: ${actionId}`);
  }

  const { browser: b, page: p } = await ensureEngine();
  return handler(p, b, targetSelector);
}