import { config } from './config.js';
const sdk = await import(`appwrite`);
const { Account, Client, Functions } = sdk;
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
const account = new Account(client);
const functions = new Functions(client);
const state = { catalog: { products: [], fabrics: [], settings: {} }, orders: [], shopify: {} };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (v) => String(v || ``).replace(/[&<>"']/g, (c) => ({ [`&`]: `&amp;`, [`<`]: `&lt;`, [`>`]: `&gt;`, [`"`]: `&quot;`, [`'`]: `&#39;` }[c]));
const img = (id) => id ? `${config.endpoint}/storage/buckets/${config.bucketId}/files/${id}/view?project=${config.projectId}` : ``;
async function api(path, method = `GET`, payload = {}) {
  const run = await functions.createExecution({
    functionId: config.functionId,
    body: method === `GET` ? `` : JSON.stringify(payload),
    async: false,
    xpath: path,
    method,
    headers: { [`content-type`]: `application/json` }
  });
  const data = JSON.parse(run.responseBody || run.response || `{}`);
  if (run.status !== `completed` || data.error) throw new Error(data.error || `The Appwrite function did not complete.`);
  return data;
}
async function upload(file) {
  if (!file || !file.name) return ``;
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement(`canvas`);
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext(`2d`).drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, `image/jpeg`, 0.86));
  if (!blob) throw new Error(`The selected image could not be prepared.`);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(`,`)[1]);
    reader.onerror = () => reject(new Error(`The selected image could not be read.`));
    reader.readAsDataURL(blob);
  });
  const result = await api(`/admin/upload`, `POST`, { name: `${file.name.replace(/\.[^.]+$/, ``)}.jpg`, data });
  return result.fileId;
}
async function submit(form, message, action) {
  const button = form.querySelector(`[type=submit]`);
  message.textContent = `Saving...`;
  button.disabled = true;
  try {
    await action();
    message.textContent = `Saved successfully.`;
  } catch (error) {
    message.textContent = error.message || `Could not save. Please try again.`;
  } finally {
    button.disabled = false;
  }
}
function view(name) { $$(`[data-view]`).forEach((el) => el.classList.toggle(`is-hidden`, el.dataset.view !== name)); }
function tab(name) { $$(`.tab`).forEach((el) => el.classList.toggle(`is-active`, el.dataset.tab === name)); $$(`[data-panel]`).forEach((el) => el.classList.toggle(`is-hidden`, el.dataset.panel !== name)); }
function detail(value = ``) { const row = document.createElement(`div`); row.className = `detail-row`; row.innerHTML = `<input name=details[] placeholder=Product-detail value=${esc(value)}><button class=icon-action type=button aria-label=Remove>x</button>`; row.querySelector(`button`).onclick = () => row.remove(); return row; }
function ensureDetail() { if (!$(`#detail-fields`).children.length) $(`#detail-fields`).appendChild(detail()); }
function renderProducts() {
  $(`#products-list`).innerHTML = state.catalog.products.length ? state.catalog.products.map((p) => `<article class="admin-item"><div class="admin-thumb duo-thumb">${[p.image1Id,p.image2Id].filter(Boolean).map((id)=>`<img src="${img(id)}" alt="">`).join(``) || esc((p.name || `A`).slice(0,1))}</div><div class="admin-item-copy"><h3>${esc(p.name)}</h3><p class="admin-meta">${esc(state.catalog.settings.currency || `INR`)} ${Number(p.price || 0).toLocaleString(`en-IN`)}</p><div class="detail-pills">${(p.details || []).slice(0,3).map((d)=>`<span class="detail-pill">${esc(d)}</span>`).join(``)}</div><form class="shopify-link-form" data-shopify-product="${p.$id}"><label><span>Shopify variant</span><input name="shopifyVariantId" value="${esc(p.shopifyVariantId || ``)}" placeholder="ID or Shopify variant URL"></label><button class="ghost-action" type="submit">${p.shopifyVariantId ? `Update` : `Connect`}</button><small aria-live="polite"></small></form></div><button class="ghost-action remove-action" data-delete-product="${p.$id}" type="button">Remove</button></article>`).join(``) : `<div class="empty-card"><p>No products yet. Add your first style using the form.</p></div>`;
  $$(`[data-delete-product]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/products/${b.dataset.deleteProduct}`,`DELETE`); await loadCatalog(); });
  $$(`[data-shopify-product]`).forEach((form) => form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector(`button`);
    const message = form.querySelector(`small`);
    button.disabled = true; message.textContent = `Saving...`;
    try {
      await api(`/admin/products/${form.dataset.shopifyProduct}/shopify`, `PUT`, { shopifyVariantId: new FormData(form).get(`shopifyVariantId`) });
      message.textContent = `Connected`;
      await loadCatalog();
    } catch (error) { message.textContent = error.message || `Could not connect`; button.disabled = false; }
  });
}
function renderFabrics() {
  $(`#fabrics-list`).innerHTML = state.catalog.fabrics.length ? state.catalog.fabrics.map((f) => `<article class="admin-item"><div class="admin-thumb">${f.imageId ? `<img src="${img(f.imageId)}" alt="">` : esc((f.name || `A`).slice(0,1))}</div><div class="admin-item-copy"><h3>${esc(f.name)}</h3><p class="admin-meta">Visible in the customer print library</p></div><button class="ghost-action" data-delete-fabric="${f.$id}" type="button">Remove</button></article>`).join(``) : `<div class="empty-card"><p>No fabrics yet. Add your first print using the form.</p></div>`;
  $$(`[data-delete-fabric]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/fabrics/${b.dataset.deleteFabric}`,`DELETE`); await loadCatalog(); });
}
function renderOrders() {
  const sync = `<div class="sync-status ${state.shopify.webhookConfigured ? `is-ready` : `is-pending`}"><strong>${state.shopify.webhookConfigured ? `Shopify sync ready` : `Shopify sync needs setup`}</strong><span>${state.shopify.webhookConfigured ? `Paid Shopify orders update here automatically.` : `Add the webhook secret and register the paid-order webhook.`}</span></div>`;
  const rows = state.orders.length ? state.orders.map((o) => {
    const label = o.status === `paid` ? `Paid in Shopify` : o.status === `checkout_pending` ? `Checkout started` : `New`;
    const date = o.createdAt ? new Date(o.createdAt).toLocaleString(`en-IN`, { dateStyle: `medium`, timeStyle: `short` }) : ``;
    return `<article class="order-item"><div class="order-top"><strong>${esc(o.productName || `Custom order`)}</strong><span class="status-pill status-${esc(o.status || `new`)}">${label}</span></div><div class="order-row"><span>Print</span><strong>${esc(o.fabricName)}</strong><span>Amount</span><strong>${esc(state.catalog.settings.currency || `INR`)} ${Number(o.price || 0).toLocaleString(`en-IN`)}</strong>${date ? `<span>${esc(date)}</span>` : ``}</div></article>`;
  }).join(``) : `<div class="empty-card"><p>No custom order checkouts yet.</p></div>`;
  $(`#orders-list`).innerHTML = sync + rows;
}
function fillSettings() { const f = $(`#settings-form`); f.currency.value = state.catalog.settings.currency || `INR`; f.shopDomain.value = state.catalog.settings.shopDomain || `anasiya.com`; f.customVariantId.value = state.catalog.settings.customVariantId || ``; f.policyText.value = state.catalog.settings.policyText || ``; }
async function loadCatalog() { state.catalog = await api(`/catalog`); renderProducts(); renderFabrics(); fillSettings(); }
async function loadOrders() { const result = await api(`/admin/orders`); state.orders = result.orders || []; state.shopify = result.shopify || {}; renderOrders(); }
$(`#login-form`).onsubmit = async (e) => {
  e.preventDefault();
  $(`#login-message`).textContent = ``;
  const credentials = { email: $(`#login-email`).value, password: $(`#login-password`).value };
  try {
    await account.createEmailPasswordSession(credentials);
  } catch (err) {
    if (String(err.message || ``).includes(`session is active`)) {
      await account.deleteSession(`current`).catch(() => {});
      await account.createEmailPasswordSession(credentials);
    } else {
      $(`#login-message`).textContent = err.message;
      return;
    }
  }
  view(`dashboard`);
  await loadCatalog();
  await loadOrders();
};
$(`#logout-button`).onclick = async () => { await account.deleteSession(`current`); view(`login`); };
$$(`.tab`).forEach((b) => b.onclick = () => tab(b.dataset.tab));
$(`#refresh-orders`).onclick = loadOrders;
$(`#add-detail`).onclick = () => $(`#detail-fields`).appendChild(detail());
ensureDetail();
$(`#product-form`).onsubmit = async (e) => { e.preventDefault(); const form = e.currentTarget; await submit(form, $(`#product-message`), async () => { const f = new FormData(form); await api(`/admin/products`, `POST`, { name: f.get(`name`), price: Number(f.get(`price`) || 0), image1Id: await upload(f.get(`image1`)), image2Id: await upload(f.get(`image2`)), details: f.getAll(`details[]`).map((x)=>String(x).trim()).filter(Boolean), shopifyVariantId: f.get(`shopifyVariantId`) }); form.reset(); $(`#detail-fields`).innerHTML = ``; ensureDetail(); await loadCatalog(); }); };
$(`#fabric-form`).onsubmit = async (e) => { e.preventDefault(); const form = e.currentTarget; await submit(form, $(`#fabric-message`), async () => { const f = new FormData(form); await api(`/admin/fabrics`, `POST`, { name: f.get(`name`), imageId: await upload(f.get(`image`)) }); form.reset(); await loadCatalog(); }); };
$(`#settings-form`).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await api(`/admin/settings`, `PUT`, { currency: f.get(`currency`), shopDomain: f.get(`shopDomain`), customVariantId: f.get(`customVariantId`), policyText: f.get(`policyText`) }); $(`#settings-message`).textContent = `Settings saved.`; await loadCatalog(); };
account.get().then(async()=>{ view(`dashboard`); await loadCatalog(); await loadOrders(); }).catch(()=>view(`login`));
