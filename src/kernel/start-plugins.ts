import { spawn, ChildProcess } from 'child_process';
import * as fs   from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Import at module load — plugin definitions read process.env at call time via `get enabled()`
import plugins, { PluginDefinition } from '../../plugins.config';

const log      = logger.child({ layer: 'kernel', component: 'plugin-launcher' });
const ENV_FILE = path.resolve(process.cwd(), '.env');

// Running processes indexed by plugin name
const running = new Map<string, ChildProcess>();

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

function spawnPlugin(plugin: PluginDefinition): void {
    log.info({ name: plugin.name, script: plugin.script }, 'Starting plugin');

    const child = spawn('pnpm', ['run', plugin.script], {
        env:   { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });

    child.stdout?.on('data', (data: Buffer) => process.stdout.write(`[${plugin.name}] ${data}`));
    child.stderr?.on('data', (data: Buffer) => process.stderr.write(`[${plugin.name}] ${data}`));

    child.on('exit', (code, signal) => {
        running.delete(plugin.name);
        if (code !== 0 && code !== null) {
            log.error({ name: plugin.name, code, signal }, 'Plugin exited unexpectedly');
        } else {
            log.info({ name: plugin.name }, 'Plugin stopped');
        }
    });

    running.set(plugin.name, child);
}

function killPlugin(name: string): Promise<void> {
    const child = running.get(name);
    if (!child) return Promise.resolve();

    return new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        // Force-kill after 3 s if it doesn't exit cleanly
        setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
    });
}

// ---------------------------------------------------------------------------
// .env hot-reload
// ---------------------------------------------------------------------------

function reloadEnv(): void {
    dotenv.config({ path: ENV_FILE, override: true });
}

function enabledNames(): Set<string> {
    return new Set(plugins.filter(p => p.enabled).map(p => p.name));
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function onEnvChanged(): Promise<void> {
    log.info('.env changed — reloading...');
    reloadEnv();

    const nowEnabled  = enabledNames();
    const wasRunning  = new Set(running.keys());

    const toStop      = [...wasRunning].filter(n => !nowEnabled.has(n));
    const toStart     = [...nowEnabled].filter(n => !wasRunning.has(n));
    // Restart plugins that were already running so they pick up new env values
    const toRestart   = [...wasRunning].filter(n => nowEnabled.has(n));

    log.info({ toStop, toStart, toRestart }, 'Plugin diff');

    // Stop removed
    await Promise.all(toStop.map(name => {
        log.info({ name }, 'Stopping plugin (disabled in .env)');
        return killPlugin(name);
    }));

    // Restart running ones with fresh env
    for (const name of toRestart) {
        const plugin = plugins.find(p => p.name === name)!;
        log.info({ name }, 'Restarting plugin (env changed)');
        await killPlugin(name);
        spawnPlugin(plugin);
    }

    // Start newly enabled ones
    for (const name of toStart) {
        const plugin = plugins.find(p => p.name === name)!;
        spawnPlugin(plugin);
    }

    log.info(`Hot-reload complete. Running: [${[...running.keys()].join(', ')}]`);
}

function watchEnv(): void {
    if (!fs.existsSync(ENV_FILE)) {
        log.warn(`No .env file found at ${ENV_FILE} — hot-reload disabled`);
        return;
    }

    fs.watch(ENV_FILE, (event) => {
        if (event !== 'change') return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => onEnvChanged(), 300);
    });

    log.info(`.env watcher active — edits will reload plugins automatically`);
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
    log.info('Shutting down all plugin processes...');
    await Promise.all([...running.keys()].map(killPlugin));
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
    reloadEnv();

    const enabled  = plugins.filter(p => p.enabled);
    const disabled = plugins.filter(p => !p.enabled);

    log.info(
        { enabled: enabled.map(p => p.name), disabled: disabled.map(p => p.name) },
        'Plugin registry loaded',
    );

    if (enabled.length === 0) {
        log.warn('No plugins enabled — check .env (PLUGIN_* vars) or plugins.config.ts');
    }

    for (const plugin of enabled) {
        spawnPlugin(plugin);
    }

    watchEnv();

    process.on('SIGINT',  () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });

    log.info(`${enabled.length} plugin(s) running. Press Ctrl+C to stop all.`);
}

main();
