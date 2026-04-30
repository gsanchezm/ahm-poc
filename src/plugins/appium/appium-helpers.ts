// Defensive helpers extracted from the original appium.ts so the action
// handlers can reuse them without bloating the main plugin file. Behavior
// is intentionally preserved verbatim — keyboard occlusion checks, iOS
// truly-displayed heuristics, masked-input typing, Android UiScrollable,
// system-dialog dismissal etc. are all platform-tuned and changing them
// reintroduces bugs we already paid for.

import type { Browser } from 'webdriverio';
import { logger } from '../../utils/logger';

export const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();

// --- App identifier (resolved from capabilities; used by DEEP_LINK) ---

let cachedAppId: string | undefined;

export function setCachedAppId(value: string | undefined): void {
    if (value && !cachedAppId) cachedAppId = value;
}

export function getAppId(): string {
    if (cachedAppId) return cachedAppId;
    cachedAppId = PLATFORM === 'ios'
        ? (process.env.APP_BUNDLE_ID ?? 'com.omnipizza.app')
        : (process.env.APP_PACKAGE ?? 'com.omnipizza.app');
    return cachedAppId;
}

// --- Android system dialog dismissal ---

export async function dismissAndroidSystemDialog(driver: Browser): Promise<void> {
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

// --- Scroll helpers ---

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

// --- Keyboard handling ---

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

export async function blurActiveTextInput(driver: Browser): Promise<void> {
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

export async function dismissKeyboard(driver: Browser): Promise<void> {
    if (PLATFORM !== 'ios') return;
    if (!(await isKeyboardShown(driver))) return;

    try {
        await tapOutsideKeyboard(driver);
        if (await waitForKeyboardState(driver, false, 250)) return;
    } catch { /* try next */ }

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

// --- Tap-zone safety ---

async function isTrulyDisplayed(driver: Browser, target: any): Promise<boolean> {
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
        return centerX > 0 && centerX < windowSize.width && centerY > 64 && centerY < safeBottom;
    } catch {
        return displayed;
    }
}

export async function isFrameInTapZone(driver: Browser, target: any): Promise<boolean> {
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
        return centerX > 0 && centerX < windowSize.width && centerY > 64 && centerY < safeBottom;
    } catch {
        return false;
    }
}

export async function tapElementCenter(driver: Browser, target: any): Promise<void> {
    const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
    const size = await (target.getSize() as Promise<{ width: number; height: number }>);
    const windowSize = await driver.getWindowSize();
    const centerX = Math.max(1, Math.min(windowSize.width - 1, loc.x + size.width / 2));
    const centerY = Math.max(65, Math.min(windowSize.height - 24, loc.y + size.height / 2));
    await driver.executeScript('mobile: tap', [{ x: centerX, y: centerY }]);
}

// --- Android UiScrollable ---

async function scrollIntoViewAndroid(driver: Browser, selector: string): Promise<boolean> {
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

export async function scrollIntoViewSafe(
    driver: Browser,
    target: any,
    selector: string,
    maxAttempts = 3,
): Promise<void> {
    if (await isFrameInTapZone(driver, target)) return;

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
}

// --- Text extraction ---

export async function readVisibleText(el: any): Promise<string> {
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
        return actualDigits === expectedDigits || actualDigits === expectedDigits.slice(-4);
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

async function clearAndFocus(target: any): Promise<void> {
    await (target.clearValue() as Promise<void>).catch(() => undefined);
    await (target.click() as Promise<void>);
}

export async function typeTextIntoTarget(
    driver: Browser,
    target: any,
    text: string,
    selector = '',
): Promise<void> {
    await (target.setValue(text) as Promise<void>);
    if (!shouldVerifyTypedText(text, selector)) return;

    const expected = normalizeTypedValue(text);
    let actual = normalizeTypedValue(await readEditableValue(target));
    if (typedValuesMatch(expected, actual, selector)) return;

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

// Bundled helper object used as ActionContext.helpers in handlers.
export const appiumHelpers = {
    dismissKeyboard,
    dismissAndroidSystemDialog,
    scrollIntoViewSafe,
    isFrameInTapZone,
    tapElementCenter,
    typeTextIntoTarget,
    readVisibleText,
    getAppId,
    blurActiveTextInput,
};

export type AppiumHelpers = typeof appiumHelpers;
