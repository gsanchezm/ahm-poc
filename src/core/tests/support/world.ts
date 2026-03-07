import { CountryCode } from '../../shared/enums/country-code.enum';
import type { LoginResponse } from '../checkout/dao/login.dao';

export interface CheckoutWorld {
    auth?: {
        userAlias: string;
        username: string;
        behavior?: string;
        token?: string;
        loginResponse: LoginResponse;
    };
    orderContext?: {
        market: CountryCode;
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
    };
}

