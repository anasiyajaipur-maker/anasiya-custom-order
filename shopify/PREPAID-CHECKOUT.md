# Custom order checkout: Shopify prepaid only

Regular Anasiya orders can keep using **Shiprocket Checkout (Fastrr)** with COD and prepaid.

Custom orders from the Anasiya tool should use **Shopify native checkout** and allow **prepaid only**.

## How the tool routes checkout

When a customer clicks **Confirm and pay**:

1. The cart is cleared so the custom order is isolated from regular products.
2. The custom style variant is added with line properties:
   - `Style`, `Print`, `Size`
   - `_AnasiyaOrderId` (internal matching ID)
   - `_AnasiyaCustomOrder: true`
3. Cart attributes are set:
   - `_anasiya_checkout: shopify_prepaid`
   - `_AnasiyaCustomOrder: true`
4. The customer is sent to Shopify `/checkout`.

These markers let Shopify payment rules detect a custom order and hide COD.

## Step 1 — Exclude custom orders from Shiprocket Checkout

In **Shiprocket Checkout** dashboard:

1. Open **Settings** or **Platform / Store** rules.
2. Find product or collection inclusion/exclusion rules for Fastrr.
3. Create a Shopify collection named **Custom Order** and add your `Custom Order` product to it.
4. Exclude that collection from Shiprocket Checkout so those carts stay on Shopify checkout.

If Shiprocket does not offer a clean exclusion rule, contact Shiprocket support and ask:

> "How do I send carts containing our Custom Order product to native Shopify checkout instead of Fastrr?"

Give them the product name **Custom Order** or the collection name.

## Step 2 — Hide COD on Shopify checkout for custom orders

Deploy the payment customization extension in `shopify/payment-customization/` to your **Anasiya Custom Ordering** Shopify app.

From a folder linked to that app:

```bash
shopify app config link
shopify app deploy
```

Then in **Shopify Admin** → **Settings** → **Payments** → **Payment customizations**, activate **Anasiya custom order prepaid only**.

The function hides payment methods whose names match COD / manual patterns when the cart has `_AnasiyaOrderId`, `_AnasiyaCustomOrder`, or `_anasiya_checkout=shopify_prepaid`.

### If you cannot deploy a function yet

Use a payment-customization app from the Shopify App Store that can hide COD when a cart attribute or line property is present. Use:

- Cart attribute: `_anasiya_checkout` = `shopify_prepaid`
- Or line property: `_AnasiyaCustomOrder` = `true`

## Step 3 — Deploy updated tool code

Redeploy:

- Appwrite function (`functions/api/src/main.js`)
- `embed.js` on `anasiya-custom-order.appwrite.network`

## Test plan

1. Add a regular product and go to checkout → should still use **Shiprocket**.
2. Open the custom order tool, complete all steps, click **Confirm and pay**.
3. Confirm you land on **Shopify checkout**, not Fastrr.
4. Confirm only prepaid options appear (UPI, cards, wallets). COD should be hidden.
5. Complete a test prepaid order and confirm it appears in Shopify Admin and the Anasiya admin Orders tab.

## Troubleshooting

| Problem | Likely cause |
|---------|----------------|
| Lands on Shiprocket checkout | Custom Order product not excluded from Fastrr rules |
| COD still visible | Payment customization not deployed or not active |
| Mixed cart with regular items | Old embed version; redeploy `embed.js` (new version clears cart first) |
| Checkout empty | Variant not linked in Anasiya admin Products page |
