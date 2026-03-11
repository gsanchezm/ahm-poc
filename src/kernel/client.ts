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
    const resolvedPlatform = platform || process.env.DRIVER || 'playwright';

    return new Promise((resolve, reject) => {
        client.ExecuteIntent(
            { actionId, targetSelector, platform: resolvedPlatform },
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
