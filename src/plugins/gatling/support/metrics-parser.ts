import * as fs   from 'fs';
import * as path from 'path';
import { SimulationMetrics, RequestStats } from './types';

/**
 * Parses Gatling's stats.json from a completed simulation report directory
 * and returns a structured SimulationMetrics object.
 *
 * Gatling writes: <reportDir>/js/stats.json
 */
export function parseGatlingStats(
    reportDir: string,
    simulation: string,
    profile: string,
): SimulationMetrics {
    const statsFile = path.join(reportDir, 'js', 'stats.json');

    if (!fs.existsSync(statsFile)) {
        return failedMetrics(simulation, profile, reportDir, `stats.json not found at ${statsFile}`);
    }

    let raw: any;
    try {
        raw = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    } catch {
        return failedMetrics(simulation, profile, reportDir, 'Failed to parse stats.json');
    }

    // Gatling stats.json has a top-level "stats" key with the global group
    const stats = raw?.stats ?? raw;

    const requests: RequestStats = {
        total: stats?.numberOfRequests?.total ?? 0,
        ok:    stats?.numberOfRequests?.ok    ?? 0,
        ko:    stats?.numberOfRequests?.ko    ?? 0,
    };

    const koRate = requests.total > 0 ? requests.ko / requests.total : 0;

    return {
        simulation,
        profile,
        requests,
        responseTime: {
            min:  stats?.minResponseTime?.total  ?? 0,
            mean: stats?.meanResponseTime?.total ?? 0,
            p95:  stats?.percentiles3?.total     ?? 0,  // Gatling p95 = percentiles3
            max:  stats?.maxResponseTime?.total  ?? 0,
        },
        throughput: stats?.meanNumberOfRequestsPerSecond?.total ?? 0,
        status:     koRate < 0.01 ? 'PASS' : 'FAIL',
        reportDir,
    };
}

function failedMetrics(
    simulation: string,
    profile: string,
    reportDir: string,
    reason: string,
): SimulationMetrics {
    return {
        simulation,
        profile,
        requests:     { total: 0, ok: 0, ko: 0 },
        responseTime: { min: 0, mean: 0, p95: 0, max: 0 },
        throughput:   0,
        status:       'FAIL',
        reportDir,
    };
}
