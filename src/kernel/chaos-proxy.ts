import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as playwrightAdapter from '../adapters/playwright/playwright';
import * as apiAdapter from '../adapters/api/api';
import * as gatlingAdapter from '../adapters/gatling/gatling';
import { logger } from '../utils/logger';
import { resolveLocator } from './locator-resolver';
// import * as appiumAdapter from '../adapters/appium/appium'; // We will build this next

// --- Constants ---

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const SERVER_PORT = '0.0.0.0:50051';

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
const ptomProto = grpc.loadPackageDefinition(packageDefinition) as any;

// --- 2. Transient Jitter Detection via Compiled RegExp ---

// Compiling all signatures into a single, highly optimized Regular Expression
const TRANSIENT_SIGNATURE_REGEX = new RegExp(
    'staleelementreference|elementnotinteractable|nosuchelement|timeouterror|targetclosederror|node is detached',
    'i' // 'i' flag makes it case-insensitive natively
);

function isTransientJitter(error: unknown): boolean {
    const { message = '', name = '' } = error as { message?: string; name?: string };
    const signature = `${name}: ${message}`;

    // The RegExp engine evaluates this in a highly optimized C++ binding under the hood
    return TRANSIENT_SIGNATURE_REGEX.test(signature);
}

// --- 3. Delay helper ---

const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// --- 4. Chaos Suppressor (Lyapunov Stabilizer) ---

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

            // Guard: non-retryable → fail immediately
            if (deterministic || retriesExhausted) {
                return {
                    status: 'FAIL',
                    error: (error as Error).message ?? 'Unknown deterministic failure',
                };
            }

            // Exponential backoff: absorb the temporal perturbation
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

// --- 5. Platform Adapter Routing ---

type AdapterFn = (actionId: string, targetSelector: string) => Promise<string>;

const adapterMap: ReadonlyMap<string, AdapterFn> = new Map([
    ['playwright', playwrightAdapter.execute],
    ['api', apiAdapter.execute],
    ['performance', gatlingAdapter.execute],
    // ['appium', appiumAdapter.execute],
]);

function routeToAdapter(
    platform: string,
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const adapter = adapterMap.get(platform.toLowerCase());

    // Guard: unknown platform
    if (!adapter) {
        return Promise.reject(new Error(`Unsupported platform: "${platform}"`));
    }

    return adapter(actionId, targetSelector);
}

// --- 6. Telemetry ---

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

// --- 7. gRPC Handler ---

async function handleExecuteIntent(call: any, callback: any): Promise<void> {
    const startMark = performance.now();
    const { actionId, targetSelector, platform } = call.request;

    let concreteSelector = targetSelector;
    let outcome: IntentOutcome;

    try {
        // --- THE INDIRECTION BOUNDARY (PROXY PATTERN) ---
        // Intercept the logical key (e.g., "checkoutConfirmBtn") and mathematically
        // resolve it to a platform/viewport specific selector using the .env context.
        concreteSelector = resolveLocator(targetSelector);

        // Pass the CONCRETE selector down to the adapters, wrapped in the Lyapunov Stabilizer
        outcome = await suppressChaos(() =>
            routeToAdapter(platform, actionId, concreteSelector),
        );
    } catch (error: any) {
        // If resolution fails (e.g., key doesn't exist for this platform), 
        // it is a deterministic failure, not chaos. We fail immediately.
        outcome = { status: 'FAIL', error: error.message };
    }

    // Emit Telemetry using the original logical key to keep cross-platform metrics uniform
    emitTelemetry(actionId, platform, outcome, performance.now() - startMark);

    callback(null, {
        status: outcome.status,
        payload: outcome.payload ?? '',
        errorMessage: outcome.error ?? '',
    });
}

// --- 8. Server Bootstrap ---

function main(): void {
    const server = new grpc.Server();

    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    server.bindAsync(
        SERVER_PORT,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
            // Guard: binding failure
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