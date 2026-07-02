import { Account, Client, Databases, ID, Query, Storage } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const databaseId = process.env.APPWRITE_DATABASE_ID || `anasiya_custom_order`;
const bucketId = process.env.APPWRITE_BUCKET_ID || `catalog-images`;
const collection = { products: `products`, fabrics: `fabrics`, orders: `orders`, settings: `settings` };
const adminEmail = process.env.ADMIN_EMAIL || ``;

function makeClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || `https://sgp.cloud.appwrite.io/v1`)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || `6a454ec900060f12e3ec`)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY || ``);
}

function ok(res, data, status = 200) { return res.json(data, status); }
function body(req) { try { return req.bodyJson || JSON.parse(req.bodyText || `{}`); } catch { return {}; } }
function pack(doc) { return { ...doc, details: doc.detailsJson ? JSON.parse(doc.detailsJson) : [] }; }
async function getSettings(db) { const rows = await db.listDocuments(databaseId, collection.settings); return Object.fromEntries(rows.documents.map((row) => [row.key, row.value])); }

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

export default async ({ req, res }) => {
  if (req.method === `OPTIONS`) return ok(res, {});
  const db = new Databases(makeClient());
  const requestPath = req.path || `/`;
  try {
    if (requestPath === `/catalog` && req.method === `GET`) {
      const [products, fabrics, settings] = await Promise.all([
        db.listDocuments(databaseId, collection.products, [Query.equal(`active`, true), Query.orderAsc(`sortOrder`)]),
        db.listDocuments(databaseId, collection.fabrics, [Query.equal(`active`, true), Query.orderAsc(`sortOrder`)]),
        getSettings(db)
      ]);
      return ok(res, { products: products.documents.map(pack), fabrics: fabrics.documents, settings });
    }
    if (requestPath === `/orders` && req.method === `POST`) {
      const data = body(req);
      const settings = await getSettings(db);
      if (!settings.customVariantId) throw new Error(`Shopify custom product variant ID is not set yet.`);
      await db.createDocument(databaseId, collection.orders, ID.unique(), { ...data, status: `new`, createdAt: new Date().toISOString() });
      const checkoutUrl = `https://${settings.shopDomain || `anasiya.com`}/cart/${settings.customVariantId}:1?properties[Style]=${encodeURIComponent(data.productName)}&properties[Fabric]=${encodeURIComponent(data.fabricName)}`;
      return ok(res, { checkoutUrl });
    }
    await requireAdmin(req);
    if (requestPath === `/admin/upload` && req.method === `POST`) {
      const data = body(req);
      const encoded = String(data.data || ``);
      if (!encoded) throw new Error(`No image was received.`);
      const buffer = Buffer.from(encoded, `base64`);
      if (!buffer.length || buffer.length > 8000000) throw new Error(`Image must be smaller than 8 MB after optimization.`);
      const safeName = String(data.name || `catalog-image.jpg`).replace(/[^a-zA-Z0-9._-]/g, `-`).slice(-120);
      const file = await new Storage(makeClient()).createFile({ bucketId, fileId: ID.unique(), file: InputFile.fromBuffer(buffer, safeName) });
      return ok(res, { fileId: file.$id });
    }
    if (requestPath === `/admin/orders`) { const orders = await db.listDocuments(databaseId, collection.orders, [Query.orderDesc(`createdAt`)]); return ok(res, { orders: orders.documents }); }
    if (requestPath === `/admin/products` && req.method === `POST`) { const data = body(req); const row = await db.createDocument(databaseId, collection.products, ID.unique(), { name: data.name, price: Number(data.price || 0), image1Id: data.image1Id || ``, image2Id: data.image2Id || ``, detailsJson: JSON.stringify(data.details || []), active: true, sortOrder: Date.now() }); return ok(res, pack(row)); }
    if (requestPath.startsWith(`/admin/products/`) && req.method === `DELETE`) { await db.updateDocument(databaseId, collection.products, requestPath.split(`/`).pop(), { active: false }); return ok(res, { ok: true }); }
    if (requestPath === `/admin/fabrics` && req.method === `POST`) { const data = body(req); const row = await db.createDocument(databaseId, collection.fabrics, ID.unique(), { name: data.name, imageId: data.imageId || ``, active: true, sortOrder: Date.now() }); return ok(res, row); }
    if (requestPath.startsWith(`/admin/fabrics/`) && req.method === `DELETE`) { await db.updateDocument(databaseId, collection.fabrics, requestPath.split(`/`).pop(), { active: false }); return ok(res, { ok: true }); }
    if (requestPath === `/admin/settings` && req.method === `PUT`) { const data = body(req); delete data.__adminJwt; for (const [key, value] of Object.entries(data)) await db.updateDocument(databaseId, collection.settings, key, { key, value: String(value || ``) }); return ok(res, { ok: true }); }
    return ok(res, { error: `Not found` }, 404);
  } catch (error) {
    return ok(res, { error: error.message }, 400);
  }
};