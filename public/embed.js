(function () {
  const CONFIG = { endpoint: `https://sgp.cloud.appwrite.io/v1`, projectId: `6a454ec900060f12e3ec`, functionId: `anasiya-api`, bucketId: `catalog-images` };
  const FALLBACK_SIZES = [`XS`, `S`, `M`, `L`, `XL`, `XXL`, `Custom size`];
  const SIZE_CHART = [
    { size: `XS`, bust: `32`, waist: `26`, hip: `36` },
    { size: `S`, bust: `34`, waist: `28`, hip: `38` },
    { size: `M`, bust: `36`, waist: `30`, hip: `40` },
    { size: `L`, bust: `38`, waist: `32`, hip: `42` },
    { size: `XL`, bust: `40`, waist: `34`, hip: `44` },
    { size: `XXL`, bust: `42`, waist: `36`, hip: `46` }
  ];
  const state = { open: false, step: 0, catalog: null, product: null, productDetail: false, fabric: null, size: null, sizeChartOpen: false, checkoutRequestId: null, busy: false, error: `` };
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
    state.open = true; state.step = 0; state.productDetail = false; state.size = null; state.sizeChartOpen = false; state.checkoutRequestId = null; state.error = ``;
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
    return `<div class="aco-grid aco-product-grid">${products.map((product) => `<article class="aco-card ${state.product?.$id === product.$id ? `is-selected` : ``}" data-product="${product.$id}">${productImages(product)}<div class="aco-card-body"><p class="aco-name">${esc(product.name)}</p><p class="aco-price">${money(product.price, currency)}</p><button class="aco-show-product" type="button" data-show-product="${product.$id}">Show product</button></div></article>`).join(``)}</div>`;
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
    const grid = fabrics.length ? `<div class="aco-grid aco-fabric-grid">${fabrics.map((fabric) => `<button class="aco-card aco-fabric-card ${state.fabric?.$id === fabric.$id ? `is-selected` : ``}" data-fabric="${fabric.$id}" type="button"><div class="aco-img">${image(fabric.imageId, fabric.name)}</div><div class="aco-card-body"><p class="aco-name">${esc(fabric.name)}</p></div></button>`).join(``)}</div>` : `<div class="aco-empty">No active fabrics yet.</div>`;
    return `${grid}<div class="aco-footer"><button class="aco-btn secondary" data-prev="0" type="button">Back</button><div class="aco-selection">${state.fabric ? `Selected: <strong>${esc(state.fabric.name)}</strong>` : `Select one print to continue.`}</div><button class="aco-btn" data-next="2" type="button" ${state.fabric ? `` : `disabled`}>Select size</button></div>`;
  }

  function sizeChartTable() {
    return `<div class="aco-chart-wrap"><table class="aco-chart"><thead><tr><th>Size</th><th>Bust (in)</th><th>Waist (in)</th><th>Hip (in)</th></tr></thead><tbody>${SIZE_CHART.map((row) => `<tr class="${state.size === row.size ? `is-highlight` : ``}"><td>${esc(row.size)}</td><td>${row.bust}</td><td>${row.waist}</td><td>${row.hip}</td></tr>`).join(``)}<tr><td colspan="4" class="aco-chart-note">All measurements are approximate. Choose <strong>Custom size</strong> if you need a tailored fit.</td></tr></tbody></table></div>`;
  }

  function sizeStep(settings) {
    const sizes = settings.sizeOptions?.length ? settings.sizeOptions : FALLBACK_SIZES;
    const note = settings.sizeNote ? `<div class="aco-panel aco-size-note"><h3>Sizing guidance</h3><p>${esc(settings.sizeNote)}</p></div>` : ``;
    return `<div class="aco-size-layout"><div class="aco-panel aco-size-chart-panel"><div class="aco-chart-head"><h3>Size chart</h3><button class="aco-chart-toggle" type="button" data-toggle-chart aria-expanded="${state.sizeChartOpen}">${state.sizeChartOpen ? `Hide chart` : `View size chart`}</button></div>${state.sizeChartOpen ? sizeChartTable() : `<p class="aco-chart-hint">Open the chart to compare bust, waist, and hip measurements before choosing your size.</p>`}</div>${note}<div class="aco-panel aco-size-picker-panel"><h3>Select your size</h3><div class="aco-size-grid">${sizes.map((size) => `<button class="aco-size-btn ${state.size === size ? `is-selected` : ``}" data-size="${esc(size)}" type="button">${esc(size)}</button>`).join(``)}</div></div></div><div class="aco-footer"><button class="aco-btn secondary" data-prev="1" type="button">Back</button><div class="aco-selection">${state.size ? `Selected: <strong>${esc(state.size)}</strong>` : `Choose a size to continue.`}</div><button class="aco-btn" data-next="3" type="button" ${state.size ? `` : `disabled`}>Review order</button></div>`;
  }

  function reviewStep(currency, settings) {
    return `<div class="aco-review"><div class="aco-panel aco-summary-panel"><h3>Your selections</h3><div class="aco-review-selections"><div class="aco-review-choice"><div class="aco-review-thumb">${image(state.product?.image1Id, state.product?.name)}</div><div class="aco-review-choice-copy"><span>Selected product</span><strong>${esc(state.product?.name)}</strong></div></div><div class="aco-review-choice"><div class="aco-review-thumb">${image(state.fabric?.imageId, state.fabric?.name)}</div><div class="aco-review-choice-copy"><span>Selected print</span><strong>${esc(state.fabric?.name)}</strong></div></div></div><div class="aco-review-size"><span>Selected size</span><strong>${esc(state.size)}</strong></div><div class="aco-order-total"><span>Order total</span><strong>${money(state.product?.price, currency)}</strong></div><p class="aco-made-note">Made especially for you with your selected style, print, and size.</p></div><div class="aco-panel aco-policy"><h3>Before you continue</h3><p>${esc(settings.policyText || `Custom orders are prepared specially for you. Delivery and fabric placement may vary slightly.`)}</p><div class="aco-trust"><span>Secure Shopify checkout</span><span>Order confirmation by email</span><span>Your selections are included with the order</span></div></div></div><div class="aco-footer aco-review-footer"><button class="aco-btn secondary" data-prev="2" type="button">Back</button><div class="aco-selection">Secure checkout powered by Shopify</div><button class="aco-btn" data-pay type="button" ${state.busy ? `disabled` : ``}>${state.busy ? `Preparing...` : `Confirm and pay`}</button></div>${state.error ? `<div class="aco-empty aco-error">${esc(state.error)}</div>` : ``}`;
  }

  function sameShopHost(shopDomain) {
    const current = window.location.hostname.toLowerCase().replace(/^www\./, ``);
    const configured = String(shopDomain || ``).toLowerCase().replace(/^www\./, ``);
    return current === configured;
  }

  async function continueToShopify(result) {
    const root = window.Shopify?.routes?.root || `/`;
    if (!window.Shopify || !sameShopHost(result.shopDomain)) {
      window.location.assign(result.checkoutUrl);
      return;
    }
    const response = await fetch(`${root}cart/add.js`, {
      method: `POST`,
      headers: { [`Content-Type`]: `application/json`, Accept: `application/json` },
      body: JSON.stringify({ items: [{ id: result.variantId, quantity: 1, properties: result.properties }] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.description || data.message || `This style could not be added to Shopify checkout.`);
    window.location.assign(`${root}checkout`);
  }

  async function pay() {
    if (!state.product || !state.fabric || !state.size) return;
    state.checkoutRequestId ||= globalThis.crypto?.randomUUID?.() || `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.busy = true; state.error = ``; render();
    try {
      const result = await api(`/orders`, `POST`, { productId: state.product.$id, fabricId: state.fabric.$id, size: state.size, requestId: state.checkoutRequestId });
      if (!result.variantId || !result.checkoutUrl) throw new Error(`Shopify checkout is not configured yet.`);
      await continueToShopify(result);
    } catch (error) { state.busy = false; state.error = error.message || `Could not prepare checkout.`; render(); }
  }

  function render() {
    const root = ensureRoot();
    if (!state.open) { root.innerHTML = ``; return; }
    const catalog = state.catalog || { products: [], fabrics: [], settings: {} };
    const currency = catalog.settings.currency || `INR`;
    root.innerHTML = `<div class="aco-overlay" role="dialog" aria-modal="true" aria-label="Anasiya custom order"><div class="aco-shell"><header class="aco-top"><div class="aco-brand">Anasiya</div><div class="aco-progress" aria-label="Step ${state.step + 1} of 4"><span class="aco-dot ${state.step === 0 ? `is-on` : ``}"></span><span class="aco-dot ${state.step === 1 ? `is-on` : ``}"></span><span class="aco-dot ${state.step === 2 ? `is-on` : ``}"></span><span class="aco-dot ${state.step === 3 ? `is-on` : ``}"></span></div><button class="aco-close" data-close type="button" aria-label="Close">&times;</button></header><main class="aco-stage"><section class="aco-page ${stepClass(0)}"><div class="aco-head"><div><div class="aco-kicker">Step 1 of 4</div><h2 class="aco-title">Choose your style</h2><p class="aco-sub">Select a product card, or open it to view both photographs and every detail.</p></div></div>${productStep(catalog.products || [], currency)}</section><section class="aco-page ${stepClass(1)}"><div class="aco-head"><div><div class="aco-kicker">Step 2 of 4</div><h2 class="aco-title">Select your print</h2><p class="aco-sub">Choose the fabric or print you would like with your selected style.</p></div></div>${fabricStep(catalog.fabrics || [])}</section><section class="aco-page ${stepClass(2)}"><div class="aco-head"><div><div class="aco-kicker">Step 3 of 4</div><h2 class="aco-title">Choose your size</h2><p class="aco-sub">Review the size chart, read the sizing note, and select the size that fits you best.</p></div></div>${sizeStep(catalog.settings || {})}</section><section class="aco-page ${stepClass(3)}"><div class="aco-head"><div><div class="aco-kicker">Step 4 of 4</div><h2 class="aco-title">Review and pay</h2><p class="aco-sub">Check your selection before moving to secure Shopify checkout.</p></div></div>${reviewStep(currency, catalog.settings || {})}</section></main></div></div>`;
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
    root.querySelectorAll(`[data-product]`).forEach((element) => element.addEventListener(`click`, () => { state.product = products.find((product) => product.$id === element.dataset.product); state.size = null; state.checkoutRequestId = null; renderPreservingScroll(); }));
    root.querySelectorAll(`[data-show-product]`).forEach((element) => element.addEventListener(`click`, (event) => { event.stopPropagation(); state.product = products.find((product) => product.$id === element.dataset.showProduct); state.productDetail = true; render(); }));
    root.querySelectorAll(`[data-fabric]`).forEach((element) => element.addEventListener(`click`, () => { state.fabric = fabrics.find((fabric) => fabric.$id === element.dataset.fabric); state.size = null; state.checkoutRequestId = null; renderPreservingScroll(); }));
    root.querySelectorAll(`[data-size]`).forEach((element) => element.addEventListener(`click`, () => { state.size = element.dataset.size; state.checkoutRequestId = null; renderPreservingScroll(); }));
    root.querySelector(`[data-toggle-chart]`)?.addEventListener(`click`, () => { state.sizeChartOpen = !state.sizeChartOpen; render(); });
    root.querySelectorAll(`[data-next]`).forEach((element) => element.addEventListener(`click`, () => { state.step = Number(element.dataset.next); state.productDetail = false; state.error = ``; render(); }));
    root.querySelectorAll(`[data-prev]`).forEach((element) => element.addEventListener(`click`, () => { state.step = Number(element.dataset.prev); state.productDetail = false; state.error = ``; render(); }));
    root.querySelector(`[data-back-products]`)?.addEventListener(`click`, () => { state.productDetail = false; render(); });
    root.querySelector(`[data-pay]`)?.addEventListener(`click`, pay);
  }

  function css() { return `
    .aco-lock{overflow:hidden!important}.aco-overlay{position:fixed;inset:0;z-index:2147483000;background:#fbf7fc;color:#2c2330;font-family:"Nunito Sans",Arial,sans-serif}.aco-shell{height:100%;display:flex;flex-direction:column}.aco-top{height:68px;flex:0 0 68px;display:flex;align-items:center;justify-content:space-between;padding:0 42px;border-bottom:1px solid rgba(158,106,174,.18);background:rgba(255,255,255,.9);backdrop-filter:blur(14px)}.aco-brand{font-family:Georgia,serif;font-size:22px;letter-spacing:.1em;text-transform:uppercase;color:#6f467c}.aco-close{width:42px;height:42px;border-radius:50%;border:1px solid rgba(158,106,174,.3);background:#fff;color:#6f467c;font-size:26px;line-height:1;cursor:pointer}.aco-progress{display:flex;gap:8px;align-items:center}.aco-dot{height:8px;width:34px;border-radius:20px;background:#eadff0}.aco-dot.is-on{background:#9e6aae}.aco-stage{position:relative;flex:1;overflow:hidden;background-color:#fbf7fc;background-image:url("/anasiya-floral-background.png");background-position:center top;background-repeat:repeat;background-size:min(100vw,800px) auto}.aco-page{position:absolute;inset:0;overflow:auto;padding:38px 42px;transform:translateX(100%);opacity:0;transition:transform .28s ease,opacity .28s ease}.aco-page.is-active{transform:translateX(0);opacity:1}.aco-page.is-left{transform:translateX(-28%);opacity:0}.aco-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 auto 24px;max-width:1180px}.aco-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9e6aae;font-weight:700}.aco-title{font-family:Georgia,serif;font-size:42px;font-weight:500;letter-spacing:0;margin:6px 0;color:#2c2330}.aco-sub{margin:0;color:#665b6b;max-width:620px;line-height:1.55}.aco-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}.aco-card{border:1px solid rgba(158,106,174,.2);background:#fff;border-radius:8px;overflow:hidden;text-align:left;cursor:pointer;color:#2c2330;box-shadow:0 12px 34px rgba(96,56,108,.07);transition:transform .18s,border-color .18s,box-shadow .18s,background .18s}.aco-card:hover{transform:translateY(-2px);border-color:#9e6aae;box-shadow:0 18px 44px rgba(96,56,108,.14)}.aco-card.is-selected{transform:translateY(-2px);border:3px solid #6f467c;background:#f3e6f7;box-shadow:0 18px 44px rgba(96,56,108,.18)}.aco-img{aspect-ratio:4/5;background:#f1e6f4;display:flex;align-items:center;justify-content:center;color:#9e6aae;font-family:Georgia,serif;font-size:32px;overflow:hidden}.aco-img img{width:100%;height:100%;object-fit:cover}.aco-duo{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#eadff0}.aco-duo .aco-img{aspect-ratio:3/4}.aco-card-body{padding:14px}.aco-name{font-size:16px;font-weight:700;color:#2c2330;margin:0 0 4px;line-height:1.4}.aco-price{font-size:14px;color:#7b4d89;font-weight:700;margin:0 0 10px}.aco-show-product{width:100%;margin-top:4px;border:1px solid #9e6aae;border-radius:6px;padding:10px 12px;background:#fff;color:#6f467c;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.aco-show-product:hover{background:#f3e6f7}.aco-detail-view{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:minmax(280px,1.05fr) minmax(260px,.95fr);gap:22px;align-items:start}.aco-detail-photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aco-detail-photos .aco-img{border-radius:8px;border:1px solid rgba(158,106,174,.18);background:#fff}.aco-detail-copy{background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:22px;box-shadow:0 14px 34px rgba(96,56,108,.08)}.aco-detail-copy h3{font-family:Georgia,serif;font-size:36px;font-weight:500;letter-spacing:0;margin:0 0 8px;color:#2c2330}.aco-details{padding:0;margin:0;list-style:none;color:#665b6b;font-size:14px;line-height:1.5}.aco-details li{margin-top:7px;padding-left:16px;position:relative}.aco-details li:before{content:"";position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:#9e6aae}.aco-detail-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.aco-footer{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px;margin:22px auto 0;padding-top:16px;border-top:1px solid rgba(158,106,174,.16)}.aco-selection{font-size:14px;color:#665b6b}.aco-btn{border:0;border-radius:999px;padding:13px 22px;font-weight:700;cursor:pointer;background:#6f467c;color:#fff;box-shadow:0 10px 26px rgba(96,56,108,.2)}.aco-btn.secondary{background:#fff;color:#6f467c;border:1px solid rgba(158,106,174,.3);box-shadow:none}.aco-btn:disabled{opacity:.45;cursor:not-allowed}.aco-fabric-card{padding:0}.aco-review{max-width:920px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:18px}.aco-panel{background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:20px}.aco-panel h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#9e6aae;margin:0 0 14px}.aco-review-product{display:grid;grid-template-columns:74px 1fr;gap:13px;align-items:center;padding-bottom:13px;border-bottom:1px solid #eee}.aco-review-product p{margin:4px 0 0;color:#7b4d89}.aco-review-thumb{width:74px;height:88px;border-radius:6px;overflow:hidden;background:#f1e6f4;display:grid;place-items:center;color:#9e6aae}.aco-review-thumb img{width:100%;height:100%;object-fit:cover}.aco-row{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid #eee}.aco-row:last-child{border-bottom:0}.aco-policy{line-height:1.55;color:#665b6b;background:#f8f1fa}.aco-trust{display:grid;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(158,106,174,.16);font-size:13px;color:#6f467c}.aco-trust span:before{content:"\\2713";margin-right:8px}.aco-error{color:#9b2d22;font-weight:700}.aco-empty{max-width:760px;margin:40px auto;background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:28px;text-align:center;color:#665b6b}.aco-review{max-width:1040px;grid-template-columns:minmax(0,1.12fr) minmax(320px,.88fr);align-items:stretch}.aco-panel{padding:24px;box-shadow:0 12px 34px rgba(82,52,92,.07)}.aco-summary-panel{display:flex;flex-direction:column}.aco-review-selections{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aco-review-choice{min-width:0;overflow:hidden;border:1px solid rgba(158,106,174,.2);border-radius:8px;background:#fdfafd}.aco-review-thumb{width:100%;height:auto;aspect-ratio:4/3;border-radius:0}.aco-review-choice-copy{display:grid;gap:3px;padding:11px 12px}.aco-review-choice-copy span{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9e6aae}.aco-review-choice-copy strong{overflow:hidden;color:#2c2330;font-size:15px;line-height:1.35;text-overflow:ellipsis}.aco-order-total{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:18px;padding-top:16px;border-top:1px solid #eadff0;font-size:15px}.aco-order-total strong{font-size:22px;color:#52345c}.aco-made-note{margin:7px 0 0;color:#756979;font-size:13px}.aco-policy{background:rgba(250,245,251,.96);border-top:3px solid #9e6aae}.aco-policy p{margin-bottom:0}.aco-trust span{display:flex;align-items:center;gap:9px}.aco-trust span:before{display:grid;place-items:center;flex:0 0 20px;width:20px;height:20px;margin:0;border-radius:50%;background:#ede0f1;font-size:12px}.aco-review-footer{max-width:1040px}.aco-size-layout{max-width:920px;margin:0 auto;display:grid;gap:16px}.aco-size-chart-panel,.aco-size-note,.aco-size-picker-panel{background:#fff;border:1px solid rgba(158,106,174,.18);border-radius:8px;padding:20px;box-shadow:0 12px 34px rgba(82,52,92,.07)}.aco-size-chart-panel h3,.aco-size-note h3,.aco-size-picker-panel h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#9e6aae;margin:0}.aco-chart-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.aco-chart-toggle{border:1px solid rgba(158,106,174,.3);border-radius:999px;padding:9px 14px;background:#fff;color:#6f467c;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.aco-chart-toggle:hover{background:#f3e6f7}.aco-chart-hint{margin:0;color:#665b6b;font-size:14px;line-height:1.55}.aco-chart-wrap{overflow:auto;border:1px solid rgba(158,106,174,.16);border-radius:8px}.aco-chart{width:100%;border-collapse:collapse;font-size:14px}.aco-chart th,.aco-chart td{padding:11px 12px;text-align:left;border-bottom:1px solid #eee}.aco-chart th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9e6aae;background:#faf5fb}.aco-chart tr.is-highlight td{background:#f3e6f7;font-weight:700;color:#52345c}.aco-chart-note{font-size:12px;color:#756979;line-height:1.45}.aco-size-note{line-height:1.55;color:#665b6b;background:rgba(250,245,251,.96);border-top:3px solid #9e6aae}.aco-size-note p{margin:10px 0 0}.aco-size-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;margin-top:14px}.aco-size-btn{min-height:48px;border:1px solid rgba(158,106,174,.24);border-radius:8px;background:#fff;color:#2c2330;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .18s,border-color .18s,background .18s,box-shadow .18s}.aco-size-btn:hover{transform:translateY(-1px);border-color:#9e6aae;background:#faf5fb}.aco-size-btn.is-selected{border:3px solid #6f467c;background:#f3e6f7;color:#52345c;box-shadow:0 10px 24px rgba(96,56,108,.12)}.aco-review-size{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;padding:12px 14px;border:1px solid rgba(158,106,174,.2);border-radius:8px;background:#fdfafd;font-size:14px}.aco-review-size span{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9e6aae}.aco-review-size strong{color:#2c2330;font-size:16px}.aco-btn:focus-visible,.aco-close:focus-visible,.aco-card:focus-visible,.aco-show-product:focus-visible,.aco-size-btn:focus-visible,.aco-chart-toggle:focus-visible{outline:3px solid rgba(158,106,174,.3);outline-offset:2px}
    @media(max-width:720px){.aco-top{height:58px;flex-basis:58px;padding:0 14px;position:relative}.aco-brand{font-size:18px}.aco-progress{display:flex;position:absolute;left:50%;transform:translateX(-50%);gap:5px}.aco-dot{width:22px;height:6px}.aco-close{width:38px;height:38px;font-size:23px}.aco-page{padding:20px 14px 0}.aco-head{display:block;margin-bottom:18px}.aco-kicker{font-size:11px}.aco-title{margin:4px 0 6px;font-size:30px;line-height:1.12}.aco-sub{font-size:14px;line-height:1.45}.aco-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.aco-card{box-shadow:0 8px 22px rgba(96,56,108,.08)}.aco-card-body{padding:10px}.aco-name{font-size:14px}.aco-price{font-size:13px;margin-bottom:8px}.aco-show-product{min-height:42px;padding:9px 8px;font-size:12px}.aco-duo .aco-img{aspect-ratio:1/1.18}.aco-detail-view{grid-template-columns:1fr;gap:14px}.aco-detail-photos{grid-template-columns:1fr 1fr;gap:7px}.aco-detail-copy{padding:16px}.aco-detail-copy h3{font-size:28px}.aco-detail-actions{display:grid;grid-template-columns:1fr;margin-top:18px}.aco-detail-actions .aco-btn{width:100%}.aco-size-layout{gap:12px}.aco-size-chart-panel,.aco-size-note,.aco-size-picker-panel{padding:14px}.aco-chart-head{align-items:flex-start;flex-direction:column;gap:8px}.aco-size-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.aco-size-btn{min-height:44px;font-size:13px}.aco-review{grid-template-columns:1fr;gap:12px}.aco-panel{padding:14px}.aco-panel h3{margin-bottom:11px;font-size:11px}.aco-review-selections{gap:8px}.aco-review-thumb{aspect-ratio:1/1}.aco-review-choice-copy{padding:9px}.aco-review-choice-copy span{font-size:9px}.aco-review-choice-copy strong{font-size:13px}.aco-order-total{margin-top:14px;padding-top:13px}.aco-order-total strong{font-size:20px}.aco-made-note{font-size:12px}.aco-policy p{font-size:14px;line-height:1.5}.aco-trust{gap:10px;margin-top:15px;padding-top:14px;font-size:12px}.aco-footer{position:sticky;bottom:0;z-index:5;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px 10px;margin:18px -14px 0;padding:11px 14px calc(11px + env(safe-area-inset-bottom));border-top:1px solid rgba(158,106,174,.18);background:rgba(255,255,255,.97);box-shadow:0 -10px 30px rgba(82,52,92,.08);backdrop-filter:blur(14px)}.aco-footer .aco-selection{grid-column:1/-1;order:-1;text-align:center}.aco-footer .aco-btn{min-height:48px;padding:12px 15px}.aco-footer .aco-btn.secondary{min-width:88px}.aco-footer .aco-btn:last-of-type{width:100%}.aco-footer:not(:has(.secondary)) .aco-btn{grid-column:1/-1}.aco-selection{font-size:12px}.aco-review-footer .aco-selection{color:#6f467c}.aco-review-footer .aco-selection:before{content:"\\2713";display:inline-grid;place-items:center;width:17px;height:17px;margin-right:6px;border-radius:50%;background:#ede0f1;font-size:10px}.aco-empty{margin:24px auto;padding:20px}.aco-error{margin-bottom:14px}}
    @media(max-width:480px){.aco-product-grid{grid-template-columns:1fr}.aco-product-grid .aco-duo .aco-img{aspect-ratio:3/4}.aco-fabric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `; }

  window.AnasiyaCustomOrder = { open: openTool, close: closeTool };
  if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, mount); else mount();
}());