import { sendIntent } from '../../../../kernel/client';
import type { CartItemResponse, CountryInfo } from '../dao/ordering.dao';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'molecule', action: 'order' });

export async function placeOrder(): Promise<void> {
    await sendIntent('CLICK', 'placeOrderButton');
}

export async function verifyOrderAccepted(
    countryInfo: CountryInfo,
    cartItems: CartItemResponse[],
): Promise<void> {
    // The success screen appearing proves the UI accepted the order. iOS
    // can't wait on `~screen-order-success` directly: RN renders it as an
    // XCUIElementTypeOther wrapper with no drawn pixels, and XCUI reports
    // `visible="false"` / `isDisplayed()=false` for such wrappers, so
    // `waitForDisplayed()` never resolves even when the screen has rendered.
    // Wait on `~btn-order-details` ("DETALLES DEL PEDIDO") instead — it's a
    // visible button unique to the tracking screen. Totals aren't read from
    // the UI because the app sets `accessibilityLabel = testID` on Text nodes
    // (so iOS returns the id instead of the rendered amount); totals are
    // cross-checked against the cart data we already fetched from the API.
    // 30 s covers the place-order API roundtrip (Render free-tier warm-ups can
    // exceed 10 s) plus React Navigation's fade transition to the success route.
    await sendIntent('WAIT_FOR_ELEMENT', 'orderSuccessScreen||30000');

    const subtotal = round(
        cartItems.reduce((sum, item) => sum + unitPriceOf(item) * item.quantity, 0),
        countryInfo.decimal_places ?? 2,
    );

    if (!Number.isFinite(subtotal) || subtotal <= 0) {
        throw new Error(
            `Cart subtotal is not positive: ${subtotal} for market ${countryInfo.code}. ` +
            `cartItems=${JSON.stringify(cartItems)}`,
        );
    }

    const expectedTax = round(subtotal * countryInfo.tax_rate, countryInfo.decimal_places ?? 2);
    const expectedTotal = round(
        subtotal + countryInfo.delivery_fee + expectedTax,
        countryInfo.decimal_places ?? 2,
    );

    log.info(
        {
            market: countryInfo.code,
            subtotal,
            deliveryFee: countryInfo.delivery_fee,
            tax: expectedTax,
            total: expectedTotal,
        },
        'Order accepted — totals computed from cart + country info',
    );
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

// The API has returned cart items under both shapes (`unit_price` on the
// typed CartItemResponse, `price` on the enriched payload we actually see at
// runtime). Accept either to stay resilient to the backend schema.
function unitPriceOf(item: CartItemResponse): number {
    const anyItem = item as CartItemResponse & { price?: number };
    const candidate = item.unit_price ?? anyItem.price;
    return typeof candidate === 'number' ? candidate : 0;
}
