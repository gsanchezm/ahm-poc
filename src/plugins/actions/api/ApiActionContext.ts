import { ActionContext } from '../ActionHandler';
import { HttpClient } from '../../api/http/http.client';

export interface ApiActionContext extends ActionContext<HttpClient> {
    client: HttpClient;
    target: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
}
