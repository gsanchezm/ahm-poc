import { Given, Then, When } from '@cucumber/cucumber';
import { UsersDataSource } from '../../../test-data/users.data-source';
import { LoginDao } from '../dao/login.dao';
import { OrderingDao } from '../dao/ordering.dao';
import type { CheckoutWorld } from '../../support/world';


const usersDataSource = new UsersDataSource();
const orderingDao = new OrderingDao();

Given('the OmniPizza user is logged in as {string}', async function (userAlias: string) {
  const user = await usersDataSource.getUser(userAlias);
  const loginDao = new LoginDao();
  const loginResponse = await loginDao.login({
    username: user.username,
    email: user.email,
    password: user.password,
  });

  (this as CheckoutWorld).auth = {
    userAlias,
    username: user.username,
    behavior: user.behavior,
    token: loginDao.extractToken(loginResponse),
    loginResponse,
  };
});

Given('they are ordering in market {string}', async function (market: string) {
  const countries = await orderingDao.getCountries();
  const selectedCountry = countries.find((country) => country.code === market);

  if (!selectedCountry) {
    const supportedCountries = countries.map((country) => country.code).join(', ');
    throw new Error(`Unsupported market "${market}". Supported markets: ${supportedCountries}`);
  }

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

    const pizzas = await orderingDao.getPizzas({ token, countryCode: market });
    const selectedPizza = pizzas.find((pizza) => pizza.name.toLowerCase() === item.toLowerCase());
    if (!selectedPizza) {
      const availablePizzas = pizzas.map((pizza) => pizza.name).join(', ');
      throw new Error(`Pizza "${item}" not found for market "${market}". Available: ${availablePizzas}`);
    }

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

When('they provide delivery address {string} zip {string}', function (street: string, zip: string) {
  throw new Error('Step not implemented.');
});

When('they provide contact name {string} phone {string}', function (name: string, phone: string) {
  throw new Error('Step not implemented.');
});

When('they choose payment method {string}', function (paymentMethod: string) {
  throw new Error('Step not implemented.');
});

When(
  'provide card details with card number {string} expiration date {string} and cvv {string}',
  function (card: string, exp: string, cvv: string) {
    throw new Error('Step not implemented.');
  }
);

Then(
  'the order is accepted with subtotal {string} tax {string} and total {string}',
  function (subtotal: string, tax: string, total: string) {
    throw new Error('Step not implemented.');
  }
);
