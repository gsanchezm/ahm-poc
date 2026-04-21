import { HttpClient, CountryCode } from '../../../../plugins/api/http';

export interface CountryInfo {
    code: CountryCode;
    currency: string;
    currency_symbol: string;
    required_fields: string[];
    optional_fields: string[];
    tax_rate: number;
    delivery_fee: number;
    tip_field: string;
    tip_mode: 'percentage';
    languages: string[];
    decimal_places?: number;
}

export interface CheckoutRequest {
    country_code: CountryCode;
    items: CartItemRequest[];
    name: string;
    address: string;
    phone: string;
    payment_method: string;
    zip_code?: string;
    plz?: string;
    colonia?: string;
    prefectura?: string;
    card_number?: string;
    card_expiry?: string;
    card_cvv?: string;
    [tipField: string]: unknown;
}

export interface CheckoutResponse {
    order_id: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    tax: number;
    tip?: number;
    total: number;
    currency: string;
    currency_symbol: string;
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

export interface CartItemResponse {
    id: string;
    signature: string;
    pizza_id: string;
    pizza: Pizza;
    quantity: number;
    config: { size: string; toppings: string[] };
    unit_price: number;
    currency: string;
    currency_symbol: string;
}

export interface CartResponse {
    username: string;
    country_code: CountryCode;
    cart_items: CartItemResponse[];
    updated_at: string;
}

export interface OrderingDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

export { CountryCode };

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

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

    async getCart(params: {
        token: string;
        countryCode: CountryCode;
    }): Promise<CartResponse> {
        return this.httpClient.get<CartResponse>('/api/cart', {
            headers: {
                Authorization: `Bearer ${params.token}`,
                'x-country-code': params.countryCode,
            },
        });
    }

    async placeOrder(params: {
        token: string;
        countryCode: CountryCode;
        body: CheckoutRequest;
    }): Promise<CheckoutResponse> {
        return this.httpClient.post<CheckoutResponse>('/api/checkout', {
            headers: {
                Authorization: `Bearer ${params.token}`,
                'x-country-code': params.countryCode,
            },
            body: params.body,
        });
    }
}
