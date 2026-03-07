import { logger } from '../../utils/logger';

// --- Intent -> Handler Map for Performance Profiles ---

type PerfHandler = (target: string) => Promise<string>;

const actionHandlers: ReadonlyMap<string, PerfHandler> = new Map([
    [
        'SCENARIO_LOAD',
        async (scenarioPath) => {
            // Stub: Here we could spawn a JVM or invoke gatling.sh
            return `Loaded Gatling simulation module: ${scenarioPath}`;
        },
    ],
    [
        'INJECT_LOAD',
        async (profileSettings) => {
            // profileSettings might look like "users=100|duration=60"
            return `Began Gatling load injection profile: ${profileSettings}`;
        },
    ]
]);

export async function execute(
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    logger.info(`[Gatling Adapter] Relaying intent ${normalizedAction} to load engine...`);

    const handler = actionHandlers.get(normalizedAction);
    if (!handler) {
        throw new Error(`Unsupported Gatling performance actionId: ${actionId}`);
    }

    return await handler(targetSelector);
}
