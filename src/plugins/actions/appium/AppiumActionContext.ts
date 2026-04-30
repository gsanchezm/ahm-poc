import type { Browser } from 'webdriverio';
import { ActionContext } from '../ActionHandler';
import type { AppiumHelpers } from '../../appium/appium-helpers';

export interface AppiumActionContext extends ActionContext<Browser> {
    driver: Browser;
    target: string;
    sessionId: string;
    platform: string;
    helpers: AppiumHelpers;
}
