import { ActionRegistry } from '../ActionRegistry';
import { AppiumActionContext } from './AppiumActionContext';
import { NavigateAction } from './Navigate';
import { DeepLinkAction } from './DeepLink';
import { SwitchContextAction } from './SwitchContext';
import { HideKeyboardAction } from './HideKeyboard';
import { ClickAction } from './Click';
import { TypeAction } from './Type';
import { ReadTextAction } from './ReadText';
import { WaitForElementAction } from './WaitForElement';
import { AssertTextAction } from './AssertText';
import { ScrollToAction } from './ScrollTo';
import { EvaluateAction } from './Evaluate';

let cachedRegistry: ActionRegistry<AppiumActionContext> | null = null;

export function getAppiumActionRegistry(): ActionRegistry<AppiumActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<AppiumActionContext>({ plugin: 'appium' });
    registry
        .register(NavigateAction)
        .register(DeepLinkAction)
        .register(SwitchContextAction)
        .register(HideKeyboardAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(ReadTextAction)
        .register(WaitForElementAction)
        .register(AssertTextAction)
        .register(ScrollToAction)
        .register(EvaluateAction);

    cachedRegistry = registry;
    return registry;
}

export function resetAppiumActionRegistry(): void {
    cachedRegistry = null;
}
