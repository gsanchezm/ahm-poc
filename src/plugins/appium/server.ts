import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './appium';
import { bootAppiumServer, shutdownAppiumServer } from './appium-lifecycle';

async function main(): Promise<void> {
    await bootAppiumServer();
    startPluginServer('Appium', process.env.APPIUM_PORT_GRPC || '50053', execute);
}

process.on('SIGTERM', async () => {
    await shutdownAppiumServer();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await shutdownAppiumServer();
    process.exit(0);
});

main().catch((err) => {
    console.error('[Appium] Failed to start:', err);
    process.exit(1);
});
