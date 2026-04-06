import { parseScenarioOutline } from './gherkin-parser';
import { FeatureToRowsOptions }  from './types';

/**
 * Generic Gherkin Examples → Gatling feeder rows.
 *
 * Reads a Scenario Outline's Examples tables and maps each raw row
 * to a typed object via the provided mapper.
 *
 * Usage:
 *   featureToRows({ featurePath, scenarioName, includeExamples }, row => ({
 *     market: row['market'],
 *     qty:    parseInt(row['qty'], 10),
 *   }))
 */
export function featureToRows<T extends Record<string, unknown>>(
    options: FeatureToRowsOptions,
    mapper: (row: Record<string, string>, examplesName: string) => T,
): T[] {
    const { featurePath, scenarioName, includeExamples } = options;

    const parsed = parseScenarioOutline(featurePath, scenarioName);

    const tables = includeExamples
        ? parsed.examples.filter(e => includeExamples.includes(e.name))
        : parsed.examples;

    return tables.flatMap(table =>
        table.rows.map(row => mapper(row, table.name)),
    );
}
