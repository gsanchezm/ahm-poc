// Shared action handler contract used by every plugin registry.
// New actions are added by implementing ActionHandler and calling
// ActionRegistry.register — the existing plugin file does not need
// to be modified, satisfying the Open/Closed Principle.

export interface ActionContext<TDriver = unknown> {
    /** Underlying driver/session object — Page for Playwright, WebdriverIO Browser for Appium, HttpClient for API. */
    driver?: TDriver;
    /** Raw target string passed by the kernel (selector, URL, composite "selector||text", etc.). */
    target: string;
    /** Normalized (upper-cased) action id. */
    actionId: string;
    /** Cucumber worker / parallel session id. Defaults to "0" when not provided. */
    sessionId: string;
    /** Optional platform tag — "android" / "ios" for Appium, "web" for Playwright. */
    platform?: string;
    /** Optional viewport tag — "desktop" / "responsive" for Playwright. */
    viewport?: string;
    /** Free-form metadata: plugin name, contract refs, telemetry hints. */
    metadata?: Record<string, unknown>;
}

export interface ActionHandler<TContext extends ActionContext = ActionContext> {
    /** Action id. Registered upper-cased; case-insensitive at call time. */
    name: string;
    /** Execute the action with the supplied context and return a useful result string. */
    execute(ctx: TContext): Promise<string>;
}
