import { sendIntent } from '../../../../kernel/client';

export async function selectPaymentMethod(method: string): Promise<void> {
    const locatorKey = method.toLowerCase() === 'cash' ? 'paymentCashButton' : 'paymentCardButton';
    await sendIntent('CLICK', locatorKey);
}

export async function fillCardDetails(card: string, exp: string, cvv: string, holderName?: string): Promise<void> {
    if (holderName) {
        await sendIntent('TYPE', `cardHolderNameInput||${holderName}`);
    }
    // Strip non-digit characters — the iOS numpad keyboard on card/expiry/cvv
    // inputs only accepts digits, so "4242 4242 4242 4242" and "12/28" arrive
    // truncated. Send the raw digits and let the app's mask render the format.
    await sendIntent('TYPE', `cardNumberInput||${card.replace(/\D/g, '')}`);
    await sendIntent('TYPE', `expiryDateInput||${exp.replace(/\D/g, '')}`);
    await sendIntent('TYPE', `cvvInput||${cvv.replace(/\D/g, '')}`);
}
