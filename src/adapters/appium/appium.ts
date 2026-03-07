import { remote, Browser } from 'webdriverio';

// --- Types ---

type ActionHandler = (driver: Browser, target: string) => Promise<string>;

// --- State Encapsulation ---
// Strict container isolation ensures this driver instance belongs solely to the current Atom.
// S_A1 ∩ S_A2 = ∅ is maintained.
let driver: Browser | null = null;

// --- Configuration ---

const ACTION_TYPE_SEPARATOR = '||';

const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:app': process.env.APP_PATH || '/app/builds/demo.apk', // Injected via Docker volume
    'appium:noReset': false, // Crucial: Forces a clean app state per session
    'appium:fullReset': false,
};

const wdioOptions = {
    hostname: process.env.APPIUM_HOST || '127.0.0.1',
    port: parseInt(process.env.APPIUM_PORT || '4723', 10),
    logLevel: 'error' as const,
    capabilities,
};

// --- Lazy Engine Bootstrap ---

async function ensureDriver(): Promise<Browser> {
    if (driver) return driver;

    console.log('[Appium Adapter] Bootstrapping UiAutomator2 engine...');
    driver = await remote(wdioOptions);
    return driver;
}

// --- Teardown Helper ---

async function teardown(): Promise<void> {
    await driver?.deleteSession();
    driver = null;
}

// --- Intent → Handler Map ---

const actionHandlers: ReadonlyMap<string, ActionHandler> = new Map([
    [
        'NAVIGATE',
        async (_driver, url) => {
            // In mobile, "navigate" often translates to Deep Linking to bypass UI navigation chaos
            await _driver.url(url);
            return `Deep-linked successfully to ${url}`;
        },
    ],
    [
        'CLICK',
        async (_driver, selector) => {
            // If the mobile element is animating or off-screen, Appium throws 'NoSuchElement'
            // or 'ElementNotInteractable'. The proxy's Lyapunov Stabilizer catches this and applies backoff.
            const target = await _driver.$(selector);
            await target.click();
            return `Tapped on mobile element: ${selector}`;
        },
    ],
    [
        'TYPE',
        async (_driver, composite) => {
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

            const target = await _driver.$(selector);
            await target.setValue(text);
            return `Typed text into mobile element: ${selector}`;
        },
    ],
    [
        'TEARDOWN',
        async () => {
            // Purge the mobile session to prevent state leakage into the host
            await teardown();
            return 'Appium execution environment terminated securely.';
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
        throw new Error(`Unsupported Appium actionId: ${actionId}`);
    }

    const activeDriver = await ensureDriver();
    return handler(activeDriver, targetSelector);
}