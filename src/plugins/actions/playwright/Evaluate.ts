import { ActionHandler } from '../ActionHandler';
import { PlaywrightActionContext } from './PlaywrightActionContext';

export const EvaluateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'EVALUATE',
    async execute({ page, target }) {
        const result = await page.evaluate(target);
        return result !== undefined ? String(result) : '';
    },
};
