import { AfterAll, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(180_000);
import { UsersDataSource } from '../../../test-data/users.data-source';
import { LoginDao } from '../dao/login.dao';
import { OrderingDao } from '../dao/ordering.dao';
import type { CheckoutWorld } from '../../support/world';
import { sendIntent, closeClient } from '../../../../kernel/client';
import { fillDeliveryDetails, submitPayment, verifyOrderAccepted } from '../usecases/checkout-delivery.usecase';
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
    const cartResponse = await orderingDao.addToCart({
      token,
      countryCode: market,
      items: [{ pizza_id: selectedPizza.id, size, quantity: qty }],
    });
    log.info({ cartItems: cartResponse.cart_items }, 'Cart populated via API');

    world.orderContext = {
      ...(world.orderContext as NonNullable<CheckoutWorld['orderContext']>),
      item,
      size,
      qty,
      pizzaId: selectedPizza.id,
      pizzaName: selectedPizza.name,
      unitPrice: selectedPizza.price,
    };
  }
);

When(
  'they provide delivery details {string} {string} for {string} {string}',
  async function (street: string, zip: string, name: string, phone: string) {
    const world = this as CheckoutWorld;
    const token = world.auth?.token;
    if (!token) throw new Error('Missing auth token. Ensure login step runs first');
    const market = world.orderContext?.market;
    if (!market) throw new Error('Missing market context. Ensure market step runs first');

    log.info({ street, zip, name, phone }, 'Filling delivery details');
    await fillDeliveryDetails(
      { token, username: world.auth!.username, countryCode: market },
      { street, zip },
      { name, phone },
    );
    log.info('Delivery details submitted');
  },
);

When(
  'they choose payment method {string} with card {string} expiration {string} cvv {string}',
  async function (paymentMethod: string, card: string, exp: string, cvv: string) {
    log.info({ paymentMethod, cardLastFour: card ? card.slice(-4) : 'N/A' }, 'Submitting payment');
    await submitPayment({ method: paymentMethod, card, exp, cvv });
    log.info({ paymentMethod }, 'Payment submitted');
  },
);

Then(
  'the order is accepted with subtotal {string} tax {string} and total {string}',
  async function (subtotal: string, tax: string, total: string) {
    log.info({ subtotal, tax, total }, 'Verifying order acceptance');
    await verifyOrderAccepted({ subtotal, tax, total });
    log.info({ subtotal, tax, total }, 'Order verified successfully');
  },
);

AfterAll(async function () {
  log.info('Tearing down');
  try {
    await sendIntent('TEARDOWN', '');
  } catch {
    // Proxy may not be running (e.g. DAO-only test runs)
  }
  closeClient();
});
