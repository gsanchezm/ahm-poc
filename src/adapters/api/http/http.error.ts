import { HttpMethod } from './http-method.enum';

export interface HttpErrorDetails {
    status: number;
    method: HttpMethod;
    url: string;
    responseBody: unknown;
}

export class HttpError extends Error {
    readonly status: number;
    readonly method: HttpMethod;
    readonly url: string;
    readonly responseBody: unknown;

    constructor(message: string, details: HttpErrorDetails) {
        super(message);
        this.name = 'HttpError';
        this.status = details.status;
        this.method = details.method;
        this.url = details.url;
        this.responseBody = details.responseBody;
    }
}
