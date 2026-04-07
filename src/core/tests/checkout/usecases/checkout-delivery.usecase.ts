import { injectBrowserSession, BrowserSessionState } from '../actions/checkout-auth.molecule';
import { navigateToCheckout } from '../actions/checkout-navigation.molecule';
import { fillDeliveryAddress, fillContactInfo } from '../actions/checkout-address.molecule';
import { selectPaymentMethod, fillCardDetails } from '../actions/checkout-payment.molecule';
import { placeOrder, verifyOrderSummary } from '../actions/checkout-order.molecule';

export interface DeliveryDetails {
    street: string;
    zip: string;
    suburb?: string;
}

export interface ContactDetails {
    name: string;
    phone: string;
}

export interface PaymentDetails {
    method: string;
    card?: string;
    exp?: string;
    cvv?: string;
}

export interface OrderExpectation {
    subtotal: string;
    tax: string;
    total: string;
}

export async function fillDeliveryDetails(
    session: BrowserSessionState,
    delivery: DeliveryDetails,
    contact: ContactDetails,
): Promise<void> {
    await injectBrowserSession(session);
    await navigateToCheckout(session.countryCode, session.token);
    await fillDeliveryAddress(delivery.street, delivery.zip, delivery.suburb);
    await fillContactInfo(contact.name, contact.phone);
}

export async function submitPayment(payment: PaymentDetails): Promise<void> {
    await selectPaymentMethod(payment.method);

    if (payment.method === 'Credit Card' && payment.card && payment.exp && payment.cvv) {
        await fillCardDetails(payment.card, payment.exp, payment.cvv);
    }
}

export async function verifyOrderAccepted(expected: OrderExpectation): Promise<void> {
    await placeOrder();
    await verifyOrderSummary(expected.subtotal, expected.tax, expected.total);
}
