import { createHmac, timingSafeEqual } from 'node:crypto';
import { Account, Client, Databases, ID, Query, Storage } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const databaseId = process.env.APPWRITE_DATABASE_ID || `anasiya_custom_order`;
const bucketId = process.env.APPWRITE_BUCKET_ID || `catalog-images`;
const collection = { products: `products`, fabrics: `fabrics`, orders: `orders`, settings: `settings` };
const adminEmail = process.env.ADMIN_EMAIL || ``;

function makeClient(req) {
  return new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || `https://sgp.cloud.appwrite.io/v1`)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || `6a454ec900060f12e3ec`)
    .setKey(req?.headers?.[`x-appwrite-key`] || req?.headers?.[`X-Appwrite-Key`] || process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY || ``);
}

function ok(res, data, status = 200) { return res.json(data, status); }
function body(req) { try { return req.bodyJson || JSON.parse(req.bodyText || `{}`); } catch { return {}; } }
function parseDetails(value) { try { const details = JSON.parse(value || `[]`); return Array.isArray(details) ? details : []; } catch { return []; } }
function pack(doc, settings = {}) { return { ...doc, details: parseDetails(doc.detailsJson), shopifyVariantId: settings[variantSettingId(doc.$id)] || settings.customVariantId || `` }; }
function variantSettingId(productId) { return `variant_${productId}`.slice(0, 36); }
function validDocumentId(value) { return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(String(value || ``)); }
function cleanDomain(value) { return String(value || `anasiya.com`).trim().replace(/^https?:\/\//i, ``).replace(/\/.*$/, ``).toLowerCase(); }
function normalizeVariantId(value) { const text = String(value || ``).trim(); if (/^\d+$/.test(text)) return text; return text.match(/\/variants\/(\d+)/)?.[1] || text.match(/[?&]variant=(\d+)/)?.[1] || ``; }
async function getSettings(db) { const rows = await db.listDocuments(databaseId, collection.settings); return Object.fromEntries(rows.documents.map((row) => [row.key, row.value])); }

async function upsertSetting(db, key, value) {
  const data = { key, value: String(value || ``) };
  try { return await db.updateDocument(databaseId, collection.settings, key, data); }
  catch (error) {
    if (error.code !== 404) throw error;
    return db.createDocument(databaseId, collection.settings, key, data);
  }
}

async function requireAdmin(req) {
  if (!adminEmail) throw new Error(`ADMIN_EMAIL is not set in Appwrite function variables.`);
  const requestBody = body(req);
  const jwt = req.headers[`x-appwrite-user-jwt`] || req.headers[`X-Appwrite-User-Jwt`] || req.headers[`x-admin-jwt`] || req.headers[`X-Admin-Jwt`] || requestBody.__adminJwt;
  if (!jwt) throw new Error(`Please sign in as admin.`);
  const userClient = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || `https://sgp.cloud.appwrite.io/v1`)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || `6a454ec900060f12e3ec`)
    .setJWT(jwt);
  const user = await new Account(userClient).get();
  if ((user.email || ``).toLowerCase() !== adminEmail.toLowerCase()) throw new Error(`This account is not allowed to manage the admin panel.`);
}

function webhookIsValid(req) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ``;
  const supplied = req.headers[`x-shopify-hmac-sha256`] || req.headers[`X-Shopify-Hmac-Sha256`] || ``;
  if (!secret || !supplied || !req.bodyText) return false;
  const expected = createHmac(`sha256`, secret).update(req.bodyText, `utf8`).digest(`base64`);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(String(supplied));
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function orderIntentId(payload) {
  for (const line of payload.line_items || []) {
    for (const property of line.properties || []) {
      const key = property.name || property.key;
      if (key === `_AnasiyaOrderId` && validDocumentId(property.value)) return property.value;
    }
  }
  return ``;
}

async function createCheckoutIntent(db, data) {
  if (!validDocumentId(data.productId) || !validDocumentId(data.fabricId)) throw new Error(`Please select a valid product and print.`);
  const [product, fabric, settings] = await Promise.all([
    db.getDocument(databaseId, collection.products, data.productId),
    db.getDocument(databaseId, collection.fabrics, data.fabricId),
    getSettings(db)
  ]);
  if (!product.active || !fabric.active) throw new Error(`That selection is no longer available. Please choose again.`);
  const variantId = String(settings[variantSettingId(product.$id)] || settings.customVariantId || ``).trim();
  if (!/^\d+$/.test(variantId)) throw new Error(`This style is not connected to a Shopify variant yet.`);

  const intentId = validDocumentId(data.requestId) ? data.requestId : ID.unique();
  const intent = {
    productId: product.$id,
    fabricId: fabric.$id,
    productName: product.name,
    fabricName: fabric.name,
    price: Number(product.price || 0),
    status: `checkout_pending`,
    createdAt: new Date().toISOString()
  };
  try { await db.createDocument(databaseId, collection.orders, intentId, intent); }
  catch (error) { if (error.code !== 409) throw error; }

  const properties = { Style: product.name, Print: fabric.name, _AnasiyaOrderId: intentId };
  const encodedProperties = Buffer.from(JSON.stringify(properties), `utf8`).toString(`base64url`);
  const shopDomain = cleanDomain(settings.shopDomain);
  return {
    orderId: intentId,
    variantId,
    properties,
    shopDomain,
    checkoutUrl: `https://${shopDomain}/cart/${variantId}:1?properties=${encodedProperties}`
  };
}

export default async ({ req, res }) => {
  if (req.method === `OPTIONS`) return ok(res, {});
  const db = new Databases(makeClient(req));
  const requestPath = req.path || `/`;
  try {
    if (requestPath === `/webhooks/shopify/orders-paid` && req.method === `POST`) {
      if (!webhookIsValid(req)) return ok(res, { error: `Invalid Shopify webhook signature.` }, 401);
      const intentId = orderIntentId(body(req));
      if (intentId) {
        try { await db.updateDocument(databaseId, collection.orders, intentId, { status: `paid` }); }
        catch (error) { if (error.code !== 404) throw error; }
      }
      return ok(res, { ok: true });
    }

    if (requestPath === `/catalog` && req.method === `GET`) {
      const [products, fabrics, settings] = await Promise.all([
        db.listDocuments(databaseId, collection.products, [Query.equal(`active`, true), Query.orderAsc(`sortOrder`)]),
        db.listDocuments(databaseId, collection.fabrics, [Query.equal(`active`, true), Query.orderAsc(`sortOrder`)]),
        getSettings(db)
      ]);
      return ok(res, {
        products: products.documents.map((doc) => pack(doc, settings)),
        fabrics: fabrics.documents,
        settings: { currency: settings.currency || `INR`, shopDomain: cleanDomain(settings.shopDomain), customVariantId: settings.customVariantId || ``, policyText: settings.policyText || `` }
      });
    }

    if (requestPath === `/orders` && req.method === `POST`) return ok(res, await createCheckoutIntent(db, body(req)));

    await requireAdmin(req);

    if (requestPath === `/admin/upload` && req.method === `POST`) {
      const data = body(req);
      const encoded = String(data.data || ``);
      if (!encoded) throw new Error(`No image was received.`);
      const buffer = Buffer.from(encoded, `base64`);
      if (!buffer.length || buffer.length > 8000000) throw new Error(`Image must be smaller than 8 MB after optimization.`);
      const safeName = String(data.name || `catalog-image.jpg`).replace(/[^a-zA-Z0-9._-]/g, `-`).slice(-120);
      const file = await new Storage(makeClient(req)).createFile({ bucketId, fileId: ID.unique(), file: InputFile.fromBuffer(buffer, safeName) });
      return ok(res, { fileId: file.$id });
    }

    if (requestPath === `/admin/orders`) {
      const orders = await db.listDocuments(databaseId, collection.orders, [Query.orderDesc(`createdAt`)]);
      return ok(res, { orders: orders.documents, shopify: { webhookConfigured: Boolean(process.env.SHOPIFY_WEBHOOK_SECRET) } });
    }

    if (requestPath === `/admin/products` && req.method === `POST`) {
      const data = body(req);
      if (!String(data.name || ``).trim() || Number(data.price) <= 0) throw new Error(`Product name and a valid price are required.`);
      const suppliedVariant = String(data.shopifyVariantId || ``).trim();
      const variantId = normalizeVariantId(suppliedVariant);
      if (suppliedVariant && !variantId) throw new Error(`Enter a Shopify variant ID or variant admin URL.`);
      const row = await db.createDocument(databaseId, collection.products, ID.unique(), {
        name: String(data.name).trim(),
        price: Number(data.price),
        image1Id: data.image1Id || ``,
        image2Id: data.image2Id || ``,
        detailsJson: JSON.stringify(data.details || []),
        active: true,
        sortOrder: Date.now()
      });
      if (variantId) await upsertSetting(db, variantSettingId(row.$id), variantId);
      return ok(res, pack(row, await getSettings(db)));
    }

    const shopifyProductMatch = requestPath.match(/^\/admin\/products\/([^/]+)\/shopify$/);
    if (shopifyProductMatch && req.method === `PUT`) {
      const suppliedVariant = String(body(req).shopifyVariantId || ``).trim();
      const variantId = normalizeVariantId(suppliedVariant);
      if (suppliedVariant && !variantId) throw new Error(`Enter a Shopify variant ID or variant admin URL.`);
      await db.getDocument(databaseId, collection.products, shopifyProductMatch[1]);
      await upsertSetting(db, variantSettingId(shopifyProductMatch[1]), variantId);
      return ok(res, { ok: true });
    }

    if (requestPath.startsWith(`/admin/products/`) && req.method === `DELETE`) {
      await db.updateDocument(databaseId, collection.products, requestPath.split(`/`).pop(), { active: false });
      return ok(res, { ok: true });
    }

    if (requestPath === `/admin/fabrics` && req.method === `POST`) {
      const data = body(req);
      const row = await db.createDocument(databaseId, collection.fabrics, ID.unique(), { name: data.name, imageId: data.imageId || ``, active: true, sortOrder: Date.now() });
      return ok(res, row);
    }

    if (requestPath.startsWith(`/admin/fabrics/`) && req.method === `DELETE`) {
      await db.updateDocument(databaseId, collection.fabrics, requestPath.split(`/`).pop(), { active: false });
      return ok(res, { ok: true });
    }

    if (requestPath === `/admin/settings` && req.method === `PUT`) {
      const data = body(req);
      for (const key of [`currency`, `shopDomain`, `customVariantId`, `policyText`]) {
        if (Object.hasOwn(data, key)) await upsertSetting(db, key, key === `shopDomain` ? cleanDomain(data[key]) : data[key]);
      }
      return ok(res, { ok: true });
    }

    return ok(res, { error: `Not found` }, 404);
  } catch (error) {
    return ok(res, { error: error.message }, 400);
  }
};