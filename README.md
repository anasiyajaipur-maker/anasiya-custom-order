# Anasiya Custom Order

Production-oriented custom ordering flow for the Anasiya Shopify store.

## Architecture

- Shopify is the source of truth for prices, checkout, payment, tax, customer notifications, and paid orders.
- Appwrite stores the visual style and print catalog plus checkout intents.
- Every custom style maps to a Shopify variant. The selected print is attached as a Shopify line-item property.
- The public browser sends only product and fabric IDs. The Appwrite Function reloads the canonical product, price, fabric, and Shopify variant before checkout.
- A signed Shopify `ORDERS_PAID` webhook marks the matching Appwrite checkout intent as paid.

## Recommended Shopify product structure

Create one active Shopify product named `Custom Order`. Add an option named `Style`, then create one variant per style with the correct price. Keep the product available to the Online Store sales channel. Each tool product is connected to its matching variant from the Anasiya admin Products page.

This is preferred over custom-price draft orders because customers get the normal Shopify cart and checkout, orders appear natively in Shopify, notifications work normally, and refunds and fulfillment stay in Shopify.

## Appwrite deployment

Site: `https://anasiya-custom-order.appwrite.network`

Function variables:

```text
APPWRITE_DATABASE_ID=anasiya_custom_order
APPWRITE_BUCKET_ID=catalog-images
ADMIN_EMAIL=anasiyajaipur@gmail.com
SHOPIFY_WEBHOOK_SECRET=your_shopify_app_client_secret
```

The Function requires Appwrite scopes for document read/write and file write. Run `npm run setup:appwrite` with a temporary setup key to apply the private collection and storage permissions in `scripts/setup-appwrite.mjs`.

## Shopify theme install

The ready-made theme section is in `shopify/anasiya-custom-order-section.liquid`.

1. In Shopify Admin, open Online Store > Themes.
2. On the live theme, open Edit code.
3. Under Sections, add `anasiya-custom-order.liquid`.
4. Paste the contents of the provided section file and save.
5. Open Customize, add the `Custom order button` section where needed, and save.

For an existing theme button, add `data-anasiya-custom-order` to the button and load:

```html
<script src="https://anasiya-custom-order.appwrite.network/embed.js" defer data-anasiya-proxy="/apps/anasiya-custom-order"></script>
```

## Shopify app proxy (required for storefront API calls)

Shopify blocks direct browser requests from your store to Appwrite. Configure an app proxy so catalog and checkout calls go through your own domain.

1. In the Shopify Dev Dashboard, open your custom app for the store.
2. Go to **Configuration** > **App proxy**.
3. Set:
   - **Subpath prefix:** `apps`
   - **Subpath:** `anasiya-custom-order`
   - **Proxy URL:** your Appwrite Function domain from Appwrite Console > Functions > `anasiya-api` > Settings > Domains (for example `https://YOUR-ID.sgp.appwrite.run`)
4. Save and install or update the app on the store.

The storefront will call same-origin URLs like `/apps/anasiya-custom-order/catalog`. Shopify forwards those to your Appwrite Function.

Quick test in the browser on your store:

```text
https://anasiya.com/apps/anasiya-custom-order/catalog
```

You should see JSON with products and fabrics. If that works, the custom order tool can load styles on the storefront.

## Shopify paid-order sync

Create a merchant custom app in the Shopify Dev Dashboard with `read_orders` access and install it on the store. Put its Client ID, Client Secret, permanent `.myshopify.com` domain, and the Appwrite Function webhook URL into a local `.env.shopify` copied from `.env.shopify.example`, then run:

```text
npm run shopify:webhook
```

Set the custom app client secret as the Appwrite Function variable `SHOPIFY_WEBHOOK_SECRET`. Never commit the Client Secret, generated token, `.env.shopify`, or `.env.setup`.

## Customer flow

1. Customer selects a style and print.
2. Appwrite validates both selections and the Shopify variant.
3. The item is added through Shopify's same-origin Cart API with `Style`, `Print`, and a private matching ID.
4. Customer continues through normal Shopify checkout.
5. Shopify creates the regular order and sends its regular notifications.
6. The signed paid-order webhook updates the matching order in the Anasiya admin.

## Custom order checkout (prepaid only)

Regular store orders can keep Shiprocket Checkout. Custom orders from this tool use Shopify native checkout with prepaid only. See `shopify/PREPAID-CHECKOUT.md` for Shiprocket exclusion, payment customization, and testing.