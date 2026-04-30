import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const ReadTextAction: ActionHandler<AppiumActionContext> = {
    name: 'READ_TEXT',
    async execute({ driver, target, helpers }) {
        const elements = driver.$$(target);
        const texts: string[] = [];
        for (const el of await elements.getElements()) {
            texts.push(await helpers.readVisibleText(el));
        }
        return texts.join('\n');
    },
};
