import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await driver.$(target).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
