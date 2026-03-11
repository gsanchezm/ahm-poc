import { HttpClient, CountryCode } from '../../../../plugins/api/http';

export interface CountryInfo {
    code: CountryCode;
    currency: string;
    currency_symbol: string;
    required_fields: string[];
    optional_fields: string[];
    tax_rate: number;
    languages: string[];
    decimal_places?: number;
}

export interface Pizza {
    id: string;
    name: string;
    description: string;
    price: number;
    base_price: number;
    currency: string;
    currency_symbol: string;
    image: string;
}

interface PizzaResponse {
    pizzas: Pizza[];
    country_code: CountryCode;
    currency: string;
}

export interface CartItemRequest {
    pizza_id: string;
    size: string;
    quantity: number;
}

export interface CartResponse {
    username: string;
    country_code: CountryCode;
    cart_items: CartItemRequest[];
    updated_at: string;
}

export interface OrderingDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

export { CountryCode };

const DEFAULT_TIMEOUT_MS = 10_000;

export class OrderingDao {
    private readonly httpClient: HttpClient;

    constructor(options: OrderingDaoOptions = {}) {
        const apiBaseUrl = options.baseUrl ?? process.env.API_BASE_URL?.replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    getCountries(): Promise<CountryInfo[]> {
        return this.httpClient.get<CountryInfo[]>('/api/countries');
    }

    async getPizzas(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
    }): Promise<Pizza[]> {
        const response = await this.httpClient.get<PizzaResponse>('/api/pizzas', {
            headers: {
                Authorization: `Bearer ${params.token}`,
                'x-country-code': params.countryCode,
                'X-Language': params.language ?? process.env.LANGUAGE ?? 'en',
            },
        });

        return response.pizzas;
    }

    async addToCart(params: {
        token: string;
        countryCode: CountryCode;
        items: CartItemRequest[];
    }): Promise<CartResponse> {
        return this.httpClient.post<CartResponse>('/api/cart', {
            headers: {
                Authorization: `Bearer ${params.token}`,
                'x-country-code': params.countryCode,
            },
            body: { items: params.items },
        });
    }
}
