Feature: Checkout
  The OmniPizza user submits an order by providing delivery details, contact info, and a payment method.

    As an OmniPizza user,
    I want to complete my checkout by entering my delivery address, contact details, and selecting a payment method (credit card or cash),
    So that I can successfully place my order and receive confirmation with the correct total amount including tax.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  Scenario Outline: Place a delivery order in <market> with <payment>
    Given they are ordering in market "<market>"
    And they have an order with "<item>" size "<size>" quantity <qty>
    When they provide delivery details "<street>" "<zip>" for "<name>" "<phone>"
    And they choose payment method "<payment>" with card "<card>" expiration "<exp>" cvv "<cvv>"
    Then the order is accepted with subtotal "<subtotal>" tax "<tax>" and total "<total>"

    Examples: Credit Card
      | market | item      | size  | qty | street            | zip      | name               | phone            | payment     | card                | exp   | cvv | subtotal | tax   | total  |
      | US     | Pepperoni | Large |   1 | 123 Luxury Avenue |    90210 | Julian Casablancas |  +1 415 555 0101 | Credit Card | 4242 4242 4242 4242 | 12/28 | 123 |    18.99 |  1.52 |  20.51 |
      | MX     | Pepperoni | Large |   1 | Av. Carranza 123  |    78230 | Julian Casablancas | +52 55 1234 5678 | Credit Card | 4242 4242 4242 4242 | 12/28 | 123 |   329.00 | 52.64 | 381.64 |
      | CH     | Pepperoni | Large |   1 | Bahnhofstrasse 12 |     8001 | Julian Casablancas | +41 44 668 18 00 | Credit Card | 4242 4242 4242 4242 | 12/28 | 123 |    21.50 |  1.66 |  23.16 |
      | JP     | Pepperoni | Large |   1 |     1-2-3 Shibuya | 150-0002 | Julian Casablancas |  +81 3 1234 5678 | Credit Card | 4242 4242 4242 4242 | 12/28 | 123 |     2400 |   240 |   2640 |

    Examples: Cash
      | market | item      | size  | qty | street            | zip      | name               | phone            | payment | card | exp | cvv | subtotal | tax   | total  |
      | US     | Pepperoni | Large |   1 | 123 Luxury Avenue |    90210 | Julian Casablancas |  +1 415 555 0101 | Cash    |      |     |     |    18.99 |  1.52 |  20.51 |
      | MX     | Pepperoni | Large |   1 | Av. Carranza 123  |    78230 | Julian Casablancas | +52 55 1234 5678 | Cash    |      |     |     |   329.00 | 52.64 | 381.64 |
      | CH     | Pepperoni | Large |   1 | Bahnhofstrasse 12 |     8001 | Julian Casablancas | +41 44 668 18 00 | Cash    |      |     |     |    21.50 |  1.66 |  23.16 |
      | JP     | Pepperoni | Large |   1 |     1-2-3 Shibuya | 150-0002 | Julian Casablancas |  +81 3 1234 5678 | Cash    |      |     |     |     2400 |   240 |   2640 |
