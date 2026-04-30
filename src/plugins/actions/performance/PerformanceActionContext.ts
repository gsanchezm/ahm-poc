import { ActionContext } from '../ActionHandler';
import { runSimulation, RunnerResult } from '../../gatling/support/simulation-runner';
import { parseGatlingStats } from '../../gatling/support/metrics-parser';
import { RunnerOptions, SimulationMetrics } from '../../gatling/support/types';

export interface PerformanceRunner {
    run(options: RunnerOptions): Promise<RunnerResult>;
}

export interface PerformanceParser {
    parse(reportDir: string, simulation: string, profile: string): SimulationMetrics;
}

export interface PerformanceActionContext extends ActionContext {
    runner: PerformanceRunner;
    parser: PerformanceParser;
    target: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
}

export const defaultPerformanceRunner: PerformanceRunner = {
    run: runSimulation,
};

export const defaultPerformanceParser: PerformanceParser = {
    parse: parseGatlingStats,
};
