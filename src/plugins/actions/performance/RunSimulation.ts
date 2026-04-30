// RUN_SIMULATION — generic simulation runner.
//
// Target syntax: `simulationClass[||{config}]`.
//   {config} keys recognized:
//     profile        smoke | load | stress  (default: smoke)
//     sourcesFolder  Gatling --sources-folder path
//     env            Record<string,string> merged into child process env
//
// Backwards-compatible behavior is owned by RUN_CHECKOUT_LOAD; this handler
// is the open-end of the system — adding a new simulation no longer
// requires a new switch arm in gatling.ts, just a config payload.

import { ActionHandler } from '../ActionHandler';
import { logger } from '../../../utils/logger';
import { PerfProfile } from '../../gatling/support/types';
import { parseSimulationTarget } from '../parseCompositeTarget';
import { PerformanceActionContext } from './PerformanceActionContext';
import { writePerformanceSummary } from './performance-telemetry-writer';

const DEFAULT_SOURCES_FOLDER = 'src/core/tests/checkout/simulations';

export const RunSimulationAction: ActionHandler<PerformanceActionContext> = {
    name: 'RUN_SIMULATION',
    async execute({ target, runner, parser }) {
        const { simulation, config } = parseSimulationTarget(target);

        const profileRaw = String((config as Record<string, unknown>).profile ?? 'smoke').toLowerCase();
        if (!Object.values(PerfProfile).includes(profileRaw as PerfProfile)) {
            throw new Error(
                `Invalid profile "${profileRaw}". Valid values: ${Object.values(PerfProfile).join(' | ')}`,
            );
        }
        const profile = profileRaw as PerfProfile;
        const sourcesFolder = String(config.sourcesFolder ?? DEFAULT_SOURCES_FOLDER);
        const env = (config.env && typeof config.env === 'object'
            ? config.env as Record<string, string>
            : {}) as Record<string, string>;

        logger.info(`[Gatling] RUN_SIMULATION simulation="${simulation}" profile="${profile}"`);

        const startedAt = Date.now();
        const { exitCode, reportDir } = await runner.run({
            profile,
            sourcesFolder,
            simulation,
            env,
        });

        const metrics = parser.parse(reportDir, simulation, profile);
        const durationMs = Date.now() - startedAt;
        const failed = exitCode !== 0 || metrics.status === 'FAIL';
        const errorMessage = failed
            ? `Simulation "${simulation}" FAILED (exitCode=${exitCode})`
            : null;

        writePerformanceSummary({
            simulationName: simulation,
            status: failed ? 'FAIL' : 'PASS',
            durationMs,
            requestCount: metrics.requests.total,
            successCount: metrics.requests.ok,
            failureCount: metrics.requests.ko,
            meanResponseTimeMs: metrics.responseTime.mean,
            p95ResponseTimeMs: metrics.responseTime.p95,
            errorMessage,
        });

        if (failed) {
            throw new Error(`${errorMessage}: ${JSON.stringify(metrics)}`);
        }

        return JSON.stringify(metrics);
    },
};
