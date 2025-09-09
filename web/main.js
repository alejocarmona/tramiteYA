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
  [S.list, S.form, S.status].forEach(x => x.classList.add('hidden'));
  el.classList.remove('hidden');
}

function pesos(n) {
  return new Intl.NumberFormat('es-CO', {
    style:'currency', currency:'COP', maximumFractionDigits:0
  }).format(n || 0);
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
    alert(text || `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : {};
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
  const data = await api(`services?id=${encodeURIComponent(id)}`);
  const svc = data.item;
  currentService = svc;

  S.svcHead.innerHTML = `<div class="title">${svc.name}</div>`;
  const price = svc.price || { base:0, tax:0, fee:0, total:0 };
  S.svcPrice.textContent = `Total: ${pesos(price.total)}`;
  S.priceBreakdown.innerHTML = `
    Base: <strong>${pesos(price.base||0)}</strong> &nbsp;•&nbsp;
    IVA: <strong>${pesos(price.tax||0)}</strong> &nbsp;•&nbsp;
    Servicio: <strong>${pesos(price.fee||0)}</strong> &nbsp;•&nbsp;
    <span class="muted">Total:</span> <strong>${pesos(price.total||0)}</strong>
  `;

  S.formEl.innerHTML = '';
  (svc.fields || []).forEach(f=>{
    const wrap = document.createElement('div');
    wrap.innerHTML = `<label>${f.label}${f.required?' *':''}</label>`;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      (f.options||[]).forEach(op=>{
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
    S.formEl.appendChild(wrap);
  });

  // Ocultamos simulador hasta crear la orden
  S.paySim.classList.add('hidden');
  currentOrder = null;

  // Asegura que el header sea visible en este estado
  lockHeader(false);
  lockNavigation(false);
  disableFormInputs(false);
  if (S.btnCreate) S.btnCreate.disabled = false;

  show(S.form);
}

function formDataToObject(formEl) {
  const o = {};
  [...new FormData(formEl).entries()].forEach(([k,v]) => o[k] = String(v));
  return o;
}

async function createOrder() {
  console.log('entré a createOrder');
  if (creating) return; // anti-doble click

  creating = true;
  setBtnLoading(S.btnCreate, true, "Creando…");
  disableFormInputs(true);
  lockHeader(true);
  lockNavigation(true);

  try {
    const formData = formDataToObject(S.formEl);

    // 1) Crear orden
    console.log('[createOrder] POST /orders…');
    const order = await api('orders', {
      method:'POST',
      body: JSON.stringify({
        service_id: currentService.id,
        contact: { email: 'demo@correo.com', phone: '3001234567' },
        form_data: formData
      })
    });
    console.log('[createOrder] /orders OK', order);
    currentOrder = order; // { id }
    window.__lastOrderId = order.id;

    // Guardar en historial (aún sin pago)
    addHistory({
      id: order.id,
      serviceId: currentService.id,
      serviceName: currentService.name,
      createdAt: Date.now(),
      status: 'pending',
      payment: null,
      delivery: null
    });

    // 2) Inicializar pago (mock)
    console.log('[createOrder] POST /payments_init…');
    await api('payments_init', {
      method:'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    console.log('[createOrder] /payments_init OK');

    // Manejo explícito para modo normal (no DEBUG)
    if (!DEBUG) {
      // No mostramos simulador en modo normal: vamos directo al estado y desbloqueamos UI
      const status = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
      renderStatus(status);
      // desbloqueo de UI
      disableFormInputs(false);
      lockHeader(false);
      lockNavigation(false);
      setBtnLoading(S.btnCreate, false, "", "Crear orden");
      show(S.status);
      return; // salimos de createOrder aquí
    }

    // 3) Mostrar simulador y mantener bloqueo hasta que el usuario elija resultado (solo DEBUG)
    console.log('[createOrder] DEBUG=', DEBUG);
    console.log('[createOrder] paySim exists?', !!S.paySim, S.paySim);
    if (S.paySim) console.log('[createOrder] paySim classList BEFORE:', S.paySim.className);

    if (S.paySim) {
      S.paySim.classList.remove('hidden');
      S.paySim.style.display = 'block';
      const box = S.paySim.querySelector('.paybox');
      if (box) box.classList.add('open');
      console.log('[createOrder] paySim classList AFTER:', S.paySim.className);
      S.paySim.scrollIntoView({behavior:'smooth'});
      console.log('[createOrder] paySim computed display =', getComputedStyle(S.paySim).display);
      console.log('[createOrder] paybox computed display =', box ? getComputedStyle(box).display : '(no .paybox)');
      
      // Bloque solicitado para forzar visibilidad y apertura del simulador
      const sim = document.getElementById('simulator');
      if (sim) {
        sim.style.display = 'block';   // quita el display:none inline
        sim.open = true;               // abre el details
        console.log('[createOrder] simulator forced visible & open');
      } else {
        console.warn('[createOrder] NO #simulator inside #pay-sim');
      }
    } else {
      console.warn('[createOrder] NO hay #pay-sim en el DOM');
    }
    // NO liberamos bloqueo aquí: se libera al confirmar el pago

  } catch (e) {
    alert(e.message || 'Error creando la orden');
    // liberamos bloqueo si falló
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
    alert(e.message || 'Error confirmando pago');
  }
}

function renderStatus(order) {
  // Badge status mapping
  const badge = document.getElementById('badge-status');
  let badgeClass = 'pill warn', badgeText = 'Pago pendiente';
  if (order.payment === 'paid' || order.payment?.status === 'success') {
    badgeClass = 'pill success';
    badgeText = 'Pago aprobado';
  } else if (
    order.payment === 'rejected' ||
    order.payment === 'canceled' ||
    order.payment === 'error' ||
    (order.payment?.status === 'rejected') ||
    (order.payment?.status === 'canceled') ||
    (order.payment?.status === 'error')
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

  // Order ID (short)
  const oid = document.getElementById('order-id');
  if (oid) oid.textContent = order.id ? String(order.id).slice(0, 8) : '—';

  // Service name
  const osvc = document.getElementById('order-service');
  if (osvc) osvc.textContent = currentService?.name || 'Trámite';

  // Order date
  const odate = document.getElementById('order-date');
  const ts = order.createdAt || Date.now();
  if (odate) odate.textContent = new Date(ts).toLocaleString();

  // Payment status (friendly)
  const spay = document.getElementById('status-payment');
  if (spay) spay.textContent = mapPayment(order.payment);

  // Delivery status
  const sdel = document.getElementById('status-delivery');
  if (sdel) sdel.textContent = order.delivery ?? 'Pendiente';

  // Breakdown
  const price = currentService?.price;
  const pbase = document.getElementById('price-base');
  const ptax = document.getElementById('price-tax');
  const pfee = document.getElementById('price-fee');
  const ptotal = document.getElementById('price-total');
  if (price) {
    if (pbase) pbase.textContent = pesos(price.base);
    if (ptax) ptax.textContent = pesos(price.tax);
    if (pfee) pfee.textContent = pesos(price.fee);
    if (ptotal) ptotal.textContent = pesos(price.total);
  } else {
    if (pbase) pbase.textContent = '—';
    if (ptax) ptax.textContent = '—';
    if (pfee) pfee.textContent = '—';
    if (ptotal) ptotal.textContent = '—';
  }

  // Friendly message
  const msg = document.getElementById('friendly-message');
  let friendly = '—';
  if (badgeClass === 'pill success') {
    friendly = 'Tu pago fue aprobado ✅. En breve pondremos tu solicitud en cola y te avisaremos por correo/WhatsApp cuando esté lista.';
  } else if (badgeClass === 'pill warn') {
    friendly = 'Tu pago está pendiente ⏳. Si cerraste esta ventana por error, puedes reintentarlo desde tu historial.';
  } else if (badgeClass === 'pill error') {
    friendly = 'No pudimos procesar el pago ❌. Puedes reintentarlo ahora o elegir otro método.';
  }
  if (msg) msg.textContent = friendly;

  // Debug JSON
  const sjson = document.getElementById('status-json');
  if (sjson) {
    const pretty = JSON.stringify(order, null, 2);
    sjson.innerHTML = `<pre>${pretty}</pre>`;
  }
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

// Verificación de presencia y visibilidad del FAB
document.addEventListener('DOMContentLoaded', () => {
  const fab = document.getElementById('fab-whatsapp');
  if (!fab) { console.warn('[FAB] no encontrado en DOM'); return; }
  const cs = getComputedStyle(fab);
  console.log('[FAB] visible?', fab.offsetParent !== null, { display: cs.display, opacity: cs.opacity, z: cs.zIndex });
});
