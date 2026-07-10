import { config } from './config.js';
const sdk = await import(`appwrite`);
const { Account, Client, Functions } = sdk;
const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
const account = new Account(client);
const functions = new Functions(client);
const state = { catalog: { products: [], fabrics: [], settings: {} }, orders: [], shopify: {}, editingProductId: null };
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
  $(`#products-list`).innerHTML = state.catalog.products.length ? state.catalog.products.map((p) => `<article class="admin-item"><div class="admin-thumb duo-thumb">${[p.image1Id,p.image2Id].filter(Boolean).map((id)=>`<img src="${img(id)}" alt="">`).join(``) || esc((p.name || `A`).slice(0,1))}</div><div class="admin-item-copy"><h3>${esc(p.name)}</h3><p class="admin-meta">${esc(state.catalog.settings.currency || `INR`)} ${Number(p.price || 0).toLocaleString(`en-IN`)}</p><div class="detail-pills">${(p.details || []).slice(0,3).map((d)=>`<span class="detail-pill">${esc(d)}</span>`).join(``)}</div><form class="shopify-link-form" data-shopify-product="${p.$id}"><label><span>Shopify variant</span><input name="shopifyVariantId" value="${esc(p.shopifyVariantId || ``)}" placeholder="ID or Shopify variant URL"></label><button class="ghost-action" type="submit">${p.shopifyVariantId ? `Update` : `Connect`}</button><small aria-live="polite"></small></form></div><div class="admin-item-actions"><button class="ghost-action edit-action" data-edit-product="${p.$id}" type="button">Edit</button><button class="ghost-action remove-action" data-delete-product="${p.$id}" type="button">Remove</button></div></article>`).join(``) : `<div class="empty-card"><p>No products yet. Add your first style using the form.</p></div>`;
  $$(`[data-delete-product]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/products/${b.dataset.deleteProduct}`,`DELETE`); await loadCatalog(); });
  $$(`[data-edit-product]`).forEach((b) => b.onclick = () => {
    const product = state.catalog.products.find(p => p.$id === b.dataset.editProduct);
    if (product) startEdit(product);
  });
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
function startEdit(product) {
  state.editingProductId = product.$id;
  const form = $(`#product-form`);
  form.querySelector(`h2`).textContent = `Edit product`;
  form.querySelector(`button[type=submit]`).textContent = `Save changes`;
  let cancelBtn = form.querySelector(`#cancel-edit-btn`);
  if (!cancelBtn) {
    cancelBtn = document.createElement(`button`);
    cancelBtn.id = `cancel-edit-btn`;
    cancelBtn.type = `button`;
    cancelBtn.className = `ghost-action`;
    cancelBtn.style.marginLeft = `10px`;
    cancelBtn.textContent = `Cancel`;
    cancelBtn.onclick = resetProductForm;
    form.querySelector(`.form-footer`).appendChild(cancelBtn);
  }
  form.name.value = product.name || ``;
  form.price.value = product.price || ``;
  form.shopifyVariantId.value = product.shopifyVariantId || ``;
  const fields = $(`#detail-fields`);
  fields.innerHTML = ``;
  if (product.details && product.details.length) {
    product.details.forEach(d => fields.appendChild(detail(d)));
  } else {
    ensureDetail();
  }
  form.scrollIntoView({ behavior: `smooth` });
}
function resetProductForm() {
  state.editingProductId = null;
  const form = $(`#product-form`);
  form.reset();
  form.querySelector(`h2`).textContent = `Add product`;
  form.querySelector(`button[type=submit]`).textContent = `Add product`;
  const cancelBtn = form.querySelector(`#cancel-edit-btn`);
  if (cancelBtn) cancelBtn.remove();
  $(`#detail-fields`).innerHTML = ``;
  ensureDetail();
}
function renderFabrics() {
  $(`#fabrics-list`).innerHTML = state.catalog.fabrics.length ? state.catalog.fabrics.map((f) => `<article class="admin-item"><div class="admin-thumb">${f.imageId ? `<img src="${img(f.imageId)}" alt="">` : esc((f.name || `A`).slice(0,1))}</div><div class="admin-item-copy"><h3>${esc(f.name)}</h3><p class="admin-meta">Visible in the customer print library</p></div><button class="ghost-action" data-delete-fabric="${f.$id}" type="button">Remove</button></article>`).join(``) : `<div class="empty-card"><p>No fabrics yet. Add your first print using the form.</p></div>`;
  $$(`[data-delete-fabric]`).forEach((b)=>b.onclick=async()=>{ await api(`/admin/fabrics/${b.dataset.deleteFabric}`,`DELETE`); await loadCatalog(); });
}
function renderOrders() {
  const sync = `<div class="sync-status ${state.shopify.webhookConfigured ? `is-ready` : `is-pending`}"><strong>${state.shopify.webhookConfigured ? `Shopify sync ready` : `Shopify sync needs setup`}</strong><span>${state.shopify.webhookConfigured ? `Paid Shopify orders update here automatically.` : `Add the webhook secret and register the paid-order webhook.`}</span></div>`;
  const paidOrders = state.orders.filter(o => o.status === `paid`);
  const rows = paidOrders.length ? paidOrders.map((o) => {
    const date = o.createdAt ? new Date(o.createdAt).toLocaleString(`en-IN`, { dateStyle: `medium`, timeStyle: `short` }) : ``;
    const orderNo = o.shopifyOrderNumber || `SH-order`;
    return `
      <article class="order-item collapsible-order" data-order-id="${o.$id}" style="cursor: pointer; position: relative;">
        <div class="order-top">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-family: monospace; font-size: 13px; background: var(--base-soft); color: var(--base-dark); padding: 3px 6px; border-radius: 4px;">${esc(orderNo)}</span>
            <strong>${esc(o.productName || `Custom order`)}</strong>
          </div>
          <span class="status-pill status-paid">Confirmed</span>
        </div>
        <div class="order-row">
          <span>Print</span><strong>${esc(o.fabricName)}</strong>
          <span>Size</span><strong>${esc(o.size || `—`)}</strong>
          <span>Amount</span><strong>${esc(state.catalog.settings.currency || `INR`)} ${Number(o.price || 0).toLocaleString(`en-IN`)}</strong>
          ${date ? `<span>${esc(date)}</span>` : ``}
        </div>
        <div class="order-details-drawer is-hidden" id="details-${o.$id}" style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--line); animation: fadeIn 0.2s ease;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div>
              <h4 style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: var(--base); letter-spacing: 0.05em;">Customer Info</h4>
              <p style="margin: 0 0 4px 0; color: var(--ink); font-weight: 600;">${esc(o.customerName || 'N/A')}</p>
              <p style="margin: 0 0 4px 0; font-size: 13px;">Email: <a href="mailto:${esc(o.customerEmail || '')}" style="color: var(--base-dark); text-decoration: none;">${esc(o.customerEmail || 'N/A')}</a></p>
              <p style="margin: 0; font-size: 13px;">Phone: ${esc(o.customerPhone || 'N/A')}</p>
            </div>
            <div>
              <h4 style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: var(--base); letter-spacing: 0.05em;">Shipping Address</h4>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink);">${esc(o.shippingAddress || 'No address provided')}</p>
            </div>
          </div>
          <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
            <a class="ghost-action" href="https://${esc(state.catalog.settings.shopDomain || 'anasiya.com')}/admin/orders" target="_blank" style="text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 5px 12px;">
              View in Shopify Admin ↗
            </a>
          </div>
        </div>
        <div style="text-align: center; margin-top: 8px; font-size: 11px; color: var(--base); font-weight: 600;" class="toggle-hint">
          Click to show details
        </div>
      </article>
    `;
  }).join(``) : `<div class="empty-card"><p>No confirmed custom orders yet.</p></div>`;
  $(`#orders-list`).innerHTML = sync + rows;
  $$(`.collapsible-order`).forEach((card) => {
    card.onclick = () => {
      const drawer = card.querySelector(`.order-details-drawer`);
      const hint = card.querySelector(`.toggle-hint`);
      const isHidden = drawer.classList.toggle(`is-hidden`);
      hint.textContent = isHidden ? `Click to show details` : `Click to hide details`;
    };
  });
}
function fillSettings() { const f = $(`#settings-form`); f.currency.value = state.catalog.settings.currency || `INR`; f.shopDomain.value = state.catalog.settings.shopDomain || `anasiya.com`; f.customVariantId.value = state.catalog.settings.customVariantId || ``; f.policyText.value = state.catalog.settings.policyText || ``; f.sizeNote.value = state.catalog.settings.sizeNote || ``; }
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
$(`#product-form`).onsubmit = async (e) => { e.preventDefault(); const form = e.currentTarget; await submit(form, $(`#product-message`), async () => { const f = new FormData(form); const image1File = f.get(`image1`); const image2File = f.get(`image2`); let image1Id = ``; if (image1File && image1File.size > 0) image1Id = await upload(image1File); let image2Id = ``; if (image2File && image2File.size > 0) image2Id = await upload(image2File); const details = f.getAll(`details[]`).map((x)=>String(x).trim()).filter(Boolean); const shopifyVariantId = f.get(`shopifyVariantId`); const name = f.get(`name`); const price = Number(f.get(`price`) || 0); if (state.editingProductId) { const payload = { name, price, details, shopifyVariantId }; if (image1Id) payload.image1Id = image1Id; if (image2Id) payload.image2Id = image2Id; await api(`/admin/products/${state.editingProductId}`, `PUT`, payload); } else { await api(`/admin/products`, `POST`, { name, price, image1Id, image2Id, details, shopifyVariantId }); } resetProductForm(); await loadCatalog(); }); };
$(`#fabric-form`).onsubmit = async (e) => { e.preventDefault(); const form = e.currentTarget; await submit(form, $(`#fabric-message`), async () => { const f = new FormData(form); await api(`/admin/fabrics`, `POST`, { name: f.get(`name`), imageId: await upload(f.get(`image`)) }); form.reset(); await loadCatalog(); }); };
$(`#settings-form`).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await api(`/admin/settings`, `PUT`, { currency: f.get(`currency`), shopDomain: f.get(`shopDomain`), customVariantId: f.get(`customVariantId`), policyText: f.get(`policyText`), sizeNote: f.get(`sizeNote`) }); $(`#settings-message`).textContent = `Settings saved.`; await loadCatalog(); };
account.get().then(async()=>{ view(`dashboard`); await loadCatalog(); await loadOrders(); }).catch(()=>view(`login`));
