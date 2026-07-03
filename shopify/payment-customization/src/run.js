// @ts-check

const PREPAID_ONLY_PATTERNS = [
  /cash on delivery/i,
  /\bcod\b/i,
  /pay on delivery/i,
  /manual payment/i,
  /bank deposit/i,
  /money order/i
];

/**
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function run(input) {
  const cartIsCustomOrder = input.cart.attribute?.value === `shopify_prepaid`
    || input.cart.lines.some((line) => line.attribute?.value || line.attributeCustom?.value);

  if (!cartIsCustomOrder) {
    return { operations: [] };
  }

  const operations = input.paymentMethods
    .filter((method) => PREPAID_ONLY_PATTERNS.some((pattern) => pattern.test(method.name)))
    .map((method) => ({
      paymentMethodHide: {
        paymentMethodId: method.id
      }
    }));

  return { operations };
}
