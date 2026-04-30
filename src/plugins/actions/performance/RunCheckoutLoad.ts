// RUN_CHECKOUT_LOAD — preserves the existing checkout simulation entry
// point exactly: same target syntax, same env-var pass-through, same
// metrics shape. Adds an opportunistic write of metrics/raw/gatling/<runId>/summary.json.

import { ActionHandler } from '../ActionHandler';
import { logger } from '../../../utils/logger';
import { PerfProfile } from '../../gatling/support/types';
import { PerformanceActionContext } from './PerformanceActionContext';
import { writePerformanceSummary } from './performance-telemetry-writer';

export const RunCheckoutLoadAction: ActionHandler<PerformanceActionContext> = {
    name: 'RUN_CHECKOUT_LOAD',
    async execute({ target, runner, parser }) {
        // target: "<profile>" | "<profile>||KEY=VALUE||..."
        // e.g. "smoke" | "load||PERF_USERS=30||PERF_DURATION=90"
        const [rawProfile = 'smoke', ...extraPairs] = target.split('||');
        const profile = rawProfile.trim().toLowerCase() as PerfProfile;

        if (!Object.values(PerfProfile).includes(profile)) {
            throw new Error(
                `Invalid profile "${profile}". Valid values: ${Object.values(PerfProfile).join(' | ')}`,
            );
        }

        const extraEnv: Record<string, string> = Object.fromEntries(
            extraPairs
                .map((pair) => pair.split('=') as [string, string])
                .filter(([k]) => k?.length > 0),
        );

        logger.info(`[Gatling] RUN_CHECKOUT_LOAD profile="${profile}" env=${JSON.stringify(extraEnv)}`);

        const startedAt = Date.now();
        const { exitCode, reportDir } = await runner.run({
            profile,
            sourcesFolder: 'src/core/tests/checkout/simulations',
            simulation: 'checkout-load',
            env: extraEnv,
        });

        const metrics = parser.parse(reportDir, 'checkout-load', profile);
        const durationMs = Date.now() - startedAt;

        logger.info(
            `[Gatling] checkout-load complete — ` +
            `${metrics.requests.ok}/${metrics.requests.total} OK, ` +
            `p95=${metrics.responseTime.p95}ms, ` +
            `status=${metrics.status}`,
        );

        const failed = exitCode !== 0 || metrics.status === 'FAIL';
        const errorMessage = failed
            ? `Checkout simulation FAILED (exitCode=${exitCode})`
            : null;

        writePerformanceSummary({
            simulationName: 'checkout-load',
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
