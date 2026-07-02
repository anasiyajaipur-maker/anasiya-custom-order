(function () {
  const CONFIG = { endpoint: `https://sgp.cloud.appwrite.io/v1`, projectId: `6a454ec900060f12e3ec`, functionId: `anasiya-api`, bucketId: `catalog-images` };
  const state = { open: false, step: 0, catalog: null, product: null, productDetail: false, fabric: null, busy: false, error: `` };
  const esc = (value) => String(value ?? ``).replace(/[&<>"']/g, (ch) => ({ [`&`]: `&amp;`, [`<`]: `&lt;`, [`>`]: `&gt;`, [`"`]: `&quot;`, [`'`]: `&#39;` }[ch]));
  const money = (value, currency = `INR`) => new Intl.NumberFormat(`en-IN`, { style: `currency`, currency, maximumFractionDigits: 0 }).format(Number(value || 0));
  const imageUrl = (id) => id ? `${CONFIG.endpoint}/storage/buckets/${CONFIG.bucketId}/files/${id}/view?project=${CONFIG.projectId}` : ``;

  async function api(path, method = `GET`, payload = {}) {
    const response = await fetch(`${CONFIG.endpoint}/functions/${CONFIG.functionId}/executions`, {
      method: `POST`,
      headers: { [`Content-Type`]: `application/json`, [`X-Appwrite-Project`]: CONFIG.projectId },
      body: JSON.stringify({ async: false, path, method, body: method === `GET` ? `` : JSON.stringify(payload), headers: { [`content-type`]: `application/json` } })
    });
    const run = await response.json();
    const data = JSON.parse(run.responseBody || run.response || `{}`);
    if (!response.ok || run.status !== `completed` || data.error) throw new Error(data.error || `Something went wrong. Please try again.`);
    return data;
  }

  function ensureRoot() {
    let root = document.getElementById(`anasiya-order-root`);
    if (!root) { root = document.createElement(`div`); root.id = `anasiya-order-root`; document.body.appendChild(root); }
    return root;
  }

  function mount() {
    ensureRoot();
    if (!document.getElementById(`anasiya-order-style`)) {
      const style = document.createElement(`style`);
      style.id = `anasiya-order-style`;
      style.textContent = css();
      document.head.appendChild(style);
    }
    document.addEventListener(`click`, (event) => {
      const trigger = event.target.closest(`[data-anasiya-custom-order]`);
      if (trigger) { event.preventDefault(); openTool(); }
    });
  }

  async function openTool() {
    state.open = true; state.step = 0; state.productDetail = false; state.error = ``;
    document.documentElement.classList.add(`aco-lock`);
    render();
    if (state.catalog) return;
    state.busy = true; render();
    try { state.catalog = await api(`/catalog`); }
    catch (error) { state.error = error.message || `Could not load custom order options.`; }
    finally { state.busy = false; render(); }
  }

  function closeTool() { state.open = false; document.documentElement.classList.remove(`aco-lock`); render(); }
  function stepClass(index) { return index === state.step ? `is-active` : (index < state.step ? `is-left` : ``); }
  function image(id, label) { return id ? `<img src="${imageUrl(id)}" alt="${esc(label)}">` : `<span>${esc((label || `A`).slice(0,1))}</span>`; }
  function productImages(product) {
    const ids = [product.image1Id, product.image2Id].filter(Boolean);
    if (!ids.length) return `<div class="aco-img">${image(``, product.name)}</div>`;
    if (ids.length === 1) return `<div class="aco-img">${image(ids[0], product.name)}</div>`;
    return `<div class="aco-duo"><div class="aco-img">${image(ids[0], `${product.name} photo 1`)}</div><div class="aco-img">${image(ids[1], `${product.name} photo 2`)}</div></div>`;
  }
  function details(product) { return (product.details || []).map((detail) => `<li>${esc(detail)}</li>`).join(``); }

  function productGrid(products, currency) {
    if (state.busy) return `<div class="aco-empty">Loading custom order options...</div>`;
    if (state.error) return `<div class="aco-empty aco-error">${esc(state.error)}</div>`;
    if (!products.length) return `<div class="aco-empty">No active products yet.</div>`;
    return `<div class="aco-grid">${products.map((product) => `<article class="aco-card ${state.product?.$id === product.$id ? `is-selected` : ``}" data-product="${product.$id}">${productImages(product)}<div class="aco-card-body"><p class="aco-name">${esc(product.name)}</p><p class="aco-price">${money(product.price, currency)}</p><button class="aco-show-product" type="button" data-show-product="${product.$id}">Show product</button></div></article>`).join(``)}</div>`;
  }

  function productDetail(product, currency) {
    const first = product.image1Id || product.image2Id;
    const second = product.image2Id || product.image1Id;
    return `<div class="aco-detail-view"><div class="aco-detail-photos"><div class="aco-img">${image(first, `${product.name} photo 1`)}</div><div class="aco-img">${image(second, `${product.name} photo 2`)}</div></div><div class="aco-detail-copy"><div class="aco-kicker">Selected style</div><h3>${esc(product.name)}</h3><p class="aco-price">${money(product.price, currency)}</p><ul class="aco-details">${details(product)}</ul><div class="aco-detail-actions"><button class="aco-btn secondary" data-back-products type="button">Back to styles</button><button class="aco-btn" data-next="1" type="button">Select fabric</button></div></div></div>`;
  }

  function productStep(products, currency) {
    if (state.productDetail && state.product) return productDetail(state.product, currency);
    return `${productGrid(products, currency)}<div class="aco-footer"><div class="aco-selection">${state.product ? `Selected: <strong>${esc(state.product.name)}</strong>` : `Click a style to select it.`}</div><button class="aco-btn" data-next="1" type="button" ${state.product ? `` : `disabled`}>Select fabric</button></div>`;
  }

  function fabricStep(fabrics) {
    const grid = fabrics.length ? `<div class="aco-grid">${fabrics.map((fabric) => `<button class="aco-card aco-fabric-card ${state.fabric?.$id === fabric.$id ? `is-selected` : ``}" data-fabric="${fabric.$id}" type="button"><div class="aco-img">${image(fabric.imageId, fabric.name)}</div><div class="aco-card-body"><p class="aco-name">${esc(fabric.name)}</p></div></button>`).join(``)}</div>` : `<div class="aco-empty">No active fabrics yet.</div>`;
    return `${grid}<div class="aco-footer"><button class="aco-btn secondary" data-prev="0" type="button">Back</button><div class="aco-selection">${state.fabric ? `Selected: <strong>${esc(state.fabric.name)}</strong>` : `Select one print to continue.`}</div><button class="aco-btn" data-next="2" type="button" ${state.fabric ? `` : `disabled`}>Review order</button></div>`;
  }

  function reviewStep(currency, settings) {
    return `<div class="aco-review"><div class="aco-panel"><h3>Order summary</h3><div class="aco-review-product"><div class="aco-review-thumb">${image(state.product?.image1Id, state.product?.name)}</div><div><strong>${esc(state.product?.name)}</strong><p>${money(state.product?.price, currency)}</p></div></div><div class="aco-row"><span>Fabric</span><strong>${esc(state.fabric?.name)}</strong></div><div class="aco-row"><span>Total</span><strong>${money(state.product?.price, currency)}</strong></div></div><div class="aco-panel aco-policy"><h3>Custom order policy</h3><p>${esc(settings.policyText || `Custom orders are prepared specially for you. Delivery and fabric placement may vary slightly.`)}</p><div class="aco-trust"><span>Secure Shopify checkout</span><span>Order confirmation by email</span></div></div></div><div class="aco-footer"><button class="aco-btn secondary" data-prev="1" type="button">Back</button><div class="aco-selection">Payment continues securely in Shopify.</div><button class="aco-btn" data-pay type="button" ${state.busy ? `disabled` : ``}>${state.busy ? `Preparing...` : `Confirm and pay`}</button></div>${state.error ? `<div class="aco-empty aco-error">${esc(state.error)}</div>` : ``}`;
  }

  async function pay() {
    if (!state.product || !state.fabric) return;
    state.busy = true; state.error = ``; render();
    try {
      const result = await api(`/orders`, `POST`, { productId: state.product.$id, fabricId: state.fabric.$id, productName: state.product.name, fabricName: state.fabric.name, price: state.product.price });
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
      else throw new Error(`Shopify checkout is not configured yet.`);
    } catch (error) { state.busy = false; state.error = error.message || `Could not prepare checkout.`; render(); }
  }

  function render() {
    const root = ensureRoot();
    if (!state.open) { root.innerHTML = ``; return; }
    const catalog = state.catalog || { products: [], fabrics: [], settings: {} };
    const currency = catalog.settings.currency || `INR`;
    root.innerHTML = `<div class="aco-overlay" role="dialog" aria-modal="true" aria-label="Anasiya custom order"><div class="aco-shell"><header class="aco-top"><div class="aco-brand">Anasiya</div><div class="aco-progress" aria-label="Step ${state.step + 1} of 3"><span class="aco-dot ${state.step === 0 ? `is-on` : ``}"></span><span class="aco-dot ${state.step === 1 ? `is-on` : ``}"></span><span class="aco-dot ${state.step === 2 ? `is-on` : ``}"></span></div><button class="aco-close" data-close type="button" aria-label="Close">&times;</button></header><main class="aco-stage"><section class="aco-page ${stepClass(0)}"><div class="aco-head"><div><div class="aco-kicker">Step 1 of 3</div><h2 class="aco-title">Choose your style</h2><p class="aco-sub">Select a product card, or open it to view both photographs and every detail.</p></div></div>${productStep(catalog.products || [], currency)}</section><section class="aco-page ${stepClass(1)}"><div class="aco-head"><div><div class="aco-kicker">Step 2 of 3</div><h2 class="aco-title">Select your print</h2><p class="aco-sub">Choose the fabric or print you would like with your selected style.</p></div></div>${fabricStep(catalog.fabrics || [])}</section><section class="aco-page ${stepClass(2)}"><div class="aco-head"><div><div class="aco-kicker">Step 3 of 3</div><h2 class="aco-title">Review and pay</h2><p class="aco-sub">Check your selection before moving to secure Shopify checkout.</p></div></div>${reviewStep(currency, catalog.settings || {})}</section></main></div></div>`;
    wire(root, catalog.products || [], catalog.fabrics || []);
  }

  function renderPreservingScroll() {
    const current = ensureRoot().querySelector(`.aco-page.is-active`);
    const scrollTop = current?.scrollTop || 0;
    render();
    const next = ensureRoot().querySelector(`.aco-page.is-active`);
    if (next) next.scrollTop = scrollTop;
  }

  function wire(root, products, fabrics) {
    root.querySelector(`[data-close]`)?.addEventListener(`click`, closeTool);
    root.querySelectorAll(`[data-product]`).forEach((element) => element.addEventListener(`click`, () => { state.product = products.find((product) => product.$id === element.dataset.product); renderPreservingScroll(); }));
    root.querySelectorAll(`[data-show-product]`).forEach((element) => element.addEventListener(`click`, (event) => { event.stopPropagation(); state.product = products.find((product) => product.$id === element.dataset.showProduct); state.productDetail = true; render(); }));
    root.querySelectorAll(`[data-fabric]`).forEach((element) => element.addEventListener(`click`, () => { state.fabric = fabrics.find((fabric) => fabric.$id === element.dataset.fabric); renderPreservingScroll(); }));
    root.querySelectorAll(`[data-next]`).forEach((element) => element.addEventListener(`click`, () => { state.step = Number(element.dataset.next); state.productDetail = false; state.error = ``; render(); }));
    root.querySelectorAll(`[data-prev]`).forEach((element) => element.addEventListener(`click`, () => { state.step = Number(element.dataset.prev); state.productDetail = false; state.error = ``; render(); }));
    root.querySelector(`[data-back-products]`)?.addEventListener(`click`, () => { state.productDetail = false; render(); });
    root.querySelector(`[data-pay]`)?.addEventListener(`click`, pay);
  }

  function css() { return `
    .aco-lock{overflow:hidden!important}.aco-overlay{position:fixed;inset:0;z-index:2147483000;background:#fbf7fc;color:#2c2330;font-family:"Nunito Sans",Arial,sans-serif}.aco-shell{height:100%;display:flex;flex-direction:column}.aco-top{height:68px;flex:0 0 68px;display:flex;align-items:center;justify-content:space-between;padding:0 42px;border-bottom:1px solid rgba(158,106,174,.18);background:rgba(255,255,255,.9);backdrop-filter:blur(14px)}.aco-brand{font-family:Georgia,serif;font-size:22px;letter-spacing:.1em;text-transform:uppercase;color:#6f467c}.aco-close{width:42px;height:42px;border-radius:50%;border:1px solid rgba(158,106,174,.3);background:#fff;color:#6f467c;font-size:26px;line-height:1;cursor:pointer}.aco-progress{display:flex;gap:8px;align-items:center}.aco-dot{height:8px;width:34px;border-radius:20px;background:#eadff0}.aco-dot.is-on{background:#9e6aae}.aco-stage{position:relative;flex:1;overflow:hidden}.aco-page{position:absolute;inset:0;overflow:auto;padding:38px 42px;transform:translateX(100%);opacity:0;transition:transform .28s ease,opacity .28s ease}.aco-page.is-active{transform:translateX(0);opacity:1}.aco-page.is-left{transform:translateX(-28%);opacity:0}.aco-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 auto 24px;max-width:1180px}.aco-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9e6aae;font-weight:700}.aco-title{font-family:Georgia,serif;font-size:42px;font-weight:500;letter-spacing:0;margin:6px 0;color:#2c2330}.aco-sub{margin:0;color:#665b6b;max-width:620px;line-height:1.55}.aco-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}.aco-card{border:1px solid rgba(158,106,174,.2);background:#fff;border-radius:8px;overflow:hidden;text-align:left;cursor:pointer;color:#2c2330;box-shadow:0 12px 34px rgba(96,56,108,.07);transition:transform .18s,border-color .18s,box-shadow .18s,background .18s}.aco-card:hover{transform:translateY(-2px);border-color:#9e6aae;box-shadow:0 18px 44px rgba(96,56,108,.14)}.aco-card.is-selected{transform:translateY(-2px);border:3px solid #6f467c;background:#f3e6f7;box-shadow:0 18px 44px rgba(96,56,108,.18)}.aco-img{aspect-ratio:4/5;background:#f1e6f4;display:flex;align-items:center;justify-content:center;color:#9e6aae;font-family:Georgia,serif;font-size:32px;overflow:hidden}.aco-img img{width:100%;height:100%;object-fit:cover}.aco-duo{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#eadff0}.aco-duo .aco-img{aspect-ratio:3/4}.aco-card-body{padding:14px}.aco-name{font-size:16px;font-weight:700;color:#2c2330;margin:0 0 4px;line-height:1.4}.aco-price{font-size:14px;color:#7b4d89;font-weight:700;margin:0 0 10px}.aco-show-product{width:100%;margin-top:4px;border:1px solid #9e6aae;border-radius:6px;padding:10px 12px;background:#fff;color:#6f467c;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.aco-show-product:hover{background:#f3e6f7}.aco-detail-view{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:minmax(280px,1.05fr) minmax(260px,.95fr);gap:22px;align-items:start}.aco-detail-photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aco-detail-photos .aco-img{border-radius:8px;border:1px solid rgba(158,106,174,.18);background:#fff}.aco-detail-copy{background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:22px;box-shadow:0 14px 34px rgba(96,56,108,.08)}.aco-detail-copy h3{font-family:Georgia,serif;font-size:36px;font-weight:500;letter-spacing:0;margin:0 0 8px;color:#2c2330}.aco-details{padding:0;margin:0;list-style:none;color:#665b6b;font-size:14px;line-height:1.5}.aco-details li{margin-top:7px;padding-left:16px;position:relative}.aco-details li:before{content:"";position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:#9e6aae}.aco-detail-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.aco-footer{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px;margin:22px auto 0;padding-top:16px;border-top:1px solid rgba(158,106,174,.16)}.aco-selection{font-size:14px;color:#665b6b}.aco-btn{border:0;border-radius:999px;padding:13px 22px;font-weight:700;cursor:pointer;background:#6f467c;color:#fff;box-shadow:0 10px 26px rgba(96,56,108,.2)}.aco-btn.secondary{background:#fff;color:#6f467c;border:1px solid rgba(158,106,174,.3);box-shadow:none}.aco-btn:disabled{opacity:.45;cursor:not-allowed}.aco-fabric-card{padding:0}.aco-review{max-width:920px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:18px}.aco-panel{background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:20px}.aco-panel h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#9e6aae;margin:0 0 14px}.aco-review-product{display:grid;grid-template-columns:74px 1fr;gap:13px;align-items:center;padding-bottom:13px;border-bottom:1px solid #eee}.aco-review-product p{margin:4px 0 0;color:#7b4d89}.aco-review-thumb{width:74px;height:88px;border-radius:6px;overflow:hidden;background:#f1e6f4;display:grid;place-items:center;color:#9e6aae}.aco-review-thumb img{width:100%;height:100%;object-fit:cover}.aco-row{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid #eee}.aco-row:last-child{border-bottom:0}.aco-policy{line-height:1.55;color:#665b6b;background:#f8f1fa}.aco-trust{display:grid;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(158,106,174,.16);font-size:13px;color:#6f467c}.aco-trust span:before{content:"\\2713";margin-right:8px}.aco-error{color:#9b2d22;font-weight:700}.aco-empty{max-width:760px;margin:40px auto;background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:28px;text-align:center;color:#665b6b}
    @media(max-width:720px){.aco-top{height:60px;flex-basis:60px;padding:0 16px}.aco-progress{display:none}.aco-page{padding:22px 16px}.aco-head{display:block}.aco-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.aco-card-body{padding:11px}.aco-title{font-size:30px}.aco-duo .aco-img{aspect-ratio:1/1.18}.aco-detail-view{grid-template-columns:1fr}.aco-detail-photos{grid-template-columns:1fr 1fr;gap:8px}.aco-detail-copy h3{font-size:28px}.aco-review{grid-template-columns:1fr}.aco-footer{position:sticky;bottom:-1px;background:rgba(251,247,252,.96);backdrop-filter:blur(14px);padding:14px 0;margin-top:16px}.aco-btn{padding:12px 16px}.aco-selection{font-size:12px}.aco-review-product{grid-template-columns:62px 1fr}.aco-review-thumb{width:62px;height:74px}}
  `; }

  window.AnasiyaCustomOrder = { open: openTool, close: closeTool };
  if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, mount); else mount();
}());