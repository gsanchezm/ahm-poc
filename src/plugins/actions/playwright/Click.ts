import { ActionHandler } from '../ActionHandler';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const ClickAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await page.click(target);
        return `Click executed on element: ${target}`;
    },
};
