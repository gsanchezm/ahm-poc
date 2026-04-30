import { ActionHandler } from '../ActionHandler';
import { parseSelectorTimeout } from '../parseCompositeTarget';
import { AppiumActionContext } from './AppiumActionContext';

export const WaitForElementAction: ActionHandler<AppiumActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ driver, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);

        try {
            await driver.$(selector).waitForDisplayed({ timeout: timeoutMs });
        } catch (err) {
            try {
                const src = await driver.getPageSource();
                process.stderr.write(
                    `[Appium-DBG] WAIT_FOR_ELEMENT ${selector} timeout — pageSource head:\n${src.slice(0, 60000)}\n[Appium-DBG] end pageSource\n`,
                );
            } catch (dumpErr) {
                process.stderr.write(
                    `[Appium-DBG] WAIT_FOR_ELEMENT ${selector} timeout — pageSource dump failed: ${(dumpErr as Error).message}\n`,
                );
            }
            throw err;
        }
        return `Element displayed: ${selector}`;
    },
};
