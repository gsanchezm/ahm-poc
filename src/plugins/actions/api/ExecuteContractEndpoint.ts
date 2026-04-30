// EXECUTE_CONTRACT_ENDPOINT — load an ApiContract endpoint, render its
// templates with the supplied variables, dispatch via HttpClient, validate
// expected status, and emit contract telemetry when present.
//
// Target syntax: `feature||endpointId[||{variables}]`.

import { ActionHandler } from '../ActionHandler';
import { ApiActionContext } from './ApiActionContext';
import { parseContractTarget } from '../parseCompositeTarget';
import { HttpMethod } from '../../api/http/http-method.enum';
import { HttpError } from '../../api/http/http.error';
import { ApiContractLoader } from '../../../core/contracts/api-contract-loader';
import { ContractTelemetryWriter, sha256 } from '../../../core/contracts/contract-telemetry-writer';
import { applyTemplate, applyTemplateBody, applyTemplateRecord } from './template';

function statusMatches(expected: number | number[], actual: number): boolean {
    return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

export const ExecuteContractEndpointAction: ActionHandler<ApiActionContext> = {
    name: 'EXECUTE_CONTRACT_ENDPOINT',
    async execute({ client, target, sessionId, metadata }) {
        const { feature, endpointId, variables } = parseContractTarget(target);
        const endpoint = ApiContractLoader.getEndpoint(feature, endpointId);

        const renderedPath = applyTemplate(endpoint.path, variables);
        const headers = applyTemplateRecord(endpoint.headersTemplate, variables);
        const queryRaw = applyTemplateRecord(endpoint.queryTemplate, variables);
        const queryParams = queryRaw as Record<string, string | number | boolean | null | undefined> | undefined;
        const body = endpoint.bodyTemplate !== undefined
            ? applyTemplateBody(endpoint.bodyTemplate, variables)
            : undefined;

        const method = endpoint.method as HttpMethod;
        const isReadOrDelete = method === HttpMethod.GET || method === HttpMethod.DELETE;

        const startedAt = Date.now();
        let responseStatus: number | null = null;
        let errorMessage: string | null = null;
        let response: unknown = null;
        let status: 'PASS' | 'FAIL' = 'PASS';

        try {
            response = await client.request(method, renderedPath, {
                headers,
                queryParams: isReadOrDelete ? queryParams : undefined,
                body: isReadOrDelete ? undefined : body,
            });
            responseStatus = 200;
        } catch (err) {
            if (err instanceof HttpError) {
                responseStatus = err.status;
                response = err.responseBody ?? null;
            } else {
                errorMessage = (err as Error).message;
            }

            if (errorMessage || responseStatus === null) {
                status = 'FAIL';
            }
        }

        const durationMs = Date.now() - startedAt;

        if (responseStatus !== null && !statusMatches(endpoint.expect.status, responseStatus)) {
            status = 'FAIL';
            const expected = Array.isArray(endpoint.expect.status)
                ? endpoint.expect.status.join('|')
                : endpoint.expect.status;
            errorMessage = errorMessage ?? `expected status ${expected}, got ${responseStatus}`;
        }

        if (endpoint.telemetry?.enabled) {
            try {
                await ContractTelemetryWriter.writeApiEvent({
                    feature,
                    contractId: `${feature}@${endpoint.id}`,
                    endpointId: endpoint.id,
                    method: endpoint.method,
                    path: renderedPath,
                    status,
                    durationMs,
                    errorMessage: errorMessage ?? null,
                    responseStatus,
                    responseTimeMs: durationMs,
                    requestHeadersHash: sha256(headers ?? null),
                    requestBodyHash: sha256(body ?? null),
                    metadata: { ...(metadata ?? {}), sessionId },
                    extractedKeys: (endpoint.extract ?? []).map((e) => e.name),
                    assertionCount: (endpoint.expect.jsonPathAssertions ?? []).length,
                });
            } catch { /* telemetry is best-effort unless TOM_TELEMETRY_STRICT=true (handled inside writer) */ }
        }

        if (status === 'FAIL') {
            throw new Error(`[EXECUTE_CONTRACT_ENDPOINT] ${feature}/${endpoint.id}: ${errorMessage ?? 'failed'}`);
        }

        return JSON.stringify({
            feature,
            endpointId: endpoint.id,
            method: endpoint.method,
            path: renderedPath,
            responseStatus,
            durationMs,
            response,
        });
    },
};
