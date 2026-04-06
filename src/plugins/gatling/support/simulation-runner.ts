import { spawn }  from 'child_process';
import * as path   from 'path';
import { logger }  from '../../../utils/logger';
import { RunnerOptions, PerfProfile } from './types';

export interface RunnerResult {
    exitCode:  number;
    reportDir: string;
}

const GATLING_BIN = path.resolve(
    process.cwd(),
    'node_modules/@gatling.io/cli/target/index.js',
);

/**
 * Spawns the Gatling CLI to run a simulation as a child process.
 * Resolves with the exit code and the latest report directory path.
 */
export function runSimulation(options: RunnerOptions): Promise<RunnerResult> {
    const { profile, sourcesFolder, simulation, env } = options;

    if (!Object.values(PerfProfile).includes(profile)) {
        return Promise.reject(
            new Error(`Unknown PerfProfile "${profile}". Valid: ${Object.values(PerfProfile).join(', ')}`),
        );
    }

    const args = [
        '-r', 'dotenv/config',
        GATLING_BIN,
        'run',
        '--sources-folder', sourcesFolder,
        '--simulation',     simulation,
    ];

    const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PERF_PROFILE: profile,
        ...env,
    };

    return new Promise((resolve, reject) => {
        logger.info(`[simulation-runner] Starting "${simulation}" (profile: ${profile})`);

        const child = spawn(process.execPath, args, {
            env:   childEnv,
            cwd:   process.cwd(),
            stdio: 'inherit',
        });

        child.on('error', reject);

        child.on('close', (code) => {
            const exitCode = code ?? 1;
            const reportDir = latestReportDir();
            logger.info(`[simulation-runner] "${simulation}" exited (code: ${exitCode}, report: ${reportDir})`);
            resolve({ exitCode, reportDir });
        });
    });
}

/** Returns the most recently created directory under target/gatling/. */
function latestReportDir(): string {
    const fs      = require('fs')  as typeof import('fs');
    const baseDir = path.resolve(process.cwd(), 'target', 'gatling');

    if (!fs.existsSync(baseDir)) return baseDir;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({
            name:    e.name,
            created: fs.statSync(path.join(baseDir, e.name)).birthtimeMs,
        }))
        .sort((a, b) => b.created - a.created);

    return entries.length > 0
        ? path.join(baseDir, entries[0].name)
        : baseDir;
}
