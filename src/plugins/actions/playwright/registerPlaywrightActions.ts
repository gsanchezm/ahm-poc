import { ActionRegistry } from '../ActionRegistry';
import { PlaywrightActionContext } from './PlaywrightActionContext';
import { NavigateAction } from './Navigate';
import { ClickAction } from './Click';
import { TypeAction } from './Type';
import { ReadTextAction } from './ReadText';
import { WaitForElementAction } from './WaitForElement';
import { AssertTextAction } from './AssertText';
import { ScrollToAction } from './ScrollTo';
import { EvaluateAction } from './Evaluate';

let cachedRegistry: ActionRegistry<PlaywrightActionContext> | null = null;

export function getPlaywrightActionRegistry(): ActionRegistry<PlaywrightActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<PlaywrightActionContext>({ plugin: 'playwright' });
    registry
        .register(NavigateAction)
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

export function resetPlaywrightActionRegistry(): void {
    cachedRegistry = null;
}
