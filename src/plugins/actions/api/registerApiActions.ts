import { ActionRegistry } from '../ActionRegistry';
import { ApiActionContext } from './ApiActionContext';
import {
    HttpDeleteAction,
    HttpGetAction,
    HttpPatchAction,
    HttpPostAction,
    HttpPutAction,
} from './ExecuteHttpRequest';
import { ExecuteContractEndpointAction } from './ExecuteContractEndpoint';
import { ValidateContractEndpointAction } from './ValidateContractEndpoint';

let cachedRegistry: ActionRegistry<ApiActionContext> | null = null;

export function getApiActionRegistry(): ActionRegistry<ApiActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<ApiActionContext>({ plugin: 'api' });
    registry
        .register(HttpGetAction)
        .register(HttpPostAction)
        .register(HttpPutAction)
        .register(HttpPatchAction)
        .register(HttpDeleteAction)
        .register(ExecuteContractEndpointAction)
        .register(ValidateContractEndpointAction)
        // Backwards-compatible alias used by some scenarios.
        .alias('EXECUTE_CONTRACT_ENDPOINT', 'EXECUTE_API_CONTRACT');

    cachedRegistry = registry;
    return registry;
}

export function resetApiActionRegistry(): void {
    cachedRegistry = null;
}
