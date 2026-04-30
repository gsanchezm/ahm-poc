import { ActionHandler } from '../ActionHandler';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const ScrollToAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await page.locator(target).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
