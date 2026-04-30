// VALIDATE_CONTRACT_ENDPOINT — verify that a contract endpoint is loadable
// and well-formed without dispatching the call. Useful as a sanity step
// in feature suites that ship contract changes alongside scenarios.

import { ActionHandler } from '../ActionHandler';
import { ApiActionContext } from './ApiActionContext';
import { parseContractTarget } from '../parseCompositeTarget';
import { ApiContractLoader } from '../../../core/contracts/api-contract-loader';
import { applyTemplate, applyTemplateBody, applyTemplateRecord } from './template';

export const ValidateContractEndpointAction: ActionHandler<ApiActionContext> = {
    name: 'VALIDATE_CONTRACT_ENDPOINT',
    async execute({ target }) {
        const { feature, endpointId, variables } = parseContractTarget(target);
        const endpoint = ApiContractLoader.getEndpoint(feature, endpointId);

        const renderedPath = applyTemplate(endpoint.path, variables);
        const renderedHeaders = applyTemplateRecord(endpoint.headersTemplate, variables);
        const renderedQuery = applyTemplateRecord(endpoint.queryTemplate, variables);
        const renderedBody = endpoint.bodyTemplate !== undefined
            ? applyTemplateBody(endpoint.bodyTemplate, variables)
            : undefined;

        return JSON.stringify({
            feature,
            endpointId: endpoint.id,
            method: endpoint.method,
            path: renderedPath,
            hasHeaders: !!renderedHeaders,
            hasQuery: !!renderedQuery,
            hasBody: renderedBody !== undefined,
            expectedStatus: endpoint.expect.status,
            assertionCount: (endpoint.expect.jsonPathAssertions ?? []).length,
            extractCount: (endpoint.extract ?? []).length,
        });
    },
};
