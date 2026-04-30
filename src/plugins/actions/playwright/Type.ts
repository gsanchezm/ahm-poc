import { ActionHandler } from '../ActionHandler';
import { parseSelectorValue } from '../parseCompositeTarget';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const TypeAction: ActionHandler<PlaywrightActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await page.fill(selector, value);
        return `Typed text into element: ${selector}`;
    },
};
