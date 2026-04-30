import { ActionRegistry } from '../ActionRegistry';
import { PerformanceActionContext } from './PerformanceActionContext';
import { RunSimulationAction } from './RunSimulation';
import { RunCheckoutLoadAction } from './RunCheckoutLoad';
import { ParseGatlingStatsAction } from './ParseGatlingStats';
import { ValidateThresholdsAction } from './ValidateThresholds';

const JVM_ONLY_MESSAGE =
    'This action requires the Gatling JVM context and cannot run inside the gRPC plugin server. ' +
    'Use RUN_CHECKOUT_LOAD or RUN_SIMULATION to trigger simulations as subprocesses.';

let cachedRegistry: ActionRegistry<PerformanceActionContext> | null = null;

export function getPerformanceActionRegistry(): ActionRegistry<PerformanceActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<PerformanceActionContext>({ plugin: 'gatling' });
    registry
        .register(RunCheckoutLoadAction)
        .register(RunSimulationAction)
        .register(ParseGatlingStatsAction)
        .register(ValidateThresholdsAction);

    // SCENARIO_LOAD / INJECT_LOAD remain registered as JVM-only stubs so the
    // error surfaces from the registry rather than as "Unsupported actionId".
    registry.register({
        name: 'SCENARIO_LOAD',
        async execute() { throw new Error(JVM_ONLY_MESSAGE); },
    });
    registry.register({
        name: 'INJECT_LOAD',
        async execute() { throw new Error(JVM_ONLY_MESSAGE); },
    });

    cachedRegistry = registry;
    return registry;
}

export function resetPerformanceActionRegistry(): void {
    cachedRegistry = null;
}
