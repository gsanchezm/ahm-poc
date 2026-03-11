import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '../utils/logger';

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');

type ExecuteFn = (actionId: string, targetSelector: string) => Promise<string>;

export function startPluginServer(
    pluginName: string,
    port: string,
    executeFn: ExecuteFn,
): void {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const ptomProto = (grpc.loadPackageDefinition(packageDef) as any).ptom;

    async function handleExecuteIntent(call: any, callback: any): Promise<void> {
        const { actionId, targetSelector } = call.request;

        try {
            const result = await executeFn(actionId, targetSelector);
            callback(null, { status: 'PASS', payload: result, errorMessage: '' });
        } catch (error: any) {
            callback(null, { status: 'FAIL', payload: '', errorMessage: error.message });
        }
    }

    const server = new grpc.Server();
    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, boundPort) => {
            if (err) {
                logger.error(`[${pluginName}] Bind failed: ${err}`);
                return;
            }
            logger.info(`[${pluginName}] Plugin listening on port ${boundPort}`);
        },
    );
}
