import { logger } from '../../utils/logger';
import { HttpClient } from './http/http.client';

export async function execute(
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // In API context, targetSelector usually encodes endpoint||payload||headers
    logger.info(`[API Adapter] Executing ${normalizedAction} on ${targetSelector}`);

    // For now, this is a skeleton implementation. In a real integration,
    // this adapter maps BDD steps to direct API calls via HttpClient instead of UI interactions.

    return `API intent ${normalizedAction} executed successfully on ${targetSelector}`;
}
