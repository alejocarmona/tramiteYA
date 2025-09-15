let __FORM_BASE_HTML = ''; // Declaración global antes de cualquier uso

console.info(`TYA main.js – build ${new Date().toLocaleString()}`);

// =====================
// Config
// =====================
function functionUrl(name) {
  const qp = new URLSearchParams(location.search);
  const ENV = qp.get('env');

  // Override por window.__API_BASE
  if (window.__API_BASE) {
    console.info('API base (override):', window.__API_BASE);
    return `${window.__API_BASE}/${name}`;
  }

  let base;
  if (ENV === 'emulator') {
    base = `http://${location.hostname}:5001/apptramiteya/us-central1`;
  } else if (ENV === 'prod') {
    base = 'https://us-central1-apptramiteya.cloudfunctions.net';
  } else {
    if (
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.port === '5000'
    ) {
      base = `http://${location.hostname}:5001/apptramiteya/us-central1`;
    } else {
      base = 'https://us-central1-apptramiteya.cloudfunctions.net';
    }
  }
  console.info('API base:', base);
  return `${base}/${name}`;
}

// =====================
// Helpers DOM & Currency
// =====================
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const S = {
  list:  $("#screen-list"),
  form:  $("#screen-form"),
  status:$("#screen-status"),

  services: $("#services"),
  empty:    $("#empty"),

  // header
  btnReload: $("#btn-reload"),
  btnHistory: $("#btn-history"),
  btnClearHistory: $("#btn-clear-history"),

  // form
  btnBack:   $("#btn-back"),
  btnCreate: $("#btn-create"),

  // status
  btnRetry:  $("#btn-retry"),

  formEl:   $("#form"),
  svcHead:  $("#svc-head"),
  svcPrice: $("#svc-price"),

  priceBox: $("#price-box"),
  priceBreakdown: $("#price-breakdown"),

  // simulador de pago
  paySim: $("#pay-sim"),

  // estado
  statusPayment: $("#status-payment"),
  statusDelivery: $("#status-delivery"),
  statusJson: $("#status-json"),

  // historial
  historyWrap: $("#history"),
  historyList: $("#history-list"),
};

function show(el) {
  hideBanner();
  [S.list, S.form, S.status].forEach(x => x.classList.add('hidden'));
  el.classList.remove('hidden');
}

function pesos(n) {
  return new Intl.NumberFormat('es-CO', {
    style:'currency', currency:'COP', maximumFractionDigits:0
  }).format(n || 0);
}

// --- evita duplicados del bloque Contacto ---
function ensureSingleContactBlock() {
  const form = document.getElementById('form');
  if (!form) return;
  const blocks = form.querySelectorAll('#contact-block');
  blocks.forEach((b, i) => { if (i > 0) b.remove(); }); // deja solo el primero
}

function mapPayment(payment) {
  if (!payment) return '⏳ Aún no procesado';
  if (typeof payment === 'string') {
    if (payment === 'paid') return '✅ Pago aprobado';
    if (payment === 'rejected') return '❌ Pago rechazado';
    if (payment === 'canceled') return '❌ Pago cancelado';
    if (payment === 'error') return '❌ Error en el pago';
    return payment;
  }
  switch (payment.status) {
    case 'success':      return '✅ Pago aprobado';
    case 'insufficient': return '⚠️ Fondos insuficientes';
    case 'canceled':     return '❌ Pago cancelado';
    case 'error':        return '❌ Error en el pago';
    default:             return payment.status || '—';
  }
}

// =====================
// API Wrapper
// =====================
async function api(path, opts={}) {
  const url = functionUrl(path);
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type':'application/json', ...(opts.headers || {}) },
    body: opts.body
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('API error', { url, status: res.status, text });
    showBanner(text || `Error HTTP ${res.status}`, 'error', true); // persistente en errores de red/backend
    throw new Error(text || `HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : {};
}

function showBanner(message, type = 'error', persist = false) {
  const el = document.getElementById('banner');
  const txt = document.getElementById('banner-text');
  if (!el || !txt) return;
  txt.textContent = String(message || 'Ocurrió un error');
  el.className = 'banner'; // reset
  el.classList.add(type === 'warn' ? 'is-warn' : type === 'info' ? 'is-info' : 'is-error');
  el.classList.remove('hidden');

  // Auto-ocultar solo si NO es persistente
  if (!persist) {
    clearTimeout(window.__bannerTimer);
    window.__bannerTimer = setTimeout(() => {
      el.classList.add('hidden');
    }, 4000);
  }
}

function hideBanner() {
  const el = document.getElementById('banner');
  if (el) el.classList.add('hidden');
}

// =====================
// Local history (localStorage)
// =====================
const LS_KEY = 'tya_orders';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, 50)));
}
function addHistory(entry) {
  const arr = loadHistory();
  arr.unshift(entry);
  saveHistory(arr);
  renderHistory();
}
function updateHistoryStatus(id, changes) {
  const arr = loadHistory();
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr[i] = { ...arr[i], ...changes };
  saveHistory(arr);
  renderHistory();
}
async function refreshHistoryStatus(id) {
  try {
    const st = await api(`orders?id=${encodeURIComponent(id)}`);
    updateHistoryStatus(id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
  } catch { /* noop */ }
}
function renderHistory() {
  const items = loadHistory();
  if (!items.length) {
    S.historyList.innerHTML = `<div class="muted">Aún no tienes solicitudes en este dispositivo.</div>`;
    return;
  }
  S.historyList.innerHTML = items.map(o => `
    <div class="h-item">
      <div class="h-head">
        <div><strong>${o.serviceName || 'Trámite'}</strong></div>
        <div class="muted">${new Date(o.createdAt || Date.now()).toLocaleString()}</div>
      </div>
      <div class="h-foot">
        <div class="muted">Pago: ${mapPayment(o.payment)}</div>
        <div class="muted">Estado: ${o.status || '—'}</div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn ghost" data-h-reload="${o.id}">Revisar estado</button>
        <button class="btn" data-h-open="${o.id}">Ver detalle</button>
      </div>
    </div>
  `).join('');

  $$(`#history-list [data-h-reload]`).forEach(btn=>{
    btn.onclick = () => refreshHistoryStatus(btn.dataset.hReload);
  });
  $$(`#history-list [data-h-open]`).forEach(btn=>{
    btn.onclick = async () => {
      const st = await api(`orders?id=${encodeURIComponent(btn.dataset.hOpen)}`);
      try {
        const items = loadHistory();
        const h = items.find(x => x.id === btn.dataset.hOpen);
        if (h && h.contact && !st.contact) st.contact = h.contact;
      } catch {}
      renderStatus(st);
      show(S.status);
    };
  });
}

// =====================
// Utilidades UI solicitadas
// =====================

// 1. setBtnLoading
function setBtnLoading(btn, loading, textLoading = "Creando…", textIdle = "Crear orden") {
  if (!btn) return;
  if (loading) {
    btn.dataset._text = btn.textContent;
    btn.textContent = textLoading;
    btn.disabled = true;
    btn.classList.add('is-loading');
  } else {
    btn.textContent = textIdle || btn.dataset._text || btn.textContent;
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

// 2. disableFormInputs
function disableFormInputs(disabled) {
  document.querySelectorAll('#form input, #form select').forEach(el => {
    el.disabled = disabled;
  });
}

// 3. lockHeader
function lockHeader(disabled) {
  ['#btn-reload', '#btn-history', '#btn-clear-history'].forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.disabled = disabled;
  });
}

// 4. lockNavigation
function lockNavigation(disabled) {
  ['#btn-back', '#btn-retry'].forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.disabled = disabled;
  });
}

// Des/activa bloqueo global en el formulario (cuando está el simulador)
function lockUIForPayment(active) {
  lockHeader(active);
  disableFormInputs(active);
  lockNavigation(active);
  if (S.btnCreate) S.btnCreate.disabled = active;
}


// Evita que se duplique el bloque de Contacto dentro del <form id="form">
function dedupeContactBlock() {
  try {
    const form = document.getElementById('form');
    if (!form) return;
    const blocks = form.querySelectorAll('#contact-block'); // pueden existir duplicados aunque sea un id
    for (let i = 1; i < blocks.length; i++) {
      blocks[i].remove(); // conserva solo el primero
    }
  } catch (e) {
    console.warn('dedupeContactBlock:', e);
  }
}



// =====================
// Screens
// =====================
let currentService = null;
let currentOrder   = null;
let creating       = false;

async function loadServices() {
  S.services.innerHTML = '';
  S.empty.classList.add('hidden');

  const data = await api('services');
  if (!data.items || !data.items.length) {
    S.empty.classList.remove('hidden');
    return;
  }

  S.services.innerHTML = '';
  data.items.forEach(svc=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">${svc.name}</div>
      <div class="muted">Entrega aprox: ${svc.sla_hours || 24} h • Canales: ${(svc.deliver_channels||[]).join(', ') || 'email'}</div>
      <div class="row" style="margin-top:8px">
        <div class="price">${pesos((svc.price?.total)||0)}</div>
        <button class="btn">Solicitar</button>
      </div>
    `;
    card.querySelector('button').onclick = () => openForm(svc.id);
    S.services.appendChild(card);
  });
}

async function openForm(id) {
  // blindaje anti-duplicados de Contacto
  ensureSingleContactBlock();

  // 1) Restaura el formulario a su estado base (evita acumulación de bloques)
  if (S.formEl && __FORM_BASE_HTML) {
    S.formEl.innerHTML = __FORM_BASE_HTML;
  }

  // 2) (Opcional) Redundancia defensiva por si algo más inyecta Contacto
  (function dedupeContactBlock(){
    const form = document.getElementById('form');
    if (!form) return;
    const blocks = form.querySelectorAll('#contact-block');
    for (let i = 1; i < blocks.length; i++) blocks[i].remove();
  })();
  
  // --- GUARD: asegura que el form tenga #contact-block y #dyn-fields
  const form = S.formEl;
  if (!form) return;

  // Si no existe el bloque de contacto (por haber sido limpiado), lo reinyectamos
  if (!document.getElementById('contact-block')) {
    form.insertAdjacentHTML('afterbegin', `
      <div class="section-block">
        <div class="form-section-title"><span class="section-ico">👤</span>Contacto</div>
        <div class="section-content">
          <p class="form-section-help" style="margin:4px 0 8px">Usaremos estos datos para entregarte tu certificado.</p><p></p>

          <label for="contact_name">Nombre completo *</label>
          <input name="contact_name" id="contact_name" type="text" autocomplete="name" required>

          <label for="contact_email">Correo *</label>
          <input name="contact_email" id="contact_email" type="email" autocomplete="email" required>

          <label for="contact_phone">Celular *</label>
          <input name="contact_phone" id="contact_phone" type="tel" inputmode="tel" pattern="^[0-9 +()-]{7,}$" required>
        </div>
      </div>
    `);
  }

  // === Snapshot del HTML base del formulario (para restaurarlo en cada openForm) ===
document.addEventListener('DOMContentLoaded', () => {
  const f = document.getElementById('form');
  if (f) {
    __FORM_BASE_HTML = f.innerHTML; // debe incluir #contact-block y #dyn-fields
  }

  // Observa el <form> y deduplica si alguien inyecta Contacto
  const formForObserver = document.getElementById('form');
  if (formForObserver) {
    ensureSingleContactBlock(); // primera pasada
    const obs = new MutationObserver(() => ensureSingleContactBlock());
    obs.observe(formForObserver, { childList: true, subtree: true });
  }
});

  // Asegura el contenedor para los campos del trámite
  let dyn = document.getElementById('dyn-fields');
  if (!dyn) {
    dyn = document.createElement('div');
    dyn.id = 'dyn-fields';
    form.appendChild(dyn);
  } else {
    dyn.innerHTML = ''; // limpia SOLO los campos dinámicos
  }

  // --- desde aquí continúa tu lógica actual de openForm ---
  const data = await api(`services?id=${encodeURIComponent(id)}`);
  const svc = data.item;
  currentService = svc;

  S.svcHead.innerHTML = `<div class="title">${svc.name}</div>`;
  const price = svc.price || { base:0, tax:0, fee:0, total:0 };
  const fpb = document.getElementById('form-price-base');
  const fpt = document.getElementById('form-price-tax');
  const fpf = document.getElementById('form-price-fee');
  const fptot = document.getElementById('form-price-total');
  if (fpb)  fpb.textContent  = pesos(price.base||0);
  if (fpt)  fpt.textContent  = pesos(price.tax||0);
  if (fpf)  fpf.textContent  = pesos(price.fee||0);
  if (fptot)fptot.textContent= pesos(price.total||0);

  // pinta los campos del trámite dentro de #dyn-fields
  (svc.fields || []).forEach(f => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<label>${f.label}${f.required ? ' *' : ''}</label>`;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      (f.options || []).forEach(op => {
        const o = document.createElement('option');
        o.value = op; o.textContent = op;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.pattern) input.pattern = f.pattern;
    }
    input.name = f.id;
    input.required = !!f.required;
    wrap.appendChild(input);
    dyn.appendChild(wrap);
  });

  // precarga contacto guardado (si existe)
  const c = loadContact();
  if (c.name)  form.querySelector('[name="contact_name"]').value  = c.name;
  if (c.email) form.querySelector('[name="contact_email"]').value = c.email;
  if (c.phone) form.querySelector('[name="contact_phone"]').value = c.phone;

  S.paySim.classList.add('hidden');
  currentOrder = null;

  lockHeader(false);
  lockNavigation(false);
  disableFormInputs(false);
  if (S.btnCreate) S.btnCreate.disabled = false;

  // Limpia posibles duplicados si algún paso volvió a inyectar Contacto
  dedupeContactBlock();
  show(S.form);
}

const LS_CONTACT = 'tya_contact';
function loadContact(){ try{return JSON.parse(localStorage.getItem(LS_CONTACT)||'{}')}catch{return{}} }
function saveContact(c){ localStorage.setItem(LS_CONTACT, JSON.stringify(c||{})); }

function formDataToObject(formEl) {
  const o = {};
  [...new FormData(formEl).entries()].forEach(([k,v]) => o[k] = String(v));
  return o;
}

async function createOrder() {
  console.log('entré a createOrder');
  if (creating) return; // anti-doble click

  // 1) Validación nativa del formulario (HTML5)
  const form = S.formEl;
  if (!form.checkValidity()) {
    form.reportValidity(); // muestra el tooltip exacto del campo
    return;
  }

  // 2) Lee datos (ya validados) desde el formulario
  const data = formDataToObject(form);
  const contact = {
    name:  (data.contact_name || '').trim(),
    email: (data.contact_email || '').trim(),
    phone: (data.contact_phone || '').trim(),
  };
  // Guarda contacto para precargar después
  saveContact(contact);

  // 3) Ahora sí bloqueamos UI y ponemos “Creando…”
  creating = true;
  setBtnLoading(S.btnCreate, true, "Creando…");
  disableFormInputs(true);
  lockHeader(true);
  lockNavigation(true);

  // Validación extra: contacto
  const emailOk = /^\S+@\S+\.\S+$/.test(contact.email);
  if (!contact.name || !contact.email || !contact.phone || !emailOk) {
    showBanner('Completa tus datos de contacto (correo válido requerido).', 'warn');
    setBtnLoading(S.btnCreate, false, "", "Crear orden");
    disableFormInputs(false);
    lockHeader(false);
    lockNavigation(false);
    creating = false;
    return;
  }

  try {
    console.log('[createOrder] POST /orders…');
    const order = await api('orders', {
      method:'POST',
      body: JSON.stringify({
        service_id: currentService.id,
        contact,
        form_data: data
      })
    });
    console.log('[createOrder] /orders OK', order);
    currentOrder = order;
    window.__lastOrderId = order.id;

    addHistory({
      id: order.id,
      serviceId: currentService.id,
      serviceName: currentService.name,
      createdAt: Date.now(),
      status: 'pending',
      payment: null,
      delivery: null,
      contact
    });

    console.log('[createOrder] POST /payments_init…');
    await api('payments_init', {
      method:'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    console.log('[createOrder] /payments_init OK');

    if (!DEBUG) {
      const status = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
      renderStatus(status);
      disableFormInputs(false);
      lockHeader(false);
      lockNavigation(false);
      setBtnLoading(S.btnCreate, false, "", "Crear orden");
      show(S.status);
      return;
    }

    if (S.paySim) {
      S.paySim.classList.remove('hidden');
      S.paySim.style.display = 'block';
      const sim = document.getElementById('simulator');
      if (sim) { sim.style.display = 'block'; sim.open = true; }
    }
  } catch (e) {
    showBanner(e?.message || 'No pudimos crear tu orden. Intenta más tarde o contáctanos por WhatsApp.', 'error', true);
    disableFormInputs(false);
    lockHeader(false);
    lockNavigation(false);
    setBtnLoading(S.btnCreate, false, "", "Crear orden");
  } finally {
    creating = false;
  }
}


// Simulador → confirma pago mock y actualiza UI + historial
async function confirmPayment(scenario) {
  if (!currentOrder?.id) return;

  try {
    await api('payments_confirm', {
      method:'POST',
      body: JSON.stringify({ orderId: currentOrder.id, scenario })
    });

    const status = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
    renderStatus(status);
    updateHistoryStatus(currentOrder.id, { status: status.status, payment: status.payment, delivery: status.delivery ?? null });

    // cerramos simulador y desbloqueamos UI
    S.paySim.classList.add('hidden');
    setBtnLoading(S.btnCreate, false, "Crear orden");
    disableFormInputs(false);
    lockHeader(false);
    lockNavigation(false);

    show(S.status);
  } catch (e) {
    showBanner(e?.message || 'No pudimos confirmar el pago en este momento.', 'error');
  }
}

// ==== Confetti helpers (mínimo) ====
function prefersReducedMotion(){
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function normalizePayment(p){
  if (!p) return 'pending';
  if (typeof p === 'string') return p; // 'paid' | 'rejected' | 'canceled' | 'error'
  // objeto { status: 'success' | 'insufficient' | 'canceled' | 'error' }
  switch (p.status){
    case 'success':      return 'paid';
    case 'insufficient': return 'rejected';
    case 'canceled':     return 'canceled';
    case 'error':        return 'error';
    default:             return 'pending';
  }
}

const LOG = (...a)=>console.log('[CONFETTI]', ...a);
window.__confettiShown = window.__confettiShown || new Set();

function triggerConfetti(orderId){
  if (prefersReducedMotion()) { LOG('reduced motion: skip'); return; }
  if (!orderId) { LOG('missing orderId'); return; }
  if (window.__confettiShown.has(orderId)) { LOG('already shown for', orderId); return; }

  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('role','presentation');
  document.body.appendChild(layer);

  const colors = ['#10b981','#0ea5e9','#f59e0b','#ef4444','#6366f1','#14b8a6'];
  const N = 16;
  for (let i=0;i<N;i++){
    const d = document.createElement('div');
    d.className = 'confetti__piece';
    d.style.left = (Math.random()*100)+'%';
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = (Math.random()*0.3)+'s';
    layer.appendChild(d);
  }

  window.__confettiShown.add(orderId);
  LOG('START for', orderId);

  setTimeout(()=>{
    layer.remove();
    LOG('END for', orderId);
  }, 1200);
}

// Hook para probar manualmente desde consola
window.__confettiTest = function(){
  const id = 'TEST-'+Date.now();
  triggerConfetti(id);
  return id;
};

document.addEventListener('DOMContentLoaded', ()=>{
  LOG('ready. reducedMotion=', prefersReducedMotion());
});



function humanPaymentLabel(payment) {
  // acepta string o objeto {status:...}
  const p = typeof payment === 'string' ? payment : (payment?.status || '');
  if (p === 'paid' || p === 'success') return '✅ Pago aprobado';
  if (p === 'rejected' || p === 'insufficient') return '❌ Pago rechazado';
  if (p === 'canceled') return '❌ Pago cancelado';
  if (p === 'error') return '❌ Error en el pago';
  return '⏳ Aún no procesado';
}

function friendlyMessageFor(order) {
  // order.payment puede ser string o {status}
  const p = typeof order.payment === 'string' ? order.payment : (order.payment?.status || null);

  if (p === 'paid' || p === 'success') {
    return 'Tu pago fue aprobado ✅. En breve pondremos tu solicitud en cola y te avisaremos por correo/WhatsApp cuando esté lista.';
  }
  if (p === 'rejected' || p === 'insufficient') {
    return 'No pudimos procesar el pago ❌. Puedes reintentarlo ahora o elegir otro método desde tu historial.';
  }
  if (p === 'canceled') {
    return 'Cancelaste el pago ❌. Puedes retomarlo cuando quieras desde tu historial.';
  }
  if (p === 'error') {
    return 'Tuvimos un inconveniente técnico ⚠️. Intenta nuevamente en unos minutos o contáctanos por WhatsApp.';
  }
  // pending / null / desconocido
  return 'Tu pago está pendiente ⏳. Si cerraste esta ventana por error, puedes reintentarlo desde tu historial.';
}




function renderStatus(order) {
  // --- Badge status mapping (igual a tu lógica) ---
  const badge = document.getElementById('badge-status');
  let badgeClass = 'pill warn', badgeText = 'Pago pendiente';
  if (order.payment === 'paid' || order.payment?.status === 'success') {
    badgeClass = 'pill success';
    badgeText = 'Pago aprobado';
  } else if (
    order.payment === 'rejected' ||
    order.payment === 'canceled' ||
    order.payment === 'error' ||
    order.payment?.status === 'rejected' ||
    order.payment?.status === 'canceled' ||
    order.payment?.status === 'error'
  ) {
    badgeClass = 'pill error';
    badgeText = 'Pago no aprobado';
  } else if (!order.payment || order.payment === 'pending' || order.payment?.status === 'pending') {
    badgeClass = 'pill warn';
    badgeText = 'Pago pendiente';
  }
  if (badge) {
    badge.className = badgeClass;
    badge.textContent = badgeText;
  }

  // --- Order ID (short) ---
  const oid = document.getElementById('order-id');
  if (oid) oid.textContent = order.id ? String(order.id).slice(0, 8) : '—';

  // --- Service name: prioriza lo que venga con la orden ---
  const osvc = document.getElementById('order-service');
  if (osvc) osvc.textContent = order.serviceName || order.service || currentService?.name || 'Trámite';

  // --- Order date ---
  const odate = document.getElementById('order-date');
  const ts = order.createdAt || Date.now();
  if (odate) odate.textContent = new Date(ts).toLocaleString();

  // --- Payment status (friendly) ---
  const spay = document.getElementById('status-payment');
  if (spay) spay.textContent = mapPayment(order.payment);

  // --- Delivery status ---
  const sdel = document.getElementById('status-delivery');
  if (sdel) sdel.textContent = order.delivery ?? 'Pendiente';

  // --- Breakdown: usa snapshot de la orden si existe ---
  // Preferencias: order.priceSnapshot -> order.price -> currentService.price
  const snapPrice = order.priceSnapshot || order.price || currentService?.price || null;
  const pbase = document.getElementById('price-base');
  const ptax  = document.getElementById('price-tax');
  const pfee  = document.getElementById('price-fee');
  const ptotal= document.getElementById('price-total');
  if (snapPrice) {
    if (pbase) pbase.textContent  = pesos(snapPrice.base ?? 0);
    if (ptax)  ptax.textContent   = pesos(snapPrice.tax  ?? 0);
    if (pfee)  pfee.textContent   = pesos(snapPrice.fee  ?? 0);
    if (ptotal)ptotal.textContent = pesos(snapPrice.total?? 0);
  } else {
    if (pbase)  pbase.textContent  = '—';
    if (ptax)   ptax.textContent   = '—';
    if (pfee)   pfee.textContent   = '—';
    if (ptotal) ptotal.textContent = '—';
  }

  // --- Friendly message (con tu mapping de badgeClass) ---
  const msg = document.getElementById('friendly-message');
  let friendly = '—';
  if (badgeClass === 'pill success') {
    friendly = 'Tu pago fue aprobado ✅. En breve pondremos tu solicitud en cola y te avisaremos por correo/WhatsApp cuando esté lista.';
  } else if (badgeClass === 'pill warn') {
    friendly = 'Tu pago está pendiente ⏳. Si cerraste esta ventana, puedes reintentarlo desde tu historial.';
  } else if (badgeClass === 'pill error') {
    friendly = 'No pudimos procesar el pago ❌. Puedes reintentarlo ahora o elegir otro método.';
  }
  if (msg) msg.textContent = friendly;

  // --- Debug JSON ---
  const sjson = document.getElementById('status-json');
  if (sjson) {
    const pretty = JSON.stringify(order, null, 2);
    sjson.innerHTML = `<pre>${pretty}</pre>`;
  }

  // --- Confetti: **una sola** invocación, con dedupe por orden ---
  const pnorm = normalizePayment(order.payment); // asume que ya tienes esta helper
  LOG('renderStatus', { id: order.id, pnorm });
  if (pnorm === 'paid' && order.id) {
    if (!window.__confettiShown) window.__confettiShown = new Set();
    if (!window.__confettiShown.has(order.id)) {
      triggerConfetti(order.id);
      window.__confettiShown.add(order.id);
    }
  }

  // fallback: if no order.contact, try to fetch it from local history by id
  if (!order.contact && order.id) {
    try {
      const items = loadHistory();
      const h = items.find(x => x.id === order.id);
      if (h?.contact) order.contact = h.contact;
    } catch {}
  }
  // Contacto
  const contactEl = document.getElementById('order-contact');
  let contactText = '—';
  if (order.contact) {
    if (order.contact.email && order.contact.phone) {
      contactText = `${order.contact.email} / ${order.contact.phone}`;
    } else if (order.contact.email) {
      contactText = order.contact.email;
    } else if (order.contact.phone) {
      contactText = order.contact.phone;
    }
  }
  if (contactEl) contactEl.textContent = contactText;

  // === Hero ===
  updateHero(order);
}

// Normaliza el estado de pago a: 'paid' | 'rejected' | 'canceled' | 'error' | 'pending'
function paymentState(order) {
  const p = order?.payment;
  if (!p) return 'pending';
  if (typeof p === 'string') return p; // 'paid', 'rejected', 'canceled', 'error', 'pending'
  switch (p.status) {
    case 'success':      return 'paid';
    case 'insufficient': return 'rejected';
    case 'canceled':     return 'canceled';
    case 'error':        return 'error';
    default:             return 'pending';
  }
}

// Actualiza el hero usando SIEMPRE el 'order' recibido
function updateHero(order) {
  const hero = document.getElementById('status-hero');
  if (!hero) return;

  const heroIcon  = document.getElementById('hero-ico');
  const heroTitle = document.getElementById('hero-title');
  const heroSub   = document.getElementById('hero-sub');
  const heroDate  = document.getElementById('hero-date');

  hero.classList.remove('is-success', 'is-error', 'is-pending');

  const p = paymentState(order);
  if (p === 'paid') {
    hero.classList.add('is-success');
    if (heroIcon)  heroIcon.textContent  = '✅';
    if (heroTitle) heroTitle.textContent = '¡Pago aprobado!';
    if (heroSub)   heroSub.textContent   = 'Tu pago fue procesado con éxito. Te avisaremos por correo/WhatsApp cuando tu certificado esté listo.';
  } else if (p === 'rejected' || p === 'canceled' || p === 'error') {
    hero.classList.add('is-error');
    if (heroIcon)  heroIcon.textContent  = '❌';
    if (heroTitle) heroTitle.textContent = 'Pago rechazado';
    if (heroSub)   heroSub.textContent   = 'No pudimos procesar el pago. Puedes reintentarlo más tarde o elegir otro método.';
  } else {
    hero.classList.add('is-pending');
    if (heroIcon)  heroIcon.textContent  = '⏳';
    if (heroTitle) heroTitle.textContent = 'Pago pendiente';
    if (heroSub)   heroSub.textContent   = 'Tu pago está pendiente. Si cerraste esta ventana, puedes reintentarlo desde tu historial.';
  }

  const d = new Date(order.createdAt || order.created || Date.now());
  if (heroDate) heroDate.textContent = d.toLocaleString('es-CO');
}

// =====================
// Events
// =====================
S.btnReload.onclick = () => { loadServices(); };
S.btnHistory.onclick = () => { S.historyWrap.scrollIntoView({behavior:'smooth'}); };
S.btnClearHistory.onclick = () => { localStorage.removeItem(LS_KEY); renderHistory(); };

S.btnBack.onclick = () => show(S.list);
S.btnRetry.onclick = () => { show(S.list); loadServices(); };

S.btnCreate.onclick = (e) => { 
  console.log('click crear orden');
  e.preventDefault(); 
  createOrder().catch(err=>alert(err.message)); 
};

// simulador
document.getElementById('pay-sim')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-sim]');
  if (!btn) return;
  const scenario = btn.dataset.sim;
  confirmPayment(scenario).catch(err=>alert(err.message));
});

// =====================
// Init
// =====================
renderHistory();
loadServices();

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
if (!DEBUG && S.paySim) {
  // Si no es modo debug, elimina el simulador
  S.paySim.remove();
} else if (DEBUG && S.paySim) {
  // Si es modo debug, mantén el simulador oculto por defecto
  S.paySim.classList.add('hidden');
}

window.__confettiShown = window.__confettiShown || new Set();

function triggerConfetti(orderId){
  if (prefersReducedMotion()){ LOG('reduced motion: skip'); return; }
  if (!orderId){ LOG('missing orderId'); return; }
  if (window.__confettiShown.has(orderId)){ LOG('already shown for', orderId); return; }

  // create container
  let layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('role','presentation');
  document.body.appendChild(layer);

  // pieces
  const colors = ['#10b981','#0ea5e9','#f59e0b','#ef4444','#6366f1','#14b8a6'];
  const N = 16;
  for (let i=0;i<N;i++){
    const d = document.createElement('div');
    d.className = 'confetti__piece';
    d.style.left = (Math.random()*100)+'%';
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = (Math.random()*0.3)+'s';
    d.style.transform = 'translateY(-20vh) rotate(0deg)';
    layer.appendChild(d);
  }

  window.__confettiShown.add(orderId);
  LOG('START for', orderId);

  // cleanup
  setTimeout(()=>{
    if (layer && layer.parentNode){ layer.parentNode.removeChild(layer); }
    LOG('END for', orderId);
  }, 1200);
}

// debug hook to force confetti manually from console
window.__confettiTest = function(){
  const id = 'TEST-'+Date.now();
  triggerConfetti(id);
  return id;
}


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const sel = btn.getAttribute('data-copy');
  const el = document.querySelector(sel);
  if (!el) return;

  try {
    await navigator.clipboard.writeText(el.innerText.trim());
    const oldTitle = btn.title;
    const oldSrc = btn.src;
    btn.title = 'Copiado ✔';
    btn.src = 'img/copiar.png'; // necesitas un ícono de check pequeño (o reusar el verde de Pago aprobado)
    setTimeout(() => {
      btn.title = oldTitle;
      btn.src = oldSrc;
    }, 2000);
  } catch {
    btn.title = 'Error';
  }
});
// debug hook to force confetti manually from console
window.__confettiTest = function(){
  const id = 'TEST-'+Date.now();
  triggerConfetti(id);
  return id;
}


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const sel = btn.getAttribute('data-copy');
  const el = document.querySelector(sel);
  if (!el) return;

  try {
    await navigator.clipboard.writeText(el.innerText.trim());
    const oldTitle = btn.title;
    const oldSrc = btn.src;
    btn.title = 'Copiado ✔';
    btn.src = 'img/copiar.png'; // necesitas un ícono de check pequeño (o reusar el verde de Pago aprobado)
    setTimeout(() => {
      btn.title = oldTitle;
      btn.src = oldSrc;
    }, 2000);
  } catch {
    btn.title = 'Error';
  }
});
