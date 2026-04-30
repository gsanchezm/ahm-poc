// Generic HTTP_GET/POST/PUT/PATCH/DELETE handlers.
// Target syntax: `path` or `path||{jsonPayload}`.
//   - GET/DELETE: jsonPayload is treated as queryParams.
//   - POST/PUT/PATCH: jsonPayload is treated as request body.
// Authorization headers and request bodies are never logged in raw form;
// the registry already masks the right side of the composite target.

import { ActionHandler } from '../ActionHandler';
import { HttpMethod } from '../../api/http/http-method.enum';
import { ApiActionContext } from './ApiActionContext';
import { ACTION_TYPE_SEPARATOR } from '../parseCompositeTarget';

interface ParsedHttpTarget {
    path: string;
    payload: Record<string, unknown> | undefined;
}

function parseHttpTarget(target: string): ParsedHttpTarget {
    if (!target) {
        throw new Error('HTTP action requires a target path.');
    }
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) return { path: target, payload: undefined };

    const path = target.slice(0, sepIndex);
    const tail = target.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);
    if (!tail) return { path, payload: undefined };

    try {
        const parsed = JSON.parse(tail);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { path, payload: parsed as Record<string, unknown> };
        }
        throw new Error('payload JSON must be an object');
    } catch (err) {
        throw new Error(`Invalid HTTP payload JSON: ${(err as Error).message}`);
    }
}

function makeHandler(method: HttpMethod, name: string): ActionHandler<ApiActionContext> {
    return {
        name,
        async execute({ client, target }) {
            const { path, payload } = parseHttpTarget(target);
            const isReadOrDelete = method === HttpMethod.GET || method === HttpMethod.DELETE;
            const startedAt = Date.now();
            const response = await client.request<unknown>(method, path, isReadOrDelete
                ? { queryParams: payload as Record<string, string | number | boolean | null | undefined> | undefined }
                : { body: payload },
            );
            const durationMs = Date.now() - startedAt;
            return JSON.stringify({ method, path, durationMs, response });
        },
    };
}

export const HttpGetAction = makeHandler(HttpMethod.GET, 'HTTP_GET');
export const HttpPostAction = makeHandler(HttpMethod.POST, 'HTTP_POST');
export const HttpPutAction = makeHandler(HttpMethod.PUT, 'HTTP_PUT');
export const HttpPatchAction = makeHandler(HttpMethod.PATCH, 'HTTP_PATCH');
export const HttpDeleteAction = makeHandler(HttpMethod.DELETE, 'HTTP_DELETE');
