import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const EvaluateAction: ActionHandler<AppiumActionContext> = {
    name: 'EVALUATE',
    async execute({ driver, target }) {
        const result = await driver.execute(target);
        return result !== undefined ? String(result) : '';
    },
};
