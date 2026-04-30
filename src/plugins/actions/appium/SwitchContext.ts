import { ActionHandler } from '../ActionHandler';
import { AppiumActionContext } from './AppiumActionContext';

export const SwitchContextAction: ActionHandler<AppiumActionContext> = {
    name: 'SWITCH_CONTEXT',
    async execute({ driver, target }) {
        const contexts = await driver.getContexts() as string[];
        if (target === 'WEBVIEW') {
            const webview = contexts.find((c) => c.startsWith('WEBVIEW_'));
            if (!webview) {
                throw new Error(`No WebView context found. Available: ${contexts.join(', ')}`);
            }
            await driver.switchContext(webview);
            return `Switched to context: ${webview}`;
        }
        const dest = target === 'NATIVE' ? 'NATIVE_APP' : target;
        await driver.switchContext(dest);
        return `Switched to context: ${dest}`;
    },
};
