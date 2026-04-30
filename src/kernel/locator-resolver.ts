import * as fs from 'fs';
import * as path from 'path';

const TESTS_DIR = path.resolve(__dirname, '../core/tests');

let locatorsCache: Record<string, any> | null = null;

function resolveMobile(node: any, os: 'android' | 'ios'): string | undefined {
    if (typeof node.mobile === 'string') return node.mobile;
    return node.mobile?.[os];
}

const LOCATOR_STRATEGIES: Record<string, (node: any, viewport: string) => string | undefined> = {
    web: (node, viewport) => typeof node.web === 'string' ? node.web : node.web?.[viewport],
    android: (node) => resolveMobile(node, 'android'),
    ios: (node) => resolveMobile(node, 'ios'),
};

function getPlatform(): string {
    return (process.env.PLATFORM || 'web').toLowerCase();
}

function getViewport(): string {
    return (process.env.VIEWPORT || 'desktop').toLowerCase();
}

function collectLocatorFiles(dir: string, results: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectLocatorFiles(fullPath, results);
        } else if (entry.isFile() && entry.name.endsWith('.locators.json')) {
            results.push(fullPath);
        }
    }
    return results;
}

function loadLocators(): Record<string, any> {
    if (locatorsCache) return locatorsCache;

    const files = collectLocatorFiles(TESTS_DIR);
    if (files.length === 0) {
        throw new Error(`[Proxy] Critical Failure: No *.locators.json files found under ${TESTS_DIR}`);
    }

    const merged: Record<string, any> = {};
    for (const filePath of files) {
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, any>;
            Object.assign(merged, parsed);
        } catch (error: any) {
            throw new Error(`[Proxy] Critical Failure: Cannot load locator artifact at ${filePath}. ${error.message}`);
        }
    }

    locatorsCache = merged;
    return merged;
}

export function hasLocatorKey(logicalKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(loadLocators(), logicalKey);
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