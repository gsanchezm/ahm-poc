import { injectBrowserSession, BrowserSessionState } from '../actions/checkout-auth.molecule';
import { navigateToCheckout } from '../actions/checkout-navigation.molecule';
import { fillDeliveryAddress, fillContactInfo, SecondaryAddressField } from '../actions/checkout-address.molecule';
import { selectPaymentMethod, fillCardDetails } from '../actions/checkout-payment.molecule';
import { placeOrder, verifyOrderAccepted as verifyOrderOnUI } from '../actions/checkout-order.molecule';
import type { CartItemResponse, CountryInfo } from '../dao/ordering.dao';

// Fields rendered alongside the zipcode slot in the checkout form.
// Today only MX's `colonia` lives there; JP's `prefectura` is NOT a secondary
// — it replaces the zip in the single "market-specific address" slot.
const SECONDARY_ADDRESS_FIELDS = ['colonia'] as const;

// The mobile UI renders a single TextInput (testID=`input-zipcode`) for the
// market-specific address field regardless of whether the backend names it
// `zip_code` / `plz` / `prefectura`. Route the feature-file value that
// corresponds to that slot — JP's prefecture arrives via the `suburb`
// column, everyone else's postal code arrives via the `zip` column.
function pickZipSlotValue(
    countryInfo: CountryInfo,
    delivery: DeliveryDetails,
): string | undefined {
    const fields = countryInfo.required_fields ?? [];
    if (fields.includes('prefectura')) {
        return delivery.suburb || undefined;
    }
    return delivery.zip || undefined;
}

function pickSecondaryAddressField(
    countryInfo: CountryInfo,
    value?: string,
): SecondaryAddressField | undefined {
    if (!value) return undefined;
    const field = countryInfo.required_fields.find((f) =>
        (SECONDARY_ADDRESS_FIELDS as readonly string[]).includes(f),
    );
    return field ? { locatorKey: `${field}Input`, value } : undefined;
}

export interface DeliveryDetails {
    street: string;
    zip: string;
    suburb?: string;
}

export interface ContactDetails {
    name: string;
    phone: string;
}

export async function fillDeliveryDetails(
    session: BrowserSessionState,
    delivery: DeliveryDetails,
    contact: ContactDetails,
): Promise<void> {
    await injectBrowserSession(session);
    await navigateToCheckout(session.countryCode, session.token);
    const secondary = pickSecondaryAddressField(session.countryInfo, delivery.suburb);
    const zipSlot = pickZipSlotValue(session.countryInfo, delivery);
    await fillDeliveryAddress(delivery.street, zipSlot, secondary);
    await fillContactInfo(contact.name, contact.phone);
}

export async function choosePaymentMethod(method: string): Promise<void> {
    await selectPaymentMethod(method);
}

export async function enterCardDetails(
    card: string,
    exp: string,
    cvv: string,
    holderName?: string,
): Promise<void> {
    await fillCardDetails(card, exp, cvv, holderName);
}

export async function verifyOrderAccepted(
    countryInfo: CountryInfo,
    cartItems: CartItemResponse[],
): Promise<void> {
    await placeOrder();
    await verifyOrderOnUI(countryInfo, cartItems);
}
