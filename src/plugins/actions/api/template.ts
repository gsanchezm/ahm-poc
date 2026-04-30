// Tiny {{variable}} template helper used by API contract execution.
// Deliberately minimal — handlebars/mustache would be overkill for a
// contract that already validates required keys at load time.

export function applyTemplate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
        const value = vars[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

export function applyTemplateRecord(
    record: Record<string, string> | undefined,
    vars: Record<string, unknown>,
): Record<string, string> | undefined {
    if (!record) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
        out[applyTemplate(k, vars)] = applyTemplate(v, vars);
    }
    return out;
}

export function applyTemplateBody(body: unknown, vars: Record<string, unknown>): unknown {
    if (body === null || body === undefined) return body;
    if (typeof body === 'string') return applyTemplate(body, vars);
    if (Array.isArray(body)) return body.map((v) => applyTemplateBody(v, vars));
    if (typeof body === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            out[k] = applyTemplateBody(v, vars);
        }
        return out;
    }
    return body;
}
