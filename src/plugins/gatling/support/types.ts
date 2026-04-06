// ---------------------------------------------------------------------------
// Feature parser options (used by featureToRows)
// ---------------------------------------------------------------------------

export interface FeatureToRowsOptions {
    /** Path to the .feature file, relative to CWD (project root). */
    featurePath: string;
    /** Exact text after "Scenario Outline:" — angle-bracket placeholders included. */
    scenarioName: string;
    /** Which Examples block names to include. Omit to include all. */
    includeExamples?: string[];
}

// ---------------------------------------------------------------------------
// Simulation runner options (used by simulation-runner)
// ---------------------------------------------------------------------------

export enum PerfProfile {
    Smoke  = 'smoke',
    Load   = 'load',
    Stress = 'stress',
}

export interface RunnerOptions {
    profile: PerfProfile;
    /** --sources-folder passed to the Gatling CLI */
    sourcesFolder: string;
    /** --simulation name (filename without .gatling.ts) */
    simulation: string;
    /** Extra env vars merged on top of process.env */
    env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Metrics returned by metrics-parser after a simulation completes
// ---------------------------------------------------------------------------

export interface RequestStats {
    total: number;
    ok:    number;
    ko:    number;
}

export interface SimulationMetrics {
    simulation:    string;
    profile:       string;
    requests:      RequestStats;
    /** Milliseconds */
    responseTime: {
        min:  number;
        mean: number;
        p95:  number;
        max:  number;
    };
    /** Requests per second */
    throughput:    number;
    /** 'PASS' when KO rate < 1%, otherwise 'FAIL' */
    status:        'PASS' | 'FAIL';
    reportDir:     string;
}
