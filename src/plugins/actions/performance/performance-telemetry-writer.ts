// Lightweight performance summary writer. Mirrors the contract telemetry
// writer's run-id resolution so multi-plugin reports correlate, and is
// best-effort by default — TOM_TELEMETRY_STRICT=true makes failures fatal.

import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { resolveRunId } from '../../../core/contracts/contract-telemetry-writer';

const REPO_ROOT = resolve(__dirname, '../../../..');

export interface PerformanceSummary {
    runId: string;
    timestamp: string;
    simulationName: string;
    status: 'PASS' | 'FAIL';
    durationMs: number;
    requestCount: number;
    successCount: number;
    failureCount: number;
    meanResponseTimeMs: number;
    p95ResponseTimeMs: number;
    errorMessage: string | null;
}

function isStrict(): boolean {
    return (process.env.TOM_TELEMETRY_STRICT || '').toLowerCase() === 'true';
}

export function writePerformanceSummary(input: Omit<PerformanceSummary, 'runId' | 'timestamp'> & {
    runId?: string;
    timestamp?: string;
}): PerformanceSummary {
    const runId = input.runId ?? resolveRunId();
    const summary: PerformanceSummary = {
        runId,
        timestamp: input.timestamp ?? new Date().toISOString(),
        simulationName: input.simulationName,
        status: input.status,
        durationMs: input.durationMs,
        requestCount: input.requestCount,
        successCount: input.successCount,
        failureCount: input.failureCount,
        meanResponseTimeMs: input.meanResponseTimeMs,
        p95ResponseTimeMs: input.p95ResponseTimeMs,
        errorMessage: input.errorMessage ?? null,
    };

    try {
        const dir = join(REPO_ROOT, 'metrics', 'raw', 'gatling', runId);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    } catch (err) {
        if (isStrict()) throw err;
        process.stderr.write(`[perf-telemetry] write failed (non-strict): ${(err as Error).message}\n`);
    }

    return summary;
}
