import { startPluginServer } from '../../kernel/plugin-server.factory';
import { execute } from './api';

const { shutdown } = startPluginServer('API', process.env.API_PLUGIN_PORT || '50055', execute);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
