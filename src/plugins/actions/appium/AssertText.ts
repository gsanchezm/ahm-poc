import { ActionHandler } from '../ActionHandler';
import { parseSelectorValue } from '../parseCompositeTarget';
import { AppiumActionContext } from './AppiumActionContext';

export const AssertTextAction: ActionHandler<AppiumActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ driver, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const actual = await driver.$(selector).getText();
        if (actual !== expected) {
            throw new Error(
                `[ASSERT_TEXT] Mismatch on "${selector}": expected "${expected}", got "${actual}"`,
            );
        }
        return actual;
    },
};
