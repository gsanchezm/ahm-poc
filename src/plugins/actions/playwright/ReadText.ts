import { ActionHandler } from '../ActionHandler';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const ReadTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'READ_TEXT',
    async execute({ page, target }) {
        const texts = await page.locator(target).allTextContents();
        return texts.join('\n');
    },
};
