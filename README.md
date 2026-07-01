# Anasiya Custom Order

Free-stack version of the Anasiya custom order tool for Shopify.

## What this contains

- Customer full-screen Shopify lightbox in `public/embed.js`
- Admin panel at `/admin/`
- Appwrite Function backend in `functions/api/`
- One-time Appwrite setup helper in `scripts/setup-appwrite.mjs`

## Appwrite project

Endpoint: `https://sgp.cloud.appwrite.io/v1`
Project ID: `6a454ec900060f12e3ec`

Copy `.env.example` to `.env` for local preview. Copy `.env.setup.example` to `.env.setup` only on your computer when running setup. Do not commit `.env.setup`.

## Shopify install

After the site is deployed, add this button or link on Shopify:

```html
<button data-anasiya-custom-order>Custom Order</button>
<script src=YOUR_APPWRITE_SITE_URL/embed.js></script>
```

Set `customVariantId` in admin before using checkout. Without it, the tool will show a helpful setup message instead of sending the customer to checkout.
