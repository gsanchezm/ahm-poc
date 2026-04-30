import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const NavigateAction: ActionHandler<AppiumActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated to ${target}`;
    },
};
