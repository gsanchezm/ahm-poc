import { remote, Browser } from 'webdriverio';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { getAppiumActionRegistry } from '../actions/appium/registerAppiumActions';
import {
    PLATFORM,
    appiumHelpers,
    dismissAndroidSystemDialog,
    setCachedAppId,
} from './appium-helpers';

// --- Capability Profile Loader ---

const CAP_PROFILE = process.env.CAP_PROFILE;

function listProfiles(): string {
    const dir = path.resolve(__dirname, 'capabilities', PLATFORM);
    if (!fs.existsSync(dir)) return '(no profiles directory found)';
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .join(', ') || '(empty)';
}

function resolveAppPath(envVar: string | undefined): string | undefined {
    if (!envVar) return undefined;
    const resolved = path.isAbsolute(envVar) ? envVar : path.resolve(process.cwd(), envVar);
    if (!fs.existsSync(resolved)) {
        logger.warn({ path: resolved }, '[Appium] App file not found — check ANDROID_APP_PATH / IOS_APP_PATH');
    }
    return resolved;
}

function resolveUdid(sessionId: string): string | undefined {
    // Per-worker UDID: IOS_UDID_0, IOS_UDID_1, … (for parallel simulators/devices)
    const perWorker = process.env[`${PLATFORM.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;

    const single = process.env[`${PLATFORM.toUpperCase()}_UDID`];
    if (single) return single;

    return undefined;
}

function loadCapabilities(sessionId: string = '0'): Record<string, unknown> {
    if (!CAP_PROFILE) {
        throw new Error(
            '[Appium] CAP_PROFILE env var is required. ' +
            `Example: CAP_PROFILE=galaxy_s25_ultra for capabilities/${PLATFORM}/galaxy_s25_ultra.json`,
        );
    }

    const capPath = path.resolve(
        __dirname,
        'capabilities',
        PLATFORM,
        `${CAP_PROFILE}.json`,
    );

    if (!fs.existsSync(capPath)) {
        throw new Error(
            `[Appium] Capability profile not found: ${capPath}\n` +
            `Available profiles: ${listProfiles()}`,
        );
    }

    const caps = JSON.parse(fs.readFileSync(capPath, 'utf-8')) as Record<string, unknown>;

    if (PLATFORM === 'android') {
        const appPath = resolveAppPath(process.env.ANDROID_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }
    if (PLATFORM === 'ios') {
        const appPath = resolveAppPath(process.env.IOS_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }

    const deviceName = process.env[`${PLATFORM.toUpperCase()}_DEVICE_NAME`];
    if (deviceName) caps['appium:deviceName'] = deviceName;

    const udid = resolveUdid(sessionId);
    if (udid) caps['appium:udid'] = udid;

    // iOS WDA port must be unique per parallel worker to avoid port conflicts
    if (PLATFORM === 'ios' && sessionId !== '0') {
        const basePort = parseInt(String(caps['appium:wdaLocalPort'] ?? '8101'), 10);
        caps['appium:wdaLocalPort'] = basePort + parseInt(sessionId, 10);
    }

    // Cache app identifier for DEEP_LINK (read once from caps at session creation time)
    if (PLATFORM === 'android') setCachedAppId(caps['appium:appPackage'] as string | undefined);
    if (PLATFORM === 'ios') setCachedAppId(caps['appium:bundleId'] as string | undefined);

    logger.info({ profile: CAP_PROFILE, platform: PLATFORM, sessionId, udid: udid ?? 'auto' }, '[Appium] Capabilities loaded');
    return caps;
}

// --- Configuration ---

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    const capabilities = loadCapabilities(sessionId);
    const wdioOptions = {
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        logLevel: 'error' as const,
        // First-run bootstrap on a fresh simulator can take several minutes:
        // WDA xcodebuild + app install + WDA launch. Match the server-side
        // wdaLaunchTimeout (4 min) with headroom for the app install step.
        connectionRetryTimeout: 360000,
        connectionRetryCount: 0,
        capabilities,
    };

    logger.info({ sessionId, platform: PLATFORM }, '[Appium] Bootstrapping session...');
    const driver = await remote(wdioOptions);
    sessions.set(sessionId, driver);
    logger.info({ sessionId, total: sessions.size }, '[Appium] Session created');
    return driver;
}

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (driver) {
        await driver.deleteSession();
        sessions.delete(sessionId);
        logger.info(`[Appium] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }
}

// --- Public API ---

export async function teardownAllSessions(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map(teardown));
    logger.info('[Appium] All sessions closed');
}

const registry = getAppiumActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a driver just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Appium execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);
    await dismissAndroidSystemDialog(driver);

    const result = await registry.execute(normalizedAction, {
        driver,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: PLATFORM,
        helpers: appiumHelpers,
        metadata: { plugin: 'appium' },
    });

    await dismissAndroidSystemDialog(driver);
    return result;
}
