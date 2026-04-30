// VALIDATE_THRESHOLDS — assert a Gatling report meets supplied thresholds.
//
// Target syntax: `reportDir||{simulation,profile?,maxKoRate?,maxP95Ms?,minThroughput?}`.

import { ActionHandler } from '../ActionHandler';
import { parseSimulationTarget } from '../parseCompositeTarget';
import { PerformanceActionContext } from './PerformanceActionContext';

interface Thresholds {
    maxKoRate?: number;
    maxP95Ms?: number;
    minThroughput?: number;
}

export const ValidateThresholdsAction: ActionHandler<PerformanceActionContext> = {
    name: 'VALIDATE_THRESHOLDS',
    async execute({ target, parser }) {
        const { simulation: reportDir, config } = parseSimulationTarget(target);
        const simulation = String(config.simulation ?? 'unknown');
        const profile = String(config.profile ?? 'smoke');
        const thresholds: Thresholds = {
            maxKoRate: typeof config.maxKoRate === 'number' ? config.maxKoRate : undefined,
            maxP95Ms: typeof config.maxP95Ms === 'number' ? config.maxP95Ms : undefined,
            minThroughput: typeof config.minThroughput === 'number' ? config.minThroughput : undefined,
        };

        const metrics = parser.parse(reportDir, simulation, profile);
        const koRate = metrics.requests.total > 0 ? metrics.requests.ko / metrics.requests.total : 0;

        const violations: string[] = [];
        if (thresholds.maxKoRate !== undefined && koRate > thresholds.maxKoRate) {
            violations.push(`koRate ${koRate.toFixed(4)} > ${thresholds.maxKoRate}`);
        }
        if (thresholds.maxP95Ms !== undefined && metrics.responseTime.p95 > thresholds.maxP95Ms) {
            violations.push(`p95 ${metrics.responseTime.p95}ms > ${thresholds.maxP95Ms}ms`);
        }
        if (thresholds.minThroughput !== undefined && metrics.throughput < thresholds.minThroughput) {
            violations.push(`throughput ${metrics.throughput} < ${thresholds.minThroughput}`);
        }

        if (violations.length > 0) {
            throw new Error(`[VALIDATE_THRESHOLDS] ${simulation}: ${violations.join('; ')}`);
        }

        return JSON.stringify({ simulation, profile, koRate, ...metrics.responseTime, throughput: metrics.throughput });
    },
};
