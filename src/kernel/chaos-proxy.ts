import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../utils/logger';
import { resolveLocator } from './locator-resolver';

// --- Constants ---

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const SERVER_PORT = '0.0.0.0:50051';
const ACTION_TYPE_SEPARATOR = '||';

// --- Plugin Address Configuration (environment-driven) ---

const PLUGIN_ADDRESSES: Readonly<Record<string, string>> = {
    playwright:  process.env.PLAYWRIGHT_ADDRESS  || 'localhost:50052',
    appium:      process.env.APPIUM_ADDRESS       || 'localhost:50053',
    performance: process.env.GATLING_ADDRESS      || 'localhost:50054',
    api:         process.env.API_ADAPTER_ADDRESS   || 'localhost:50055',
};

// --- Types ---

interface IntentOutcome {
    status: 'PASS' | 'FAIL';
    payload?: string;
    error?: string;
}

interface TelemetryRecord {
    timestamp: string;
    actionId: string;
    platform: string;
    status: 'PASS' | 'FAIL';
    durationMs: number;
    error: string | null;
}

// --- 1. Proto Loading (Pi-Calculus Channel Initialization) ---

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const ptomProto = (grpc.loadPackageDefinition(packageDefinition) as any).ptom;

// --- 2. Plugin Client Pool (lazy initialization) ---

const pluginClients: Map<string, any> = new Map();

function getPluginClient(platform: string): any {
    // platform may be "playwright:0" — extract the driver name for routing
    const key = platform.split(':')[0].toLowerCase();
    if (pluginClients.has(key)) return pluginClients.get(key);

    const address = PLUGIN_ADDRESSES[key];
    if (!address) {
        throw new Error(`No plugin address configured for platform: "${platform}"`);
    }

    const client = new ptomProto.ActionService(
        address,
        grpc.credentials.createInsecure(),
    );
    pluginClients.set(key, client);
    return client;
}

// --- 3. Route to Plugin via gRPC (replaces in-memory adapter calls) ---

function routeToPlugin(
    platform: string,
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const client = getPluginClient(platform);

    return new Promise((resolve, reject) => {
        client.ExecuteIntent(
            { actionId, targetSelector, platform },
            (err: Error | null, response: any) => {
                if (err) return reject(err);
                if (response.status === 'FAIL') {
                    return reject(new Error(response.errorMessage));
                }
                resolve(response.payload);
            },
        );
    });
}

// --- 4. Transient Jitter Detection via Compiled RegExp ---

const TRANSIENT_SIGNATURE_REGEX = new RegExp(
    'staleelementreference|elementnotinteractable|nosuchelement|timeouterror|targetclosederror|node is detached',
    'i',
);

function isTransientJitter(error: unknown): boolean {
    const { message = '', name = '' } = error as { message?: string; name?: string };
    return TRANSIENT_SIGNATURE_REGEX.test(`${name}: ${message}`);
}

// --- 5. Delay helper ---

const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// --- 6. Chaos Suppressor (Lyapunov Stabilizer) ---

async function suppressChaos(
    intentFn: () => Promise<string>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<IntentOutcome> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await intentFn();
            return { status: 'PASS', payload: result };
        } catch (error: unknown) {
            const retriesExhausted = attempt >= maxRetries;
            const deterministic = !isTransientJitter(error);

            if (deterministic || retriesExhausted) {
                return {
                    status: 'FAIL',
                    error: (error as Error).message ?? 'Unknown deterministic failure',
                };
            }

            const delayMs = BASE_BACKOFF_MS * (1 << (attempt + 1));
            logger.warn(
                `[Chaos Control] Perturbation intercepted: ${(error as Error).name}. ` +
                `Dampening for ${delayMs}ms (${attempt + 1}/${maxRetries}).`,
            );
            await delay(delayMs);
        }
    }

    return { status: 'FAIL', error: 'Chaos suppression threshold exceeded.' };
}

// --- 7. TYPE-aware Locator Resolution ---

const PASSTHROUGH_ACTIONS = new Set(['NAVIGATE', 'TEARDOWN', 'EVALUATE']);

// Actions that use "logicalKey||payload" format — resolve only the key part.
// TYPE:             logicalKey||text
// WAIT_FOR_ELEMENT: logicalKey||timeoutMs
// ASSERT_TEXT:      logicalKey||expectedText
const COMPOSITE_ACTIONS = new Set(['TYPE', 'WAIT_FOR_ELEMENT', 'ASSERT_TEXT']);

function resolveSelector(actionId: string, rawSelector: string): string {
    const normalized = actionId.toUpperCase();

    // NAVIGATE, TEARDOWN, EVALUATE pass raw values — no locator resolution.
    if (PASSTHROUGH_ACTIONS.has(normalized)) {
        return rawSelector;
    }

    // Composite actions: resolve only the key portion; preserve the payload after ||.
    if (COMPOSITE_ACTIONS.has(normalized) && rawSelector.includes(ACTION_TYPE_SEPARATOR)) {
        const sepIndex = rawSelector.indexOf(ACTION_TYPE_SEPARATOR);
        const logicalKey = rawSelector.slice(0, sepIndex);
        const textPayload = rawSelector.slice(sepIndex);
        return resolveLocator(logicalKey) + textPayload;
    }

    return resolveLocator(rawSelector);
}

// --- 8. Telemetry ---

function emitTelemetry(
    actionId: string,
    platform: string,
    outcome: IntentOutcome,
    durationMs: number,
): void {
    const record: TelemetryRecord = {
        timestamp: new Date().toISOString(),
        actionId,
        platform,
        status: outcome.status,
        durationMs: Math.round(durationMs * 100) / 100,
        error: outcome.error ?? null,
    };
    // Stdout → pipe to MinIO
    process.stdout.write(JSON.stringify(record) + '\n');
}

// --- 9. gRPC Handler ---

async function handleExecuteIntent(call: any, callback: any): Promise<void> {
    const startMark = performance.now();
    const { actionId, targetSelector, platform } = call.request;

    let outcome: IntentOutcome;

    try {
        // --- THE INDIRECTION BOUNDARY (PROXY PATTERN) ---
        // Intercept the logical key and resolve it to a platform/viewport
        // specific selector using the .env context.
        const concreteSelector = resolveSelector(actionId, targetSelector);

        // Forward the CONCRETE selector to the plugin, wrapped in the Lyapunov Stabilizer
        outcome = await suppressChaos(() =>
            routeToPlugin(platform, actionId, concreteSelector),
        );
    } catch (error: any) {
        outcome = { status: 'FAIL', error: error.message };
    }

    // Emit Telemetry using the original logical key for cross-platform metrics
    emitTelemetry(actionId, platform, outcome, performance.now() - startMark);

    callback(null, {
        status: outcome.status,
        payload: outcome.payload ?? '',
        errorMessage: outcome.error ?? '',
    });
}

// --- 10. Server Bootstrap ---

function main(): void {
    const server = new grpc.Server();

    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    server.bindAsync(
        SERVER_PORT,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
            if (err) {
                logger.error(`Failed to bind server: ${err}`);
                return;
            }
            logger.warn(
                `[p-TOM] Microkernel listening on TCP port ${port} (Pi-Calculus Channel established)`,
            );
        },
    );
}

main();
