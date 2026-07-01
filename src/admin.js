import { config } from './config.js';
const sdk = await import(`appwrite`);
const { Account, Client, Functions, ID, Storage } = sdk;
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
const account = new Account(client);
const functions = new Functions(client);
const storage = new Storage(client);
const state = { catalog: { products: [], fabrics: [], settings: {} }, orders: [] };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (v) => String(v || ``).replace(/[&<>]/g, (c) => ({ [`&`]: `&amp;`, [`<`]: `&lt;`, [`>`]: `&gt;` }[c]));
const img = (id) => id ? `${config.endpoint}/storage/buckets/${config.bucketId}/files/${id}/view?project=${config.projectId}` : ``;
async function api(path, method = `GET`, payload = {}) {
  const headers = { [`content-type`]: `application/json` };
  if (path.startsWith(`/admin/`)) {
    const jwt = await account.createJWT();
    headers[`x-admin-jwt`] = jwt.jwt;
  }
  const run = await functions.createExecution({ functionId: config.functionId, body: method === `GET` ? `` : JSON.stringify(payload), async: false, path, method, headers });
  const data = JSON.parse(run.responseBody || run.response || `{}`);
  if (run.status !== `completed` || data.error) throw new Error(data.error || `The Appwrite function did not complete.`);
  return data;
}
async function upload(file) { if (!file || !file.name) return ``; return (await storage.createFile({ bucketId: config.bucketId, fileId: ID.unique(), file })).$id; }
function view(name) { $$(`[data-view]`).forEach((el) => el.classList.toggle(`is-hidden`, el.dataset.view !== name)); }
function tab(name) { $$(`.tab`).forEach((el) => el.classList.toggle(`is-active`, el.dataset.tab === name)); $$(`[data-panel]`).forEach((el) => el.classList.toggle(`is-hidden`, el.dataset.panel !== name)); }
function detail(value = ``) { const row = document.createElement(`div`); row.className = `detail-row`; row.innerHTML = `<input name=details[] placeholder=Product-detail value=${esc(value)}><button class=icon-action type=button aria-label=Remove>x</button>`; row.querySelector(`button`).onclick = () => row.remove(); return row; }
function ensureDetail() { if (!$(`#detail-fields`).children.length) $(`#detail-fields`).appendChild(detail()); }
function renderProducts() { $(`#products-list`).innerHTML = state.catalog.products.map((p) => `<article class=admin-card><div class=mini-images>${[p.image1Id,p.image2Id].filter(Boolean).map((id)=>`<img src=${img(id)} alt>`).join(``)}</div><h3>${esc(p.name)}</h3><p>${esc(state.catalog.settings.currency || `INR`)} ${Number(p.price || 0).toLocaleString(`en-IN`)}</p><ul>${(p.details || []).map((d)=>`<li>${esc(d)}</li>`).join(``)}</ul><button class=ghost-action data-delete-product=${p.$id} type=button>Remove</button></article>`).join(``); $$(`[data-delete-product]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/products/${b.dataset.deleteProduct}`,`DELETE`); await loadCatalog(); }); }
function renderFabrics() { $(`#fabrics-list`).innerHTML = state.catalog.fabrics.map((f) => `<article class=admin-card>${f.imageId ? `<img class=card-image src=${img(f.imageId)} alt>` : ``}<h3>${esc(f.name)}</h3><button class=ghost-action data-delete-fabric=${f.$id} type=button>Remove</button></article>`).join(``); $$(`[data-delete-fabric]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/fabrics/${b.dataset.deleteFabric}`,`DELETE`); await loadCatalog(); }); }
function renderOrders() { $(`#orders-list`).innerHTML = state.orders.length ? state.orders.map((o)=>`<article class=admin-card><h3>${esc(o.customerName || `Customer`)}</h3><p>${esc(o.productName)} with ${esc(o.fabricName)}</p><p>Status: ${esc(o.status || `new`)}</p></article>`).join(``) : `<p class=message>No custom orders yet.</p>`; }
function fillSettings() { const f = $(`#settings-form`); f.currency.value = state.catalog.settings.currency || `INR`; f.shopDomain.value = state.catalog.settings.shopDomain || `anasiya.com`; f.customVariantId.value = state.catalog.settings.customVariantId || ``; f.policyText.value = state.catalog.settings.policyText || ``; }
async function loadCatalog() { state.catalog = await api(`/catalog`); renderProducts(); renderFabrics(); fillSettings(); }
async function loadOrders() { state.orders = (await api(`/admin/orders`)).orders || []; renderOrders(); }
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
$(`#product-form`).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await api(`/admin/products`, `POST`, { name: f.get(`name`), price: Number(f.get(`price`) || 0), image1Id: await upload(f.get(`image1`)), image2Id: await upload(f.get(`image2`)), details: f.getAll(`details[]`).map((x)=>String(x).trim()).filter(Boolean) }); e.currentTarget.reset(); $(`#detail-fields`).innerHTML = ``; ensureDetail(); await loadCatalog(); };
$(`#fabric-form`).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await api(`/admin/fabrics`, `POST`, { name: f.get(`name`), imageId: await upload(f.get(`image`)) }); e.currentTarget.reset(); await loadCatalog(); };
$(`#settings-form`).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await api(`/admin/settings`, `PUT`, { currency: f.get(`currency`), shopDomain: f.get(`shopDomain`), customVariantId: f.get(`customVariantId`), policyText: f.get(`policyText`) }); $(`#settings-message`).textContent = `Settings saved.`; await loadCatalog(); };
account.get().then(async()=>{ view(`dashboard`); await loadCatalog(); await loadOrders(); }).catch(()=>view(`login`));
