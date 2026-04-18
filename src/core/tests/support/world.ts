import { CountryCode } from '../../shared/enums/country-code.enum';
import type { LoginResponse } from '../checkout/dao/login.dao';
import type { CartItemResponse, CountryInfo } from '../checkout/dao/ordering.dao';

export interface CheckoutWorld {
    auth?: {
        userAlias: string;
        username: string;
        password: string;
        behavior?: string;
        token?: string;
        loginResponse: LoginResponse;
    };
    orderContext?: {
        market: CountryCode;
        countryInfo: CountryInfo;
        availableLanguages: string[];
        requiredFields: string[];
        currency: string;
        currencySymbol: string;
        item: string;
        size: string;
        qty: number;
        pizzaId: string;
        pizzaName: string;
        unitPrice: number;
        cartItems: CartItemResponse[];
    };
    contact?: {
        name: string;
        phone: string;
    };
}

