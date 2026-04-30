import { ActionHandler } from '../ActionHandler';
import { logger } from '../../../utils/logger';
import { AppiumActionContext } from './AppiumActionContext';

/**
 * DEEP_LINK — navigate directly to a screen via the omnipizza:// URI scheme.
 * Target may be a full URI or a path-only value (scheme is prepended).
 */
export const DeepLinkAction: ActionHandler<AppiumActionContext> = {
    name: 'DEEP_LINK',
    async execute({ driver, target, platform, helpers }) {
        const url = target.startsWith('omnipizza://') ? target : `omnipizza://${target}`;
        const appId = helpers.getAppId();

        if (platform === 'ios') {
            await driver.executeScript('mobile: deepLink', [{ url, bundleId: appId }]);
        } else {
            await driver.executeScript('mobile: deepLink', [{ url, package: appId }]);
        }

        logger.debug({ url, appId, platform }, '[Appium] Deep link processed');
        return `Deep linked to: ${url}`;
    },
};
