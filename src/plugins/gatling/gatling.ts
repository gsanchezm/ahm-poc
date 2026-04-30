// NOTE: @gatling.io/core and @gatling.io/http must NOT be imported here.
// Those packages call Java.type() at load time and only work inside the
// Gatling JVM runner (gatling-js-bundle). This server runs in plain Node.js.
// All simulations are executed as subprocesses via runSimulation().

import {
    defaultPerformanceParser,
    defaultPerformanceRunner,
} from '../actions/performance/PerformanceActionContext';
import { getPerformanceActionRegistry } from '../actions/performance/registerPerformanceActions';

const registry = getPerformanceActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    return registry.execute(normalizedAction, {
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        runner: defaultPerformanceRunner,
        parser: defaultPerformanceParser,
        metadata: { plugin: 'gatling' },
    });
}
