import { featureToRows }       from '../../../../plugins/gatling/support/feature-to-rows';
import { FeatureToRowsOptions } from '../../../../plugins/gatling/support/types';
import { parseMoney }           from './money';

export type CheckoutRow = Record<string, unknown> & {
    market:   string;
    item:     string;
    size:     string;
    qty:      number;
    street:   string;
    zip:      string;
    suburb:   string;
    name:     string;
    phone:    string;
    payment:  string;
    card:     string;
    exp:      string;
    cvv:      string;
    subtotal: number;
    tax:      number;
    total:    number;
};

const CHECKOUT_FEATURE: FeatureToRowsOptions = {
    featurePath:  'src/core/tests/checkout/features/checkout.feature',
    scenarioName: 'Place a delivery order in <market> with <payment>',
};

/**
 * Returns CheckoutRow[] ready for Gatling arrayFeeder().
 * Defaults to all Examples tables; pass includeExamples to filter by name.
 */
export function featureToCheckoutRows(includeExamples?: string[]): CheckoutRow[] {
    return featureToRows<CheckoutRow>(
        { ...CHECKOUT_FEATURE, includeExamples },
        (row) => ({
            market:   row['market'],
            item:     row['item'],
            size:     row['size'],
            qty:      parseInt(row['qty'], 10),
            street:   row['street'],
            zip:      row['zip'],
            suburb:   row['suburb']  ?? '',
            name:     row['name'],
            phone:    row['phone'],
            payment:  row['payment'],
            card:     row['card']    ?? '',
            exp:      row['exp']     ?? '',
            cvv:      row['cvv']     ?? '',
            subtotal: parseMoney(row['subtotal']),
            tax:      parseMoney(row['tax']),
            total:    parseMoney(row['total']),
        }),
    );
}
