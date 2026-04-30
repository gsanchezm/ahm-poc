import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const ClickAction: ActionHandler<AppiumActionContext> = {
    name: 'CLICK',
    async execute({ driver, target, platform, helpers }) {
        const t0 = Date.now();
        const dbg = (phase: string) =>
            process.stderr.write(`[Appium-DBG] CLICK ${target} ${phase} t+${Date.now() - t0}ms\n`);
        dbg('enter');
        const element = driver.$(target);
        // Dismiss first so the click can't land on a keyboard key. On the
        // checkout page XCUI's isDisplayed returns true for buttons that
        // sit under the keyboard, so a tap at the button's hit-point would
        // land on a keyboard key.
        await helpers.dismissKeyboard(driver);
        await helpers.blurActiveTextInput(driver);
        dbg('post-dismiss');
        await helpers.scrollIntoViewSafe(driver, element, target);
        dbg('post-scroll');
        // The scroll loop uses touch-based `mobile: swipe` which can graze
        // a TextInput and reopen the keyboard. Dismiss again before the tap.
        await helpers.dismissKeyboard(driver);
        dbg('post-dismiss2');

        if (platform === 'ios') {
            try {
                const loc = await (element.getLocation() as Promise<{ x: number; y: number }>);
                const size = await (element.getSize() as Promise<{ width: number; height: number }>);
                const centerX = loc.x + size.width / 2;
                const centerY = loc.y + size.height / 2;
                process.stderr.write(
                    `[Appium-DBG] CLICK ${target} frame=(${loc.x},${loc.y},${size.width}x${size.height}) center=(${centerX},${centerY})\n`,
                );
                const windowSize = await driver.getWindowSize();
                const VIEWPORT_BOTTOM = Math.min(windowSize.height - 90, 780);
                if (target.includes('btn-place-order') || centerY > VIEWPORT_BOTTOM) {
                    const clampedY = Math.min(Math.max(65, centerY), VIEWPORT_BOTTOM - 10);
                    process.stderr.write(`[Appium-DBG] CLICK ${target} tap-clamped at (${centerX},${clampedY})\n`);
                    await driver.executeScript('mobile: tap', [{ x: centerX, y: clampedY }]);
                    dbg('post-click(clamped)');
                    return `Tapped (clamped) on mobile element: ${target}`;
                }
                await helpers.tapElementCenter(driver, element);
                dbg('post-click(coords)');
                return `Tapped on mobile element by coordinates: ${target}`;
            } catch (err) {
                process.stderr.write(`[Appium-DBG] CLICK ${target} frame lookup failed: ${(err as Error).message}\n`);
            }
        }

        await (element.click() as Promise<void>);
        dbg('post-click');
        return `Tapped on mobile element: ${target}`;
    },
};
