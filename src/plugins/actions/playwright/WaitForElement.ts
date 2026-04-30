import { ActionHandler } from '../ActionHandler';
import { parseSelectorTimeout } from '../parseCompositeTarget';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
