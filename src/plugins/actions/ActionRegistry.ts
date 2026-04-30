// Generic, plugin-agnostic action registry.
//
// Each plugin owns its own ActionRegistry instance and registers handlers
// at module load via a registerXxxActions() helper. Adding a new action is
// a two-step change: write a handler class, register it. The plugin file
// itself does not need to be touched — Open/Closed in practice.

import { logger } from '../../utils/logger';
import { ActionContext, ActionHandler } from './ActionHandler';
import { maskActionTarget } from './maskActionTarget';

export interface ActionRegistryOptions {
    /** Plugin tag used in log lines. */
    plugin: string;
}

export class ActionRegistry<TContext extends ActionContext = ActionContext> {
    private readonly handlers = new Map<string, ActionHandler<TContext>>();
    private readonly plugin: string;
    private readonly log = logger.child({ layer: 'action-registry' });

    constructor(options: ActionRegistryOptions) {
        this.plugin = options.plugin;
    }

    register(handler: ActionHandler<TContext>): this {
        const key = handler.name.toUpperCase();
        if (this.handlers.has(key)) {
            this.log.warn({ plugin: this.plugin, action: key }, '[ActionRegistry] Duplicate registration — overwriting');
        }
        this.handlers.set(key, handler);
        return this;
    }

    /** Register `handler` under additional aliases (e.g. TAP -> CLICK). */
    alias(target: string, ...aliases: string[]): this {
        const key = target.toUpperCase();
        const handler = this.handlers.get(key);
        if (!handler) {
            throw new Error(`[ActionRegistry:${this.plugin}] Cannot alias '${target}' — not registered`);
        }
        for (const alias of aliases) {
            this.handlers.set(alias.toUpperCase(), handler);
        }
        return this;
    }

    has(actionId: string): boolean {
        return this.handlers.has(actionId.toUpperCase());
    }

    listActions(): string[] {
        return [...this.handlers.keys()].sort();
    }

    async execute(actionId: string, context: TContext): Promise<string> {
        const normalized = actionId.toUpperCase();
        const handler = this.handlers.get(normalized);
        if (!handler) {
            throw new Error(
                `[${this.plugin}] Unsupported actionId: '${actionId}'. ` +
                `Available actions: ${this.listActions().join(', ')}`,
            );
        }

        const startedAt = Date.now();
        const maskedTarget = maskActionTarget(context.target ?? '');

        this.log.info(
            {
                event: 'ACTION_START',
                plugin: this.plugin,
                action: normalized,
                sessionId: context.sessionId,
                target: maskedTarget,
                platform: context.platform,
                viewport: context.viewport,
            },
            `[${this.plugin}] ${normalized} -> ${maskedTarget}`,
        );

        try {
            const result = await handler.execute(context);
            const durationMs = Date.now() - startedAt;
            this.log.info(
                {
                    event: 'ACTION_END',
                    plugin: this.plugin,
                    action: normalized,
                    sessionId: context.sessionId,
                    target: maskedTarget,
                    durationMs,
                    status: 'PASS',
                },
                `[${this.plugin}] ${normalized} ok (${durationMs}ms)`,
            );
            return result;
        } catch (err) {
            const durationMs = Date.now() - startedAt;
            const errorMessage = (err as Error)?.message ?? String(err);
            this.log.error(
                {
                    event: 'ACTION_ERROR',
                    plugin: this.plugin,
                    action: normalized,
                    sessionId: context.sessionId,
                    target: maskedTarget,
                    durationMs,
                    status: 'FAIL',
                    errorMessage,
                },
                `[${this.plugin}] ${normalized} failed (${durationMs}ms): ${errorMessage}`,
            );
            throw err;
        }
    }
}
