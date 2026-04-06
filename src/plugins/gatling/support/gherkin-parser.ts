import * as fs   from 'fs';
import * as path from 'path';

export interface ExamplesTable {
    name:    string;
    headers: string[];
    rows:    Record<string, string>[];
}

export interface ParsedScenarioOutline {
    name:     string;
    examples: ExamplesTable[];
}

/**
 * Reads a .feature file and returns the Examples tables for a specific Scenario Outline.
 * Uses line-by-line parsing — no external Gherkin library required.
 *
 * @param featurePath  Path relative to process.cwd() (project root).
 * @param scenarioName Exact text after "Scenario Outline:".
 */
export function parseScenarioOutline(
    featurePath: string,
    scenarioName: string,
): ParsedScenarioOutline {
    const abs   = path.resolve(process.cwd(), featurePath);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');

    const result: ParsedScenarioOutline = { name: scenarioName, examples: [] };

    let inTarget   = false;
    let inExamples = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        // ── Scenario Outline detection ───────────────────────────────────────
        if (line.startsWith('Scenario Outline:')) {
            const name = line.slice('Scenario Outline:'.length).trim();
            inTarget   = name === scenarioName;
            inExamples = false;
            continue;
        }

        // ── Leave target if another top-level keyword starts ─────────────────
        if (inTarget && (line.startsWith('Scenario:') || line.startsWith('Feature:') || line.startsWith('Background:'))) {
            inTarget = false;
            continue;
        }

        if (!inTarget) continue;

        // ── Examples block ───────────────────────────────────────────────────
        if (line.startsWith('Examples:')) {
            const name = line.slice('Examples:'.length).trim();
            result.examples.push({ name, headers: [], rows: [] });
            inExamples = true;
            continue;
        }

        if (!inExamples) continue;

        // ── Table row ────────────────────────────────────────────────────────
        if (line.startsWith('|')) {
            const cells   = line.split('|').slice(1, -1).map(c => c.trim());
            const current = result.examples[result.examples.length - 1];

            if (current.headers.length === 0) {
                current.headers = cells;
            } else {
                const row: Record<string, string> = {};
                cells.forEach((cell, i) => { row[current.headers[i]] = cell; });
                current.rows.push(row);
            }
        }
    }

    if (result.examples.length === 0) {
        throw new Error(
            `[gherkin-parser] No Examples found for Scenario Outline "${scenarioName}" in ${featurePath}`,
        );
    }

    return result;
}
