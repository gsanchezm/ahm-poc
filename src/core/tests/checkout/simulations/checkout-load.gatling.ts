/**
 * Checkout Load Simulation
 *
 * Feature-driven: feeder rows come directly from checkout.feature Examples tables.
 * The .feature file is the single source of truth — no hardcoded data here.
 *
 * API flow (mirrors the Scenario Outline at the HTTP level):
 *   Login → Get Pizzas (by market) → Checkout (items + delivery + payment)
 *
 * Market-specific address fields:
 *   US  → zip_code
 *   MX  → zip_code + colonia  (suburb column)
 *   CH  → plz
 *   JP  → zip_code + prefectura  (suburb column)
 *
 * Usage:
 *   pnpm perf:smoke    →  1 user, single iteration (validate the chain works)
 *   pnpm perf:load     →  ramp to 20 users over 2 min
 *   pnpm perf:stress   →  50 users injected at once
 *
 * Env overrides:
 *   PERF_USERS=N       override concurrent user count for load/stress
 *   PERF_DURATION=N    ramp duration in seconds (load profile only, default: 120)
 */

import {
    simulation,
    scenario,
    atOnceUsers,
    rampUsers,
    arrayFeeder,
    StringBody,
    bodyString,
    jsonPath,
    getEnvironmentVariable,
    Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

import { checkoutRows } from './checkout-rows.generated';

// ---------------------------------------------------------------------------
// Feeder — sourced from checkout.feature Examples tables (pre-generated)
// Re-generate with: ts-node scripts/generate-checkout-feeder.ts
// ---------------------------------------------------------------------------

const checkoutFeeder = arrayFeeder(checkoutRows).circular();

// ---------------------------------------------------------------------------
// Injection profile — controlled by PERF_PROFILE env var
// ---------------------------------------------------------------------------

const PROFILE  = getEnvironmentVariable('PERF_PROFILE',  'smoke').toLowerCase();
const USERS    = parseInt(getEnvironmentVariable('PERF_USERS',    '20'),  10);
const DURATION = parseInt(getEnvironmentVariable('PERF_DURATION', '120'), 10);

const INJECTION_PROFILES = new Map([
    ['smoke',  () => atOnceUsers(1)],
    ['load',   () => rampUsers(USERS).during(DURATION)],
    ['stress', () => atOnceUsers(USERS)],
]);

function injectionProfile() {
    const factory = INJECTION_PROFILES.get(PROFILE);
    if (!factory) {
        throw new Error(
            `Unknown PERF_PROFILE="${PROFILE}". Valid values: ${[...INJECTION_PROFILES.keys()].join(' | ')}`,
        );
    }
    return factory();
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export default simulation((setUp) => {
    const apiBaseUrl = getEnvironmentVariable('API_BASE_URL');
    if (!apiBaseUrl) {
        throw new Error('Missing required env var: API_BASE_URL');
    }

    const httpProtocol = http
        .baseUrl(apiBaseUrl)
        .header('Content-Type', 'application/json')
        .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

    const checkout = scenario('Checkout API Flow')
        .feed(checkoutFeeder)

        // ── Step 1: Login ──────────────────────────────────────────────────
        // Mirrors: "Given the OmniPizza user is logged in as standard_user"
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
                .check(jsonPath('$.access_token').saveAs('token')),
        )

        // ── Step 2: Get Pizzas for the feeder market ───────────────────────
        // Mirrors: "they are ordering in market <market>"
        .exec(
            http('Get Pizzas')
                .get('/api/pizzas')
                .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
                .header('x-country-code', (session: Session) => session.get<string>('market'))
                .check(bodyString().saveAs('pizzasBody')),
        )

        // ── Extract pizza ID matching feeder item ──────────────────────────
        .exec((session: Session) => {
            const body  = JSON.parse(session.get<string>('pizzasBody'));
            const item  = session.get<string>('item');
            const pizza = (body.pizzas as Array<{ id: string; name: string }>)
                .find((p) => p.name.toLowerCase() === item.toLowerCase());

            if (!pizza) {
                console.error(`[checkout-load] Pizza "${item}" not found for market "${session.get('market')}"`);
                return session.markAsFailed();
            }

            return session.set('pizzaId', pizza.id);
        })

        // ── Build market-specific checkout payload ─────────────────────────
        .exec((session: Session) => {
            const market  = session.get<string>('market');
            const zip     = session.get<string>('zip');
            const suburb  = session.get<string>('suburb');
            const payment = session.get<string>('payment');

            const payload: Record<string, unknown> = {
                country_code: market,
                items: [{
                    pizza_id: session.get<string>('pizzaId'),
                    size:     session.get<string>('size'),
                    quantity: session.get<number>('qty'),
                }],
                name:           session.get<string>('name'),
                address:        session.get<string>('street'),
                phone:          session.get<string>('phone'),
                payment_method: payment,
            };

            // Market-specific zip / suburb fields
            if (market === 'CH') {
                payload['plz'] = zip;
            } else {
                payload['zip_code'] = zip;
            }
            if (market === 'MX' && suburb) {
                payload['colonia'] = suburb;
            }
            if (market === 'JP' && suburb) {
                payload['prefectura'] = suburb;
            }

            // Card details (Credit Card only)
            if (payment === 'Credit Card') {
                payload['card_number'] = session.get<string>('card');
                payload['card_expiry'] = session.get<string>('exp');
                payload['card_cvv']    = session.get<string>('cvv');
            }

            return session.set('checkoutBody', JSON.stringify(payload));
        })

        // ── Step 3: Checkout ───────────────────────────────────────────────
        // Mirrors: "they provide delivery details" + "they choose payment method"
        .exec(
            http('Checkout')
                .post('/api/checkout')
                .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
                .body(StringBody((session: Session) => session.get<string>('checkoutBody')))
                .check(jsonPath('$.order_id').exists()),
        );

    setUp(checkout.injectOpen(injectionProfile())).protocols(httpProtocol);
});
