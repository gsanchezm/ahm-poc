import * as fs from 'fs';
import * as path from 'path';

// Target the specific vertical slice. In a fully dynamic AHM runner, 
// this path could be injected via the DATASET environment variable.
const LOCATORS_PATH = path.resolve(__dirname, '../core/tests/checkout/locators/checkout.locators.json');

// Memory Cache: Prevents disk I/O and evaluation bottlenecks
let locatorsCache: Record<string, any> | null = null;
let cachedPlatform: string | null = null;
let cachedViewport: string | null = null;

// Strategy Map for platform-specific locator resolution (O(1) lookup instead of if/else chains)
const LOCATOR_STRATEGIES: Record<string, (node: any, viewport: string) => string | undefined> = {
    web: (node, viewport) => typeof node.web === 'string' ? node.web : node.web?.[viewport],
    android: (node) => node.mobile?.android,
    ios: (node) => node.mobile?.ios,
};

function getPlatform(): string {
    if (!cachedPlatform) cachedPlatform = (process.env.PLATFORM || 'web').toLowerCase();
    return cachedPlatform;
}

function getViewport(): string {
    if (!cachedViewport) cachedViewport = (process.env.VIEWPORT || 'desktop').toLowerCase();
    return cachedViewport;
}

function loadLocators(): Record<string, any> {
    if (locatorsCache) return locatorsCache;

    try {
        const rawData = fs.readFileSync(LOCATORS_PATH, 'utf-8');
        const parsed = JSON.parse(rawData) as Record<string, any>;
        locatorsCache = parsed;
        return parsed;
    } catch (error: any) {
        throw new Error(`[Proxy] Critical Failure: Cannot load locator artifact at ${LOCATORS_PATH}. ${error.message}`);
    }
}

export function resolveLocator(logicalKey: string): string {
    const platform = getPlatform();

    // 1. Guard Clause: Bypass Resolution for Network Rings
    if (platform === 'api' || platform === 'performance') return logicalKey;

    // 2. Load Artifact
    const locators = loadLocators();
    const platformNode = locators[logicalKey];

    // 3. Guard Clause: Fallback for undefined keys
    if (!platformNode) {
        console.warn(`[Proxy] Logical key '${logicalKey}' not found in artifact. Passing as raw selector.`);
        return logicalKey;
    }

    const viewport = getViewport();

    // 4. Resolve Selector using strategy map (Law of Demeter applied intuitively)
    const strategy = LOCATOR_STRATEGIES[platform];
    const resolvedSelector = strategy ? strategy(platformNode, viewport) : undefined;

    // 5. Guard Clause: Strict Mathematical Enforcement
    if (!resolvedSelector || resolvedSelector.trim() === "") {
        throw new Error(
            `[Proxy] Resolution failed: Locator for '${logicalKey}' is empty or undefined ` +
            `for PLATFORM='${platform}' and VIEWPORT='${viewport}'.`
        );
    }

    return resolvedSelector;
}