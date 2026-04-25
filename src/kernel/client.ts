import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const ptomProto = (grpc.loadPackageDefinition(packageDef) as any).ptom;

// --- Types ---

export interface IntentResult {
    status: string;
    payload: string;
    errorMessage: string;
}

// --- Singleton Client (connects to the proxy, not directly to plugins) ---

const PROXY_ADDRESS = process.env.PROXY_ADDRESS || 'localhost:50051';

const client = new ptomProto.ActionService(
    PROXY_ADDRESS,
    grpc.credentials.createInsecure(),
);

// --- Public API ---

export function sendIntent(
    actionId: string,
    targetSelector: string,
    platform?: string,
): Promise<IntentResult> {
    const driver = platform || process.env.DRIVER || 'playwright';
    // Append worker ID so the plugin can isolate browser contexts per parallel worker
    const workerId = process.env.CUCUMBER_WORKER_ID ?? '0';
    const resolvedPlatform = `${driver}:${workerId}`;

    return new Promise((resolve, reject) => {
        // Stamp the dispatch instant immediately prior to gRPC marshalling so the
        // proxy can derive Pi-Calculus serialization latency (Δ = receiveTime − clientSentAt).
        const clientSentAt = Date.now();

        client.ExecuteIntent(
            { actionId, targetSelector, platform: resolvedPlatform, clientSentAt },
            (err: Error | null, response: IntentResult) => {
                if (err) return reject(err);
                if (response.status === 'FAIL') {
                    return reject(new Error(response.errorMessage));
                }
                resolve(response);
            },
        );
    });
}

export function closeClient(): void {
    grpc.closeClient(client);
}
