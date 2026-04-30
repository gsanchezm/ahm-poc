import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const HideKeyboardAction: ActionHandler<AppiumActionContext> = {
    name: 'HIDE_KEYBOARD',
    async execute({ driver, helpers }) {
        await helpers.dismissKeyboard(driver);
        return 'Keyboard dismissed';
    },
};
