const fs = await import(`node:fs`);
const path = await import(`node:path`);

const envPath = path.resolve(process.cwd(), `.env.shopify`);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, `utf8`).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const store = String(process.env.SHOPIFY_STORE_DOMAIN || ``).replace(/^https?:\/\//i, ``).replace(/\/.*$/, ``);
let token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ``;
const clientId = process.env.SHOPIFY_CLIENT_ID || ``;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || ``;
const webhookUrl = process.env.SHOPIFY_WEBHOOK_URL || ``;
const apiVersion = process.env.SHOPIFY_API_VERSION || `2026-07`;

if (!store.endsWith(`.myshopify.com`)) throw new Error(`SHOPIFY_STORE_DOMAIN must be the permanent .myshopify.com domain.`);
if (!token && (!clientId || !clientSecret)) throw new Error(`SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required.`);
if (!/^https:\/\//.test(webhookUrl)) throw new Error(`SHOPIFY_WEBHOOK_URL must be a public HTTPS URL.`);

if (!token) {
  const tokenResponse = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: `POST`,
    headers: { [`Content-Type`]: `application/x-www-form-urlencoded` },
    body: new URLSearchParams({ grant_type: `client_credentials`, client_id: clientId, client_secret: clientSecret })
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error_description || tokenPayload.error || `Could not obtain a Shopify access token.`);
  token = tokenPayload.access_token;
}

async function graphql(query, variables = {}) {
  const response = await fetch(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
    method: `POST`,
    headers: { [`Content-Type`]: `application/json`, [`X-Shopify-Access-Token`]: token },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.map((error) => error.message).join(`; `) || `Shopify request failed.`);
  return payload.data;
}

const existing = await graphql(`query ExistingWebhooks { webhookSubscriptions(first: 100) { nodes { id topic uri } } }`);
const match = existing.webhookSubscriptions.nodes.find((item) => item.topic === `ORDERS_PAID` && item.uri === webhookUrl);
if (match) {
  console.log(`Shopify paid-order webhook is already registered: ${match.id}`);
  process.exit(0);
}

const mutation = `
  mutation CreatePaidOrderWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`;
const result = await graphql(mutation, { topic: `ORDERS_PAID`, webhookSubscription: { uri: webhookUrl } });
const errors = result.webhookSubscriptionCreate.userErrors || [];
if (errors.length) throw new Error(errors.map((error) => error.message).join(`; `));
console.log(`Shopify paid-order webhook registered: ${result.webhookSubscriptionCreate.webhookSubscription.id}`);
