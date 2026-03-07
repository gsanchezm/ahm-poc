import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../utils/logger';

// --- 1. Establish the Pi-Calculus Channel (gRPC Client) ---
const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const ptomProto = grpc.loadPackageDefinition(packageDef) as any;

const client = new ptomProto.ActionService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

// --- Helper: Promisify the gRPC RPC call ---
function sendIntent(actionId: string, targetSelector: string, platform: string): Promise<any> {
    return new Promise((resolve, reject) => {
        client.ExecuteIntent({ actionId, targetSelector, platform }, (err: any, response: any) => {
            if (err) return reject(err);
            if (response.status === 'FAIL') return reject(new Error(response.errorMessage));
            resolve(response);
        });
    });
}

// --- 2. The Hybrid Atomic Execution ---
async function executeHybridAtom() {
    logger.info('[Atom] Initiating Hybrid Execution (API + Web UI)...');

    try {
        // STEP 1: API Phase (State Injection)
        // We bypass the flaky UI login by hitting the backend directly to create a cart.
        const apiPayload = JSON.stringify({ productId: 99, qty: 1 });
        const apiIntent = await sendIntent(
            'POST',
            `https://api.demostore.com/v1/carts||${apiPayload}`,
            'api'
        );

        logger.info(`[Atom] API Setup Complete. Payload received: ${apiIntent.payload}`);

        // Simulate parsing the API response to get the exact state (e.g., a cart ID)
        const cartId = "cart_778899";

        // STEP 2: Web UI Phase (Consumption)
        // We command the Playwright adapter to navigate directly to the injected state.
        await sendIntent(
            'NAVIGATE',
            `https://wwwdemostore.com/checkout/${cartId}`,
            'playwright'
        );
        logger.info('[Atom] UI Navigated to injected state.');

        // We command the Playwright adapter to perform the critical UI action.
        // If this button is currently obscured by a rendering animation, 
        // the Microkernel will mathematically suppress the chaos and retry automatically.
        await sendIntent(
            'CLICK',
            'button#confirm-purchase',
            'playwright'
        );
        logger.info('[Atom] UI Checkout confirmed.');

        // STEP 3: Teardown (Memory Safety)
        await sendIntent('TEARDOWN', '', 'playwright');
        logger.info('[Atom] Execution $S_{A1}$ completed successfully. Intersection is null.');

    } catch (error: any) {
        logger.error(`[Atom] Execution Failed: ${error.message}`);
        process.exit(1); // Fails the Docker container, signaling the DAG helix
    }
}

executeHybridAtom();