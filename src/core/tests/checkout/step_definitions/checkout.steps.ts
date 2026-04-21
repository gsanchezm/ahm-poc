import { After, AfterAll, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';

// 10 min covers a cold WDA build on first scenario (~5 min) plus the place-order
// API roundtrip on Render free tier; subsequent scenarios reuse the session and
// finish in well under a minute.
setDefaultTimeout(600_000);
import { UsersDataSource } from '../../../test-data/users.data-source';
import { LoginDao } from '../dao/login.dao';
import { OrderingDao } from '../dao/ordering.dao';
import type { CheckoutWorld } from '../../support/world';
import { sendIntent, closeClient } from '../../../../kernel/client';
import { fillDeliveryDetails, choosePaymentMethod, enterCardDetails, verifyOrderAccepted } from '../usecases/checkout-delivery.usecase';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'eco-system', domain: 'checkout' });

const usersDataSource = new UsersDataSource();
const orderingDao = new OrderingDao();

Given('the OmniPizza user is logged in as {string}', async function (userAlias: string) {
  log.info({ userAlias }, 'Logging in user');
  const user = await usersDataSource.getUser(userAlias);
  const loginDao = new LoginDao();
  const loginResponse = await loginDao.login({
    username: user.username,
    email: user.email,
    password: user.password,
  });
  log.info({ userAlias, username: user.username, hasToken: !!loginResponse.token }, 'Login API response received');

  const token = loginDao.extractToken(loginResponse);
  if (!token) {
    throw new Error(`Login failed for user "${userAlias}". No token received.`);
  }

  log.info({ userAlias, behavior: user.behavior }, 'Login successful');

  (this as CheckoutWorld).auth = {
    userAlias,
    username: user.username,
    password: user.password,
    behavior: user.behavior,
    token,
    loginResponse,
  };
});

Given('they are ordering in market {string}', async function (market: string) {
  log.info({ market }, 'Fetching countries');
  const countries = await orderingDao.getCountries();

  if (!countries || countries.length === 0) {
    throw new Error('Countries API returned empty response. Verify API_BASE_URL and /api/countries endpoint.');
  }

  log.info({ market, countriesAvailable: countries.map((c) => c.code) }, 'Countries API response received');

  const selectedCountry = countries.find((country) => country.code === market);
  if (!selectedCountry) {
    const supportedCountries = countries.map((country) => country.code).join(', ');
    throw new Error(`Unsupported market "${market}". Supported markets: ${supportedCountries}`);
  }

  if (!selectedCountry.currency || !selectedCountry.currency_symbol) {
    throw new Error(`Market "${market}" is missing currency configuration.`);
  }

  log.info({
    market,
    currency: selectedCountry.currency,
    languages: selectedCountry.languages,
    requiredFields: selectedCountry.required_fields,
  }, 'Market selected');

  const world = this as CheckoutWorld;
  world.orderContext = {
    market: selectedCountry.code,
    countryInfo: selectedCountry,
    availableLanguages: selectedCountry.languages,
    requiredFields: selectedCountry.required_fields,
    currency: selectedCountry.currency,
    currencySymbol: selectedCountry.currency_symbol,
    item: '',
    size: '',
    qty: 0,
    pizzaId: '',
    pizzaName: '',
    unitPrice: 0,
    cartItems: [],
  };
});

Given(
  'they have an order with {string} size {string} quantity {int}',
  async function (item: string, size: string, qty: number) {
    const world = this as CheckoutWorld;
    const token = world.auth?.token;
    if (!token) {
      throw new Error('Missing auth token. Ensure login step runs before creating an order');
    }

    const market = world.orderContext?.market;
    if (!market) {
      throw new Error('Missing market context. Ensure market step runs before order setup');
    }

    log.info({ market, item, size, qty }, 'Fetching pizzas');
    const pizzas = await orderingDao.getPizzas({ token, countryCode: market });

    if (!pizzas || pizzas.length === 0) {
      throw new Error(`Pizzas API returned empty response for market "${market}". Verify /api/pizzas endpoint.`);
    }

    log.info({ market, pizzasAvailable: pizzas.map((p) => p.name) }, 'Pizzas API response received');

    const selectedPizza = pizzas.find((pizza) => pizza.name.toLowerCase() === item.toLowerCase());
    if (!selectedPizza) {
      const availablePizzas = pizzas.map((pizza) => pizza.name).join(', ');
      throw new Error(`Pizza "${item}" not found for market "${market}". Available: ${availablePizzas}`);
    }

    if (!selectedPizza.id || selectedPizza.price <= 0) {
      throw new Error(`Pizza "${item}" has invalid data: id="${selectedPizza.id}", price=${selectedPizza.price}`);
    }

    log.info({
      pizzaId: selectedPizza.id,
      pizzaName: selectedPizza.name,
      price: selectedPizza.price,
      currency: world.orderContext?.currency,
    }, 'Pizza selected for order');

    // Add to cart via API ($S_0$ state injection)
    await orderingDao.addToCart({
      token,
      countryCode: market,
      items: [{ pizza_id: selectedPizza.id, size, quantity: qty }],
    });

    // Fetch enriched cart — POST only stores IDs, GET returns full item details (unit_price, pizza object, etc.)
    const enrichedCart = await orderingDao.getCart({ token, countryCode: market });
    const enrichedItems = enrichedCart.cart_items;
    log.info({ cartItems: enrichedItems }, 'Cart populated via API');

    const unitPrice = enrichedItems[0]?.unit_price ?? selectedPizza.price;

    world.orderContext = {
      ...(world.orderContext as NonNullable<CheckoutWorld['orderContext']>),
      item,
      size,
      qty,
      pizzaId: selectedPizza.id,
      pizzaName: selectedPizza.name,
      unitPrice,
      cartItems: enrichedItems,
    };
  }
);

When(
  'they provide delivery details {string} {string}, {string} for {string} {string}',
  async function (street: string, zip: string, suburb: string, name: string, phone: string) {
    const world = this as CheckoutWorld;
    const token = world.auth?.token;
    if (!token) throw new Error('Missing auth token. Ensure login step runs first');
    const market = world.orderContext?.market;
    if (!market) throw new Error('Missing market context. Ensure market step runs first');

    log.info({ street, zip, suburb: suburb || undefined, name, phone }, 'Filling delivery details');
    await fillDeliveryDetails(
      {
        token,
        username: world.auth!.username,
        password: world.auth!.password,
        countryCode: market,
        cartItems: world.orderContext!.cartItems,
        countryInfo: world.orderContext!.countryInfo,
      },
      { street, zip, suburb: suburb || undefined },
      { name, phone },
    );
    world.contact = { name, phone };
    log.info('Delivery details submitted');
  },
);

When(
  'they choose payment method {string}',
  async function (paymentMethod: string) {
    log.info({ paymentMethod }, 'Selecting payment method');
    await choosePaymentMethod(paymentMethod);
    log.info({ paymentMethod }, 'Payment method selected');
  },
);

When(
  'they enter card details {string} expiration {string} cvv {string}',
  async function (card: string, exp: string, cvv: string) {
    const world = this as CheckoutWorld;
    log.info({ cardLastFour: card.slice(-4) }, 'Entering card details');
    await enterCardDetails(card, exp, cvv, world.contact?.name);
    log.info('Card details entered');
  },
);

Then('the order is accepted', async function () {
  const world = this as CheckoutWorld;
  const countryInfo = world.orderContext?.countryInfo;
  if (!countryInfo) {
    throw new Error('Missing country metadata. Ensure market step runs before verification.');
  }

  log.info({
    market: countryInfo.code,
    taxRate: countryInfo.tax_rate,
    deliveryFee: countryInfo.delivery_fee,
  }, 'Verifying order acceptance');

  await verifyOrderAccepted(countryInfo, world.orderContext!.cartItems);

  log.info({ market: countryInfo.code }, 'Order verified successfully');
});

After(async function () {
  try {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'appium') {
      // Reset app auth state between scenarios — clears Zustand store and returns to Login screen
      await sendIntent('DEEP_LINK', 'omnipizza://login?resetSession=true');
    } else {
      // Clear browser state between scenarios without closing the browser
      await sendIntent('EVALUATE', 'localStorage.clear(); sessionStorage.clear()');
      await sendIntent('NAVIGATE', process.env.BASE_URL!);
    }
  } catch {
    // Proxy may not be running (e.g. DAO-only test runs)
  }
});

AfterAll(async function () {
  try {
    await sendIntent('TEARDOWN', '');
  } catch {
    // no-op
  }
  closeClient();
});
