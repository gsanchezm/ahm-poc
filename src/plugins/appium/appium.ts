import { remote, Browser } from 'webdriverio';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

type ActionHandler = (driver: Browser, target: string) => Promise<string>;

// --- Capability Profile Loader ---

const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();
const CAP_PROFILE = process.env.CAP_PROFILE;

function listProfiles(): string {
    const dir = path.resolve(__dirname, 'capabilities', PLATFORM);
    if (!fs.existsSync(dir)) return '(no profiles directory found)';
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .join(', ') || '(empty)';
}

function resolveAppPath(envVar: string | undefined): string | undefined {
    if (!envVar) return undefined;
    const resolved = path.isAbsolute(envVar) ? envVar : path.resolve(process.cwd(), envVar);
    if (!fs.existsSync(resolved)) {
        logger.warn({ path: resolved }, '[Appium] App file not found — check ANDROID_APP_PATH / IOS_APP_PATH');
    }
    return resolved;
}

function resolveUdid(sessionId: string): string | undefined {
    // Per-worker UDID: IOS_UDID_0, IOS_UDID_1, … (for parallel simulators/devices)
    const perWorker = process.env[`${PLATFORM.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;

    // Single UDID: IOS_UDID or ANDROID_UDID
    const single = process.env[`${PLATFORM.toUpperCase()}_UDID`];
    if (single) return single;

    // Not set — Appium will auto-select an available simulator/device
    return undefined;
}

function loadCapabilities(sessionId: string = '0'): Record<string, unknown> {
    if (!CAP_PROFILE) {
        throw new Error(
            '[Appium] CAP_PROFILE env var is required. ' +
            `Example: CAP_PROFILE=galaxy_s25_ultra for capabilities/${PLATFORM}/galaxy_s25_ultra.json`,
        );
    }

    const capPath = path.resolve(
        __dirname,
        'capabilities',
        PLATFORM,
        `${CAP_PROFILE}.json`,
    );

    if (!fs.existsSync(capPath)) {
        throw new Error(
            `[Appium] Capability profile not found: ${capPath}\n` +
            `Available profiles: ${listProfiles()}`,
        );
    }

    const caps = JSON.parse(fs.readFileSync(capPath, 'utf-8')) as Record<string, unknown>;

    // App path — env var overrides JSON (required for CI/Docker); resolved to absolute path
    if (PLATFORM === 'android') {
        const appPath = resolveAppPath(process.env.ANDROID_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }
    if (PLATFORM === 'ios') {
        const appPath = resolveAppPath(process.env.IOS_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }

    const deviceName = process.env[`${PLATFORM.toUpperCase()}_DEVICE_NAME`];
    if (deviceName) caps['appium:deviceName'] = deviceName;

    // UDID — resolved per session to support parallel devices
    const udid = resolveUdid(sessionId);
    if (udid) caps['appium:udid'] = udid;

    // iOS WDA port must be unique per parallel worker to avoid port conflicts
    if (PLATFORM === 'ios' && sessionId !== '0') {
        const basePort = parseInt(String(caps['appium:wdaLocalPort'] ?? '8101'), 10);
        caps['appium:wdaLocalPort'] = basePort + parseInt(sessionId, 10);
    }

    // Cache app identifier for DEEP_LINK (read once from caps at session creation time)
    if (!cachedAppId) {
        if (PLATFORM === 'android') cachedAppId = caps['appium:appPackage'] as string | undefined;
        if (PLATFORM === 'ios') cachedAppId = caps['appium:bundleId'] as string | undefined;
    }

    logger.info({ profile: CAP_PROFILE, platform: PLATFORM, sessionId, udid: udid ?? 'auto' }, '[Appium] Capabilities loaded');
    return caps;
}

// --- Configuration ---

const ACTION_TYPE_SEPARATOR = '||';

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// --- App identifier (resolved from capabilities; used by DEEP_LINK) ---

let cachedAppId: string | undefined;

function getAppId(): string {
    if (cachedAppId) return cachedAppId;
    // Env var override — useful when running without a full capability profile
    cachedAppId = PLATFORM === 'ios'
        ? (process.env.APP_BUNDLE_ID ?? 'com.omnipizza.app')
        : (process.env.APP_PACKAGE ?? 'com.omnipizza.app');
    return cachedAppId;
}

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    const capabilities = loadCapabilities(sessionId);
    const wdioOptions = {
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        logLevel: 'error' as const,
        // First-run bootstrap on a fresh simulator can take several minutes:
        // WDA xcodebuild + app install + WDA launch. WDIO's default 120 s
        // connection retry times out before that finishes and the session
        // never creates. Match the server-side wdaLaunchTimeout (4 min) with
        // some headroom for the app install step on top.
        connectionRetryTimeout: 360000,
        connectionRetryCount: 0,
        capabilities,
    };

    logger.info({ sessionId, platform: PLATFORM }, '[Appium] Bootstrapping session...');
    const driver = await remote(wdioOptions);
    sessions.set(sessionId, driver);
    logger.info({ sessionId, total: sessions.size }, '[Appium] Session created');
    return driver;
}

// --- Teardown Helper ---

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (driver) {
        await driver.deleteSession();
        sessions.delete(sessionId);
        logger.info(`[Appium] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }
}

async function dismissAndroidSystemDialog(driver: Browser): Promise<void> {
    if (PLATFORM !== 'android') return;

    const waitSelectors = [
        'id=android:id/aerr_wait',
        'android=new UiSelector().text("Wait")',
        'android=new UiSelector().text("Esperar")',
    ];

    for (const selector of waitSelectors) {
        try {
            const button = driver.$(selector);
            if (await (button.isDisplayed() as Promise<boolean>).catch(() => false)) {
                await (button.click() as Promise<void>);
                await new Promise((r) => setTimeout(r, 500));
                logger.warn({ selector }, '[Appium] Dismissed Android ANR dialog with Wait');
                return;
            }
        } catch { /* try next selector */ }
    }
}

// --- Scroll Helpers ---

/**
 * Find the first visible XCUIElementTypeScrollView so swipes can be scoped to
 * it. Without an element, `mobile: swipe` uses screen-center coordinates — on
 * checkout screens those land on card/zip TextInputs, and the gesture
 * re-focuses the input and reopens the keyboard, defeating the scroll. iOS
 * only; Android returns null and falls back to a screen-wide gesture.
 */
async function findScrollableAncestor(driver: Browser): Promise<string | null> {
    if (PLATFORM !== 'ios') return null;
    try {
        const scrollViews = await driver.$$('XCUIElementTypeScrollView').getElements();
        for (const sv of scrollViews) {
            const displayed = await (sv.isDisplayed() as Promise<boolean>).catch(() => false);
            if (displayed) return sv.elementId;
        }
    } catch { /* no scrollable ancestor available */ }
    return null;
}

async function swipeUp(driver: Browser): Promise<void> {
    const scrollEl = await findScrollableAncestor(driver);
    const args: Record<string, unknown> = { direction: 'up' };
    if (scrollEl) args.element = scrollEl;
    // Prefer `mobile: scroll` (programmatic XCUI scroll — no touch events, so
    // it cannot re-focus a TextInput and re-open the keyboard). WDIO v9
    // requires the single-object arg wrapped in a W3C args array here, so we
    // call executeScript. Fall back to `mobile: swipe` (touch-based) when
    // scroll is not supported by the WDA build.
    try {
        await driver.executeScript('mobile: scroll', [args]);
    } catch {
        await driver.executeScript('mobile: swipe', [args]);
    }
}

/**
 * Bulk-scroll version for CLICK. `mobile: scroll` only advances by a cell/page
 * fraction on RN ScrollViews, so fifteen calls still leave place-order below
 * the viewport on long checkout forms. `mobile: swipe` scrolls a full screen
 * per call. Safe for CLICK (keyboard is down and every input is already
 * filled, so a grazed TextInput re-focus is harmless). Don't call from TYPE —
 * there a mid-fill re-focus sends keystrokes to the wrong input.
 */
async function swipeUpBulk(driver: Browser): Promise<void> {
    const scrollEl = await findScrollableAncestor(driver);
    const args: Record<string, unknown> = { direction: 'up' };
    if (scrollEl) args.element = scrollEl;
    try {
        await driver.executeScript('mobile: swipe', [args]);
    } catch {
        await driver.executeScript('mobile: scroll', [args]);
    }
}

async function swipeUpW3C(driver: Browser, percent = 0.55): Promise<void> {
    const size = await driver.getWindowSize();
    const centerX = Math.round(size.width / 2);
    const startY = Math.round(size.height * 0.78);
    const endY = Math.round(size.height * Math.max(0.12, 0.78 - percent));

    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: centerX, y: startY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerMove', duration: 280, x: centerX, y: endY },
            { type: 'pointerUp', button: 0 },
        ],
    }]);
    await driver.releaseActions();
}

/**
 * Dismiss the on-screen keyboard. The tap-outside path is first because it is
 * the fastest reliable path on our iOS checkout inputs; native Appium commands
 * are kept as fallbacks because some WDA builds spend noticeable time probing
 * unsupported keyboard strategies.
 */
async function isKeyboardShown(driver: Browser): Promise<boolean> {
    if (PLATFORM !== 'ios') return false;
    try {
        const kb = driver.$('XCUIElementTypeKeyboard');
        return await (kb.isDisplayed() as Promise<boolean>).catch(() => false);
    } catch {
        return false;
    }
}

async function keyboardTopY(driver: Browser): Promise<number | null> {
    try {
        const kb = driver.$('XCUIElementTypeKeyboard');
        if (!(await (kb.isDisplayed() as Promise<boolean>).catch(() => false))) return null;
        const loc = await kb.getLocation();
        return loc.y;
    } catch {
        return null;
    }
}

async function waitForKeyboardState(driver: Browser, shown: boolean, timeoutMs = 900): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if ((await isKeyboardShown(driver)) === shown) return true;
        await new Promise((r) => setTimeout(r, 50));
    }
    return (await isKeyboardShown(driver)) === shown;
}

async function tapOutsideKeyboard(driver: Browser): Promise<void> {
    const size = await driver.getWindowSize();
    const kbTop = await keyboardTopY(driver);
    const safeY = kbTop === null ? 120 : Math.min(120, Math.max(80, kbTop - 40));
    await driver.executeScript('mobile: tap', [{
        x: Math.floor(size.width / 2),
        y: safeY,
    }]);
}

async function blurActiveTextInput(driver: Browser): Promise<void> {
    if (PLATFORM !== 'ios') return;
    try {
        const size = await driver.getWindowSize();
        await driver.executeScript('mobile: tap', [{
            x: Math.floor(size.width / 2),
            y: 150,
        }]);
        await new Promise((r) => setTimeout(r, 80));
    } catch { /* best effort */ }
}

/**
 * Stricter visibility check for iOS. XCUI's `isDisplayed` returns true for
 * elements that sit inside the window frame but are occluded by the on-screen
 * keyboard, so a tap based on `isDisplayed` alone can land on a keyboard key
 * while the previously focused input keeps the focus. Compare the target's
 * bottom edge against the keyboard's top edge and only trust `isDisplayed`
 * when no keyboard is up.
 */
async function isTrulyDisplayed(
    driver: Browser,
    target: ReturnType<Browser['$']>,
): Promise<boolean> {
    const displayed = await (target.isDisplayed() as Promise<boolean>).catch(() => false);
    if (PLATFORM !== 'ios') return displayed;
    const kbTop = await keyboardTopY(driver);
    try {
        const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (target.getSize() as Promise<{ width: number; height: number }>);
        const windowSize = await driver.getWindowSize();
        const safeBottom = (kbTop ?? windowSize.height) - 12;
        const centerX = loc.x + size.width / 2;
        const centerY = loc.y + size.height / 2;
        const frameCanReceiveTap = centerX > 0 &&
            centerX < windowSize.width &&
            centerY > 64 &&
            centerY < safeBottom;
        return frameCanReceiveTap;
    } catch {
        return displayed;
    }
}

async function isFrameInTapZone(
    driver: Browser,
    target: ReturnType<Browser['$']>,
): Promise<boolean> {
    if (PLATFORM !== 'ios') {
        return (target.isDisplayed() as Promise<boolean>).catch(() => false);
    }

    try {
        const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (target.getSize() as Promise<{ width: number; height: number }>);
        const windowSize = await driver.getWindowSize();
        const kbTop = await keyboardTopY(driver);
        const safeBottom = (kbTop ?? windowSize.height) - 16;
        const centerX = loc.x + size.width / 2;
        const centerY = loc.y + size.height / 2;
        return centerX > 0 &&
            centerX < windowSize.width &&
            centerY > 64 &&
            centerY < safeBottom;
    } catch {
        return false;
    }
}

async function tapElementCenter(
    driver: Browser,
    target: ReturnType<Browser['$']>,
): Promise<void> {
    const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
    const size = await (target.getSize() as Promise<{ width: number; height: number }>);
    const windowSize = await driver.getWindowSize();
    const centerX = Math.max(1, Math.min(windowSize.width - 1, loc.x + size.width / 2));
    const centerY = Math.max(65, Math.min(windowSize.height - 24, loc.y + size.height / 2));
    await driver.executeScript('mobile: tap', [{ x: centerX, y: centerY }]);
}

async function dismissKeyboard(driver: Browser): Promise<void> {
    if (PLATFORM !== 'ios') return;
    if (!(await isKeyboardShown(driver))) return;

    // Strategy 1: tap a neutral point above the keyboard. This matches the
    // working HideKeyboard behavior and avoids slower WDA hideKeyboard probing.
    try {
        await tapOutsideKeyboard(driver);
        if (await waitForKeyboardState(driver, false, 250)) return;
    } catch { /* try next */ }

    // Strategy 2: native Appium hideKeyboard. Depending on the WDA build, the
    // normal command or the iOS mobile extension may be available.
    try {
        const maybeDriver = driver as unknown as { hideKeyboard?: () => Promise<void> };
        if (typeof maybeDriver.hideKeyboard === 'function') {
            await maybeDriver.hideKeyboard();
            if (await waitForKeyboardState(driver, false, 250)) return;
        }
    } catch { /* try next */ }

    try {
        await driver.executeScript('mobile: hideKeyboard', [{ strategy: 'tapOutside' }]);
        if (await waitForKeyboardState(driver, false, 250)) return;
    } catch { /* try next */ }
}

/**
 * Android: atomic scroll-until-visible using UiAutomator's native UiScrollable.
 * Unlike a full-screen swipe, this advances the scrollable container exactly
 * enough to surface the target in the accessibility tree, so long RN
 * checkout forms don't overshoot past `input-card-holder` or `btn-place-order`.
 * Returns true when the selector was resolved to a UiSelector expression and
 * the native scrollIntoView call succeeded.
 */
async function scrollIntoViewAndroid(
    driver: Browser,
    selector: string,
): Promise<boolean> {
    if (PLATFORM !== 'android') return false;

    let innerSelector: string | undefined;
    if (selector.startsWith('~')) {
        innerSelector = `new UiSelector().description("${selector.slice(1)}")`;
    } else if (selector.startsWith('android=')) {
        innerSelector = selector.slice('android='.length);
    }
    if (!innerSelector) return false;

    const uiScrollable = `new UiScrollable(new UiSelector().scrollable(true).instance(0)).scrollIntoView(${innerSelector})`;
    try {
        await driver.$(`android=${uiScrollable}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Scroll `target` into genuinely visible territory. Uses `isTrulyDisplayed`
 * rather than `target.isDisplayed()` so an input occluded by the keyboard
 * doesn't satisfy the check — XCUI returns true for any element inside the
 * window frame regardless of occlusion, and a tap on an occluded element
 * lands on a keyboard key instead. Programmatic `mobile: scroll` inside
 * `swipeUp` avoids touch events that would re-focus a grazed TextInput.
 * The loop is intentionally capped and stops as soon as the target frame is
 * inside the tappable viewport, even when XCUI reports RN wrappers invisible.
 */
async function scrollIntoViewSafe(
    driver: Browser,
    target: ReturnType<Browser['$']>,
    selector: string,
    maxAttempts = 3,
): Promise<void> {
    if (await isFrameInTapZone(driver, target)) return;

    // Android: one precise UiScrollable call replaces the full-screen swipe
    // loop, which was overshooting and pushing card/place-order off-screen.
    if (PLATFORM === 'android') {
        if (await scrollIntoViewAndroid(driver, selector)) {
            if (await isFrameInTapZone(driver, target)) return;
        }
    }

    let displayed = await isTrulyDisplayed(driver, target);
    let attempts = 0;
    while (!displayed && attempts < maxAttempts) {
        try {
            await swipeUpBulk(driver);
        } catch {
            await swipeUpW3C(driver, 0.66);
        }
        displayed = await isFrameInTapZone(driver, target) || await isTrulyDisplayed(driver, target);
        attempts++;
    }
    // No throw here: for iOS `XCUIElementTypeOther` buttons (common in RN),
    // the page-source `visible` attribute is often false even after they've
    // scrolled into the viewport — `isTrulyDisplayed` can't tell the element
    // is actually tappable. A blind click via the accessibility id still
    // works in that case, and if the element truly isn't there the click
    // itself will throw with a precise error.
}

// --- Text Extraction ---

/**
 * Read the visible text of an element. When the app sets `accessibilityLabel`
 * equal to `testID` (a common anti-pattern), `getText()` returns the id
 * instead of the rendered text. In that case, fall back to the iOS `value`
 * attribute or a descendant StaticText that carries the actual string.
 */
async function readVisibleText(el: any): Promise<string> {
    const text = (await el.getText().catch(() => '')) as string;
    if (PLATFORM !== 'ios') return text;

    const id = (await el.getAttribute('name').catch(() => '')) as string;
    const labelShadowsId = text && id && text === id;
    if (!labelShadowsId) return text;

    const value = (await el.getAttribute('value').catch(() => '')) as string;
    if (value) return value;

    const childStatics = await el.$$('XCUIElementTypeStaticText').getElements().catch(() => []);
    for (const child of childStatics) {
        const childText = (await child.getText().catch(() => '')) as string;
        if (childText && childText !== id) return childText;
    }
    return text;
}

async function readEditableValue(el: any): Promise<string> {
    const value = (await el.getAttribute('value').catch(() => '')) as string;
    if (value) return value;
    return (await el.getText().catch(() => '')) as string;
}

function normalizeTypedValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

function isCardNumberSelector(selector: string): boolean {
    return selector.includes('input-card-number');
}

function isMaskedValue(value: string): boolean {
    return /^[•●*]+$/.test(value);
}

function typedValuesMatch(expected: string, actual: string, selector = ''): boolean {
    if (actual === expected) return true;
    if (isMaskedValue(actual)) {
        return actual.length === expected.length;
    }

    const expectedDigits = digitsOnly(expected);
    const actualDigits = digitsOnly(actual);
    if (isCardNumberSelector(selector) && expectedDigits.length >= 12) {
        return actualDigits === expectedDigits ||
            actualDigits === expectedDigits.slice(-4);
    }

    return expectedDigits.length > 0 &&
        expectedDigits === actualDigits &&
        expectedDigits.length >= Math.min(4, expected.length);
}

function shouldVerifyTypedText(text: string, selector = ''): boolean {
    if (PLATFORM !== 'ios') return false;
    if (/[A-Za-z]/.test(text)) return true;
    if (isCardNumberSelector(selector)) return true;
    return /^\d{3,}$/.test(text);
}

async function clearAndFocus(target: ReturnType<Browser['$']>): Promise<void> {
    await (target.clearValue() as Promise<void>).catch(() => undefined);
    await (target.click() as Promise<void>);
}

async function typeTextIntoTarget(
    driver: Browser,
    target: ReturnType<Browser['$']>,
    text: string,
    selector = '',
): Promise<void> {
    await (target.setValue(text) as Promise<void>);
    if (!shouldVerifyTypedText(text, selector)) return;

    const expected = normalizeTypedValue(text);
    let actual = normalizeTypedValue(await readEditableValue(target));
    if (typedValuesMatch(expected, actual, selector)) return;

    // iOS occasionally truncates strings containing spaces through setValue
    // (for example "123 Luxury Avenue" becoming "1Avenue"). Retype through
    // the focused keyboard path before we move on to the next field.
    try {
        await clearAndFocus(target);
        await driver.executeScript('mobile: type', [{ text }]);
        actual = normalizeTypedValue(await readEditableValue(target));
        if (typedValuesMatch(expected, actual, selector)) return;
    } catch { /* fall through to W3C keys */ }

    try {
        await clearAndFocus(target);
        await driver.keys(text.split('') as any);
        actual = normalizeTypedValue(await readEditableValue(target));
        if (typedValuesMatch(expected, actual, selector)) return;
    } catch { /* fall through to chunked addValue */ }

    await clearAndFocus(target);
    for (const chunk of text.match(/\S+|\s+/g) ?? [text]) {
        await (target.addValue(chunk) as Promise<void>);
        await new Promise((r) => setTimeout(r, 50));
    }

    actual = normalizeTypedValue(await readEditableValue(target));
    if (!typedValuesMatch(expected, actual, selector)) {
        throw new Error(`[TYPE] iOS text entry mismatch: expected "${text}", got "${actual}"`);
    }
}

// --- Intent → Handler Map ---

const actionHandlers: ReadonlyMap<string, ActionHandler> = new Map([
    [
        'NAVIGATE',
        async (_driver, url) => {
            await _driver.url(url);
            return `Navigated to ${url}`;
        },
    ],
    [
        /**
         * DEEP_LINK — navigate directly to a screen via the omnipizza:// URI scheme.
         *
         * Target format: full URI or path-only (scheme is prepended automatically)
         *   omnipizza://checkout?hydrateCart=true&market=US
         *   checkout?hydrateCart=true&market=US        ← scheme added if missing
         *
         * Supported universal params (pass in the URI query string):
         *   market=US|MX|CH|JP   set country context
         *   lang=de|fr           override language (CH only)
         *   resetSession=true    clear auth state and navigate to login
         *
         * Supported routes:
         *   omnipizza://login
         *   omnipizza://catalog
         *   omnipizza://pizza-builder?pizzaId=<id>&size=<size>
         *   omnipizza://checkout?hydrateCart=true
         *   omnipizza://order-success?orderId=<id>
         *   omnipizza://profile
         *
         * Platform dispatch:
         *   iOS     → mobile: deepLink  { url, bundleId }
         *   Android → mobile: deepLink  { url, package }
         */
        'DEEP_LINK',
        async (_driver, rawUrl) => {
            const url = rawUrl.startsWith('omnipizza://') ? rawUrl : `omnipizza://${rawUrl}`;
            const appId = getAppId();

            if (PLATFORM === 'ios') {
                await _driver.executeScript('mobile: deepLink', [{ url, bundleId: appId }]);
            } else {
                await _driver.executeScript('mobile: deepLink', [{ url, package: appId }]);
            }

            logger.debug({ url, appId, platform: PLATFORM }, '[Appium] Deep link processed');
            return `Deep linked to: ${url}`;
        },
    ],
    [
        'SWITCH_CONTEXT',
        async (_driver, contextName) => {
            const contexts = await _driver.getContexts() as string[];
            if (contextName === 'WEBVIEW') {
                const webview = contexts.find((c) => c.startsWith('WEBVIEW_'));
                if (!webview) {
                    throw new Error(`No WebView context found. Available: ${contexts.join(', ')}`);
                }
                await _driver.switchContext(webview);
                return `Switched to context: ${webview}`;
            }
            const target = contextName === 'NATIVE' ? 'NATIVE_APP' : contextName;
            await _driver.switchContext(target);
            return `Switched to context: ${target}`;
        },
    ],
    [
        'HIDE_KEYBOARD',
        async (_driver) => {
            await dismissKeyboard(_driver);
            return 'Keyboard dismissed';
        },
    ],
    [
        'CLICK',
        async (_driver, selector) => {
            const t0 = Date.now();
            const dbg = (phase: string) => process.stderr.write(`[Appium-DBG] CLICK ${selector} ${phase} t+${Date.now() - t0}ms\n`);
            dbg('enter');
            const target = _driver.$(selector);
            // Dismiss first so the click can't land on a keyboard key. On
            // the checkout page XCUI's isDisplayed returns true for the
            // place-order button even when occluded by the keyboard, so a
            // tap at the button's hit-point would land on a keyboard key
            // and the test would navigate (or not) based on whatever key
            // sat under that coordinate — a false-positive pass before,
            // now a real failure that we can scroll past by dismissing.
            await dismissKeyboard(_driver);
            await blurActiveTextInput(_driver);
            dbg('post-dismiss');
            await scrollIntoViewSafe(_driver, target, selector);
            dbg('post-scroll');
            // The scroll loop uses touch-based `mobile: swipe` which can graze
            // a TextInput and reopen the keyboard. Dismiss again here so the
            // tap dispatched below is guaranteed to land on the visible target
            // instead of on a keyboard key.
            await dismissKeyboard(_driver);
            dbg('post-dismiss2');
            if (PLATFORM === 'ios') {
                // Long RN checkout forms push btn-place-order below the
                // 780 px viewport even after max scroll. `target.click()`
                // dispatches the tap at the element's real frame centre,
                // so an off-viewport y lands on system chrome and the app
                // never sees the gesture. Read the element's frame and, if
                // its centre sits below the last visible row, tap at the
                // x-centre with y clamped just inside the viewport — RN's
                // Pressable fires as long as the touch is within its
                // hit-slop, which on the place-order button covers the
                // full row width.
                try {
                    const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
                    const size = await (target.getSize() as Promise<{ width: number; height: number }>);
                    const centerX = loc.x + size.width / 2;
                    const centerY = loc.y + size.height / 2;
                    process.stderr.write(`[Appium-DBG] CLICK ${selector} frame=(${loc.x},${loc.y},${size.width}x${size.height}) center=(${centerX},${centerY})\n`);
                    const windowSize = await _driver.getWindowSize();
                    const VIEWPORT_BOTTOM = Math.min(windowSize.height - 90, 780);
                    if (selector.includes('btn-place-order') || centerY > VIEWPORT_BOTTOM) {
                        const clampedY = Math.min(Math.max(65, centerY), VIEWPORT_BOTTOM - 10);
                        process.stderr.write(`[Appium-DBG] CLICK ${selector} tap-clamped at (${centerX},${clampedY})\n`);
                        await _driver.executeScript('mobile: tap', [{ x: centerX, y: clampedY }]);
                        dbg('post-click(clamped)');
                        return `Tapped (clamped) on mobile element: ${selector}`;
                    }
                    await tapElementCenter(_driver, target);
                    dbg('post-click(coords)');
                    return `Tapped on mobile element by coordinates: ${selector}`;
                } catch (err) {
                    process.stderr.write(`[Appium-DBG] CLICK ${selector} frame lookup failed: ${(err as Error).message}\n`);
                }
            }
            await (target.click() as Promise<void>);
            dbg('post-click');
            return `Tapped on mobile element: ${selector}`;
        },
    ],
    [
        'TYPE',
        async (_driver, composite) => {
            const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

            if (sepIndex === -1) {
                throw new Error("TYPE action requires 'selector||text' format.");
            }

            const selector = composite.slice(0, sepIndex);
            const text = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);

            if (!text) {
                throw new Error("TYPE action requires non-empty text after 'selector||'.");
            }

            const target = _driver.$(selector);
            await scrollIntoViewSafe(_driver, target, selector, 5);
            if (!(await isFrameInTapZone(_driver, target))) {
                await dismissKeyboard(_driver);
                await scrollIntoViewSafe(_driver, target, selector, 3);
            }
            await (target.click() as Promise<void>);
            if (PLATFORM === 'android') {
                // Prefer setValue — it clears the field first and types the
                // full string atomically, so masked inputs (expiry MM/YY,
                // cvv) can't auto-advance focus mid-fill. Fall back to W3C
                // keys() only when the element id goes stale between click
                // and setValue, which happens for RN masked fields that
                // remount on focus (card-number with its compound
                // className+description selector). keys() types into the
                // focused element without needing element resolution, at the
                // cost of character-by-character delivery that short masked
                // inputs can truncate — so we only use it as a fallback.
                try {
                    await typeTextIntoTarget(_driver, target, text, selector);
                } catch (err) {
                    const msg = (err as Error).message || '';
                    if (/wasn't found|NoSuchElement/i.test(msg)) {
                        process.stderr.write(`[Appium-DBG] TYPE ${selector} setValue stale, retrying via keys(): ${msg}\n`);
                        await _driver.keys(text);
                    } else {
                        throw err;
                    }
                }
            } else {
                await typeTextIntoTarget(_driver, target, text, selector);
            }
            await dismissKeyboard(_driver);
            return `Typed text into mobile element: ${selector}`;
        },
    ],
    [
        'READ_TEXT',
        async (_driver, selector) => {
            const elements = _driver.$$(selector);
            const texts: string[] = [];
            for (const el of await elements.getElements()) {
                texts.push(await readVisibleText(el));
            }
            return texts.join('\n');
        },
    ],
    [
        /**
         * WAIT_FOR_ELEMENT — waits until an element is displayed.
         *
         * Target format: selector  OR  selector||timeoutMs
         *   ~checkout-total                  (5 000 ms default)
         *   ~checkout-total||10000           (10 s explicit timeout)
         */
        'WAIT_FOR_ELEMENT',
        async (_driver, composite) => {
            const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);
            const selector = sepIndex === -1 ? composite : composite.slice(0, sepIndex);
            const timeoutMs = sepIndex === -1
                ? 5000
                : parseInt(composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length), 10);

            try {
                await _driver.$(selector).waitForDisplayed({ timeout: timeoutMs });
            } catch (err) {
                // Dump a slice of the live page source so we can see which
                // testIDs actually exist on the screen at the moment the wait
                // failed — cheaper than guessing from the minified JS bundle.
                try {
                    const src = await _driver.getPageSource();
                    process.stderr.write(`[Appium-DBG] WAIT_FOR_ELEMENT ${selector} timeout — pageSource head:\n${src.slice(0, 60000)}\n[Appium-DBG] end pageSource\n`);
                } catch (dumpErr) {
                    process.stderr.write(`[Appium-DBG] WAIT_FOR_ELEMENT ${selector} timeout — pageSource dump failed: ${(dumpErr as Error).message}\n`);
                }
                throw err;
            }
            return `Element displayed: ${selector}`;
        },
    ],
    [
        /**
         * ASSERT_TEXT — asserts an element's text matches the expected value.
         *
         * Target format: selector||expectedText
         *   ~order-id-label||ORDER-ABC123
         *
         * Throws on mismatch so the proxy propagates a test failure.
         */
        'ASSERT_TEXT',
        async (_driver, composite) => {
            const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

            if (sepIndex === -1) {
                throw new Error("ASSERT_TEXT action requires 'selector||expectedText' format.");
            }

            const selector = composite.slice(0, sepIndex);
            const expected = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);
            const actual = await _driver.$(selector).getText();

            if (actual !== expected) {
                throw new Error(
                    `[ASSERT_TEXT] Mismatch on "${selector}": expected "${expected}", got "${actual}"`,
                );
            }

            return actual;
        },
    ],
    [
        /**
         * SCROLL_TO — scrolls the element into view.
         *
         * Target format: selector
         *   ~place-order-button
         */
        'SCROLL_TO',
        async (_driver, selector) => {
            await _driver.$(selector).scrollIntoView();
            return `Scrolled to: ${selector}`;
        },
    ],
    [
        'EVALUATE',
        async (_driver, script) => {
            const result = await _driver.execute(script);
            return result !== undefined ? String(result) : '';
        },
    ],
    [
        'TEARDOWN',
        async () => {
            return 'Appium execution environment terminated securely.';
        },
    ],
]);

// --- Public API ---

export async function teardownAllSessions(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map(teardown));
    logger.info('[Appium] All sessions closed');
}

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();
    const handler = actionHandlers.get(normalizedAction);

    if (!handler) {
        throw new Error(`Unsupported Appium actionId: ${actionId}`);
    }

    // TEARDOWN is session-scoped — skip ensureSession to avoid booting a driver just to close it
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Appium execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);
    await dismissAndroidSystemDialog(driver);
    const result = await handler(driver, targetSelector);
    await dismissAndroidSystemDialog(driver);
    return result;
}
