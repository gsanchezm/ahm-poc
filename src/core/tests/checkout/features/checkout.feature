Feature: Checkout
  The OmniPizza user submits an order by providing delivery details, contact info, and a payment method.

    As an OmniPizza user,
    I want to complete my checkout by entering my delivery address, contact details, and selecting a payment method (credit card or cash),
    So that I can successfully place my order and receive confirmation with the correct total amount including tax.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  Scenario Outline: Place a delivery order across markets with credit card
    Given they are ordering in market "<market>"
    And they have an order with "<item>" size "<size>" quantity <qty>
    When they provide delivery address "<street>" zip "<zip>"
    And they provide contact name "<name>" phone "<phone>"
    And they choose payment method "Credit Card"
    And provide card details with card number "<card>" expiration date "<exp>" and cvv "<cvv>"
    Then the order is accepted with subtotal "<subtotal>" tax "<tax>" and total "<total>"

    Examples:
      | market | item      | size  | qty | street            | zip      | name               | phone            | card                | exp   | cvv | subtotal | tax   | total  |
      | US     | Pepperoni | Large |   1 | 123 Luxury Avenue |    90210 | Julian Casablancas |  +1 415 555 0101 | 4242 4242 4242 4242 | 12/28 | 123 |    18.99 |  4.12 |  23.11 |
      | MX     | Pepperoni | Large |   1 | Av. Carranza 123  |    78230 | Julian Casablancas | +52 55 1234 5678 | 4242 4242 4242 4242 | 12/28 | 123 |   329.00 | 52.64 | 381.64 |
      | CH     | Pepperoni | Large |   1 | Bahnhofstrasse 12 |     8001 | Julian Casablancas | +41 44 668 18 00 | 4242 4242 4242 4242 | 12/28 | 123 |    21.50 |  1.66 |  23.16 |
      | JP     | Pepperoni | Large |   1 |     1-2-3 Shibuya | 150-0002 | Julian Casablancas |  +81 3 1234 5678 | 4242 4242 4242 4242 | 12/28 | 123 |     2400 |   240 |   2640 |

  Scenario Outline: Place a delivery order across markets with different payment methods
    Given they are ordering in market "<market>"
    And they have an order with "<item>" size "<size>" quantity <qty>
    When they provide delivery address "<street>" zip "<zip>"
    And they provide contact name "<name>" phone "<phone>"
    And they choose payment method "Cash"
    Then the order is accepted with subtotal "<subtotal>" tax "<tax>" and total "<total>"

    Examples:
      | market | item      | size  | qty | street            | zip      | name               | phone            | subtotal | tax   | total  |
      | US     | Pepperoni | Large |   1 | 123 Luxury Avenue |    90210 | Julian Casablancas |  +1 415 555 0101 |    18.99 |  4.12 |  23.11 |
      | MX     | Pepperoni | Large |   1 | Av. Carranza 123  |    78230 | Julian Casablancas | +52 55 1234 5678 |   329.00 | 52.64 | 381.64 |
      | CH     | Pepperoni | Large |   1 | Bahnhofstrasse 12 |     8001 | Julian Casablancas | +41 44 668 18 00 |    21.50 |  1.66 |  23.16 |
      | JP     | Pepperoni | Large |   1 |     1-2-3 Shibuya | 150-0002 | Julian Casablancas |  +81 3 1234 5678 |     2400 |   240 |   2640 |
