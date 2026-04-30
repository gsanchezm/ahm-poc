// Composite target parsers shared by every plugin registry.
// All composite targets use "||" as the separator. The Playwright,
// Appium, API and Performance handlers rely on these helpers so the
// parsing rules stay consistent across plugins.

export const ACTION_TYPE_SEPARATOR = '||';

export interface SelectorValue {
    selector: string;
    value: string;
}

export interface SelectorTimeout {
    selector: string;
    timeoutMs: number;
}

export interface ContractTarget {
    feature: string;
    endpointId: string;
    variables: Record<string, unknown>;
}

export interface SimulationTarget {
    simulation: string;
    config: Record<string, unknown>;
}

/** Split "selector||value". Throws when value is missing/empty. */
export function parseSelectorValue(target: string, actionLabel = 'action'): SelectorValue {
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) {
        throw new Error(`${actionLabel} requires 'selector||value' format. Got: '${maskTail(target)}'`);
    }
    const selector = target.slice(0, sepIndex);
    const value = target.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);
    if (!value) {
        throw new Error(`${actionLabel} requires non-empty value after 'selector||'.`);
    }
    return { selector, value };
}

/** Split "selector[||timeoutMs]". Falls back to defaultTimeoutMs when absent. */
export function parseSelectorTimeout(target: string, defaultTimeoutMs = 5000): SelectorTimeout {
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) {
        return { selector: target, timeoutMs: defaultTimeoutMs };
    }
    const selector = target.slice(0, sepIndex);
    const tail = target.slice(sepIndex + ACTION_TYPE_SEPARATOR.length).trim();
    const parsed = parseInt(tail, 10);
    const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTimeoutMs;
    return { selector, timeoutMs };
}

/**
 * Parse "feature||endpointId||{json}" used for API contract execution.
 * The JSON payload is optional and represents template variables.
 */
export function parseContractTarget(target: string): ContractTarget {
    const parts = target.split(ACTION_TYPE_SEPARATOR);
    if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error(
            `Contract action requires 'feature||endpointId[||{variables}]' format. Got: '${maskTail(target)}'`,
        );
    }
    const [feature, endpointId, ...rest] = parts;
    const variables = rest.length > 0 ? parseJsonOrThrow(rest.join(ACTION_TYPE_SEPARATOR), 'variables') : {};
    return { feature, endpointId, variables };
}

/**
 * Parse "simulationName||{json}" used for generic Performance simulations.
 * The JSON payload is optional and represents simulation config (users, durationSeconds, …).
 */
export function parseSimulationTarget(target: string): SimulationTarget {
    if (!target) {
        throw new Error("Performance action requires 'simulationName[||{config}]' format.");
    }
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) {
        return { simulation: target, config: {} };
    }
    const simulation = target.slice(0, sepIndex);
    const tail = target.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);
    const config = tail ? parseJsonOrThrow(tail, 'config') : {};
    return { simulation, config };
}

function parseJsonOrThrow(raw: string, label: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        throw new Error(`${label} JSON must be an object`);
    } catch (err) {
        throw new Error(`Invalid ${label} JSON: ${(err as Error).message}`);
    }
}

function maskTail(target: string): string {
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) return target;
    return `${target.slice(0, sepIndex)}${ACTION_TYPE_SEPARATOR}***`;
}
