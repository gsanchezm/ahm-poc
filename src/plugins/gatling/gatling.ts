import { logger }              from '../../utils/logger';
import { runSimulation }       from './support/simulation-runner';
import { parseGatlingStats }   from './support/metrics-parser';
import { RunnerOptions, PerfProfile } from './support/types';

// NOTE: @gatling.io/core and @gatling.io/http must NOT be imported here.
// Those packages call Java.type() at load time and only work inside the
// Gatling JVM runner (gatling-js-bundle). This server runs in plain Node.js.
// All simulations are executed as subprocesses via runSimulation().

type PerfHandler = (target: string) => Promise<string>;

const JVM_ONLY_MESSAGE =
    'This action requires the Gatling JVM context and cannot run inside the gRPC plugin server. ' +
    'Use RUN_CHECKOUT_LOAD (or a future feature-specific action) to trigger simulations as subprocesses.';

// ---------------------------------------------------------------------------
// Intent → Handler Map
// ---------------------------------------------------------------------------

const actionHandlers: ReadonlyMap<string, PerfHandler> = new Map([
    [
        'SCENARIO_LOAD',
        async (_config: string) => { throw new Error(JVM_ONLY_MESSAGE); },
    ],
    [
        'INJECT_LOAD',
        async (_config: string) => { throw new Error(JVM_ONLY_MESSAGE); },
    ],
    [
        'RUN_SIMULATION',
        async (_config: string) => { throw new Error(JVM_ONLY_MESSAGE); },
    ],
    [
        'RUN_CHECKOUT_LOAD',
        async (config: string) => {
            // config: "<profile>" | "<profile>||KEY=VALUE||..."
            // e.g. "smoke" | "load||PERF_USERS=30||PERF_DURATION=90"
            const [rawProfile = 'smoke', ...extraPairs] = config.split('||');
            const profile = rawProfile.trim().toLowerCase() as PerfProfile;

            if (!Object.values(PerfProfile).includes(profile)) {
                throw new Error(
                    `Invalid profile "${profile}". Valid values: ${Object.values(PerfProfile).join(' | ')}`,
                );
            }

            const extraEnv: Record<string, string> = Object.fromEntries(
                extraPairs
                    .map(pair => pair.split('=') as [string, string])
                    .filter(([k]) => k?.length > 0),
            );

            logger.info(`[Gatling] RUN_CHECKOUT_LOAD profile="${profile}" env=${JSON.stringify(extraEnv)}`);

            const { exitCode, reportDir } = await runSimulation({
                profile,
                sourcesFolder: 'src/core/tests/checkout/simulations',
                simulation:    'checkout-load',
                env:           extraEnv,
            });

            const metrics = parseGatlingStats(reportDir, 'checkout-load', profile);

            logger.info(
                `[Gatling] checkout-load complete — ` +
                `${metrics.requests.ok}/${metrics.requests.total} OK, ` +
                `p95=${metrics.responseTime.p95}ms, ` +
                `status=${metrics.status}`,
            );

            if (exitCode !== 0 || metrics.status === 'FAIL') {
                throw new Error(
                    `Checkout simulation FAILED (exitCode=${exitCode}): ${JSON.stringify(metrics)}`,
                );
            }

            return JSON.stringify(metrics);
        },
    ],
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function execute(
    actionId:       string,
    targetSelector: string,
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    logger.info(`[Gatling Adapter] Received intent: ${normalizedAction}`);

    const handler = actionHandlers.get(normalizedAction);
    if (!handler) {
        throw new Error(`Unsupported Gatling actionId: "${actionId}"`);
    }

    return handler(targetSelector);
}
