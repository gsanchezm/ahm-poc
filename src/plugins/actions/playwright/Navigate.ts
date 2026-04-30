import { ActionHandler } from '../ActionHandler';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const NavigateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'NAVIGATE',
    async execute({ page, target }) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return `Navigated successfully to ${target}`;
    },
};
