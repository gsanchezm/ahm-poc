import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../utils/logger';
import { resolveLocator } from './locator-resolver';
import { ensurePortFree } from './port-guard';

// --- Constants ---

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const SERVER_PORT_NUMBER = 50051;
const SERVER_PORT = `0.0.0.0:${SERVER_PORT_NUMBER}`;
const ACTION_TYPE_SEPARATOR = '||';

// --- Plugin Address Configuration (Environment-driven) ---

const PLUGIN_ADDRESSES: Readonly<Record<string, string>> = {
    playwright:  process.env.PLAYWRIGHT_ADDRESS  || 'localhost:50052',
    appium:      process.env.APPIUM_ADDRESS       || 'localhost:50053',
    performance: process.env.GATLING_ADDRESS      || 'localhost:50054',
    api:         process.env.API_ADAPTER_ADDRESS  || 'localhost:50055',
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
    piCalculusLatencyMs: number; // Pi-Calculus gRPC serialization cost
    proxyOverheadMs: number;     // Architectural overhead of the microkernel
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

// --- 2. Plugin Client Pool (Lazy Initialization) ---

const pluginClients: Map<string, any> = new Map();

function getPluginClient(platform: string): any {
    // Platform may be structured as "playwright:0" — extract the driver name for routing
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

// --- 3. Route to Plugin via gRPC (Replaces In-Memory Adapter Calls) ---

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

// --- 5. Delay Helper ---

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

// --- 7. TYPE-Aware Locator Resolution ---

const PASSTHROUGH_ACTIONS = new Set(['NAVIGATE', 'TEARDOWN', 'EVALUATE', 'HIDE_KEYBOARD']);

// Actions that utilize the "logicalKey||payload" format.
// TYPE:             logicalKey||text
// WAIT_FOR_ELEMENT: logicalKey||timeoutMs
// ASSERT_TEXT:      logicalKey||expectedText
const COMPOSITE_ACTIONS = new Set(['TYPE', 'WAIT_FOR_ELEMENT', 'ASSERT_TEXT']);

function resolveSelector(actionId: string, rawSelector: string): string {
    const normalized = actionId.toUpperCase();

    // NAVIGATE, TEARDOWN, EVALUATE pass raw values — bypassing locator resolution.
    if (PASSTHROUGH_ACTIONS.has(normalized)) {
        return rawSelector;
    }

    // Composite actions: resolve solely the key portion; preserve the payload succeeding the || separator.
    if (COMPOSITE_ACTIONS.has(normalized) && rawSelector.includes(ACTION_TYPE_SEPARATOR)) {
        const sepIndex = rawSelector.indexOf(ACTION_TYPE_SEPARATOR);
        const logicalKey = rawSelector.slice(0, sepIndex);
        const textPayload = rawSelector.slice(sepIndex);
        return resolveLocator(logicalKey) + textPayload;
    }

    return resolveLocator(rawSelector);
}

// --- 8. Telemetry Emission ---

function emitTelemetry(
    actionId: string,
    platform: string,
    outcome: IntentOutcome,
    durationMs: number,
    grpcLatencyMs: number,
    proxyOverheadMs: number
): void {
    const record: TelemetryRecord = {
        timestamp: new Date().toISOString(),
        actionId,
        platform,
        status: outcome.status,
        durationMs: Math.round(durationMs * 100) / 100,
        error: outcome.error ?? null,
        piCalculusLatencyMs: Math.round(grpcLatencyMs * 100) / 100,
        proxyOverheadMs: Math.round(proxyOverheadMs * 100) / 100,
    };
    // Emit to Standard Output → Piped to MinIO Object Storage
    process.stdout.write(JSON.stringify(record) + '\n');
}

// --- 9. gRPC Handler ---

async function handleExecuteIntent(call: any, callback: any): Promise<void> {
    const receiveTime = Date.now(); // Absolute timestamp upon reception
    const startMark = performance.now(); // High-resolution mark for duration calculation
    
    // The client is expected to inject 'clientSentAt'. Defaults to 0 if absent.
    const { actionId, targetSelector, platform, clientSentAt } = call.request;

    // 1. Calculate Pi-Calculus Latency (Network Time-of-Flight & Serialization)
    const grpcLatencyMs = clientSentAt ? (receiveTime - clientSentAt) : 0;

    let outcome: IntentOutcome;
    let pluginStartMark = 0;
    let pluginDurationMs = 0;

    try {
        // --- THE INDIRECTION BOUNDARY (PROXY PATTERN) ---
        // Intercept the logical key and resolve it to a platform/viewport-specific concrete selector.
        const concreteSelector = resolveSelector(actionId, targetSelector);

        // Measure strictly the temporal cost of the driver (Playwright/Appium) execution.
        pluginStartMark = performance.now();
        outcome = await suppressChaos(() =>
            routeToPlugin(platform, actionId, concreteSelector),
        );
        pluginDurationMs = performance.now() - pluginStartMark;

    } catch (error: any) {
        outcome = { status: 'FAIL', error: error.message };
        if (pluginStartMark > 0) {
            pluginDurationMs = performance.now() - pluginStartMark;
        }
    }

    const totalDurationMs = performance.now() - startMark;
    
    // 2. Calculate Proxy Overhead (Total duration minus the target UI driver execution time)
    const proxyOverheadMs = totalDurationMs - pluginDurationMs;

    // 3. Emit Enriched Telemetry
    emitTelemetry(actionId, platform, outcome, totalDurationMs, grpcLatencyMs, proxyOverheadMs);

    callback(null, {
        status: outcome.status,
        payload: outcome.payload ?? '',
        errorMessage: outcome.error ?? '',
    });
}

// --- 10. Server Bootstrap ---

async function main(): Promise<void> {
    await ensurePortFree(SERVER_PORT_NUMBER);

    const server = new grpc.Server();

    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    server.bindAsync(
        SERVER_PORT,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
            if (err) {
                logger.error(`[p-TOM] Failed to bind microkernel server: ${err}`);
                process.exit(1);
            }
            logger.warn(
                `[p-TOM] Microkernel listening on TCP port ${port} (Pi-Calculus Channel established)`,
            );
        },
    );
}

main().catch((err) => {
    logger.error(`[p-TOM] Fatal startup sequence failure: ${err.message}`);
    process.exit(1);
});