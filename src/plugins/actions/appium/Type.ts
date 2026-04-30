import { ActionHandler } from '../ActionHandler';
import { parseSelectorValue } from '../parseCompositeTarget';
import { AppiumActionContext } from './AppiumActionContext';

export const TypeAction: ActionHandler<AppiumActionContext> = {
    name: 'TYPE',
    async execute({ driver, target, platform, helpers }) {
        const { selector, value: text } = parseSelectorValue(target, 'TYPE action');

        const element = driver.$(selector);
        await helpers.scrollIntoViewSafe(driver, element, selector, 5);
        if (!(await helpers.isFrameInTapZone(driver, element))) {
            await helpers.dismissKeyboard(driver);
            await helpers.scrollIntoViewSafe(driver, element, selector, 3);
        }
        await (element.click() as Promise<void>);

        if (platform === 'android') {
            // setValue-first to keep masked-input fields atomic; fall back
            // to W3C keys() only when the element id goes stale between
            // click and setValue (RN compound selectors that remount).
            try {
                await helpers.typeTextIntoTarget(driver, element, text, selector);
            } catch (err) {
                const msg = (err as Error).message || '';
                if (/wasn't found|NoSuchElement/i.test(msg)) {
                    process.stderr.write(`[Appium-DBG] TYPE ${selector} setValue stale, retrying via keys(): ${msg}\n`);
                    await driver.keys(text);
                } else {
                    throw err;
                }
            }
        } else {
            await helpers.typeTextIntoTarget(driver, element, text, selector);
        }
        await helpers.dismissKeyboard(driver);
        return `Typed text into mobile element: ${selector}`;
    },
};
