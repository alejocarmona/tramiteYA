let __FORM_BASE_HTML = ''; // Declaración global antes de cualquier uso
console.info(`TYA main.js – build ${new Date().toLocaleString()}`);

// Flag único de debug (evita divergencias)
const QS = new URLSearchParams(location.search);
const IS_DEBUG = QS.get('debug') === '1';

/* -------------------------------------------------
   Capacitor: detección y helpers nativos
--------------------------------------------------*/
const IS_CAPACITOR = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Importa plugins de Capacitor si estamos en nativo
let CapApp     = null;
let CapStatusBar = null;
if (IS_CAPACITOR) {
  try {
    CapApp       = window.Capacitor.Plugins.App;
    CapStatusBar = window.Capacitor.Plugins.StatusBar;
    // Configurar StatusBar
    if (CapStatusBar) {
      CapStatusBar.setBackgroundColor({ color: '#0EA5E9' });
      CapStatusBar.setStyle({ style: 'LIGHT' });
    }
  } catch (e) { console.warn('Capacitor plugins init:', e); }

/* --------------------------------------------------
   Wompi Widget: lazy loader + wrapper
-------------------------------------------------- */
let _wompiReady = false, _wompiLoading = null;
function loadWompiWidget() {
  if (_wompiReady) return Promise.resolve();
  if (_wompiLoading) return _wompiLoading;
  _wompiLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.wompi.co/widget.js';
    s.onload = () => { _wompiReady = true; resolve(); };
    s.onerror = () => { _wompiLoading = null; reject(new Error('Wompi widget.js failed to load')); };
    document.head.appendChild(s);
  });
  return _wompiLoading;
}

// Referencia activa del pago en curso (para resolver desde appStateChange)
let _activePaymentRef = null;
let _resolveWidgetExternally = null;

// Persistencia de pago activo en localStorage (sobrevive force-close)
const LS_PENDING_PAY = 'tya_pending_payment';
function savePendingPayment(ref, orderId) {
  try { localStorage.setItem(LS_PENDING_PAY, JSON.stringify({ reference: ref, orderId, ts: Date.now() })); } catch {}
}
function clearPendingPayment() {
  try { localStorage.removeItem(LS_PENDING_PAY); } catch {}
}
function loadPendingPayment() {
  try {
    const raw = localStorage.getItem(LS_PENDING_PAY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expirar después de 30 minutos
    if (Date.now() - (data.ts || 0) > 30 * 60 * 1000) { clearPendingPayment(); return null; }
    return data;
  } catch { return null; }
}

function openWompiWidget(params, redirectUrl) {
  _activePaymentRef = params.reference;
  return new Promise((resolve, reject) => {
    const widgetOpts = {
      currency:              params.currency,
      amountInCents:         params.amountInCents,
      reference:             params.reference,
      publicKey:             params.publicKey,
      'signature:integrity': params.signature,
    };
    if (redirectUrl) widgetOpts.redirectUrl = redirectUrl;
    const checkout = new WidgetCheckout(widgetOpts);

    let done = false;

    function finish() { clearInterval(poll); clearTimeout(timer); _activePaymentRef = null; _resolveWidgetExternally = null; }

    // Permitir resolver desde fuera (cuando la app vuelve del navegador PSE)
    _resolveWidgetExternally = (result) => {
      if (done) return;
      done = true;
      finish();
      resolve(result);
    };

    checkout.open(function (result) {
      if (done) return;
      done = true;
      finish();
      resolve({
        transactionId: result.transaction.id,
        status:        result.transaction.status,
        reference:     result.transaction.reference,
      });
    });

    // Detectar cierre del widget sin completar pago (no hay evento nativo).
    let widgetAppeared = false;
    const poll = setInterval(() => {
      if (done) { finish(); return; }
      const frame = document.querySelector('iframe[src*="wompi"]')
                 || document.querySelector('.waybox-modal')
                 || document.querySelector('[class*="waybox"]');
      if (frame) {
        widgetAppeared = true;
      } else if (widgetAppeared) {
        done = true;
        finish();
        reject(new Error('Widget cerrado sin completar pago'));
      }
    }, 500);

    // Timeout de seguridad: 5 minutos
    const timer = setTimeout(() => {
      if (!done) { done = true; finish(); reject(new Error('Widget timeout')); }
    }, 300000);
  });
}

  if (CapApp) {
    // Escuchar cuando la app vuelve al frente (por si el usuario completa pago en Widget)
    CapApp.addListener('appStateChange', async (state) => {
      if (!state.isActive) return;
      console.log('[Capacitor] app resumed, activePaymentRef:', _activePaymentRef, 'lastOrderId:', window.__lastOrderId);

      // Si hay un pago de widget pendiente (usuario volvió del navegador PSE)
      if (_activePaymentRef && _resolveWidgetExternally) {
        try {
          const confirmResult = await api(`payments_confirm?reference=${encodeURIComponent(_activePaymentRef)}`);
          console.log('[Capacitor] confirm on resume:', confirmResult);
          _resolveWidgetExternally({
            transactionId: confirmResult?.transactionId || null,
            status:        confirmResult?.payment || 'pending',
            reference:     _activePaymentRef,
          });
        } catch (e) {
          console.warn('[Capacitor] confirm on resume failed:', e);
          _resolveWidgetExternally({
            transactionId: null,
            status:        'pending',
            reference:     _activePaymentRef,
          });
        }
        return;
      }

      // Refresh normal (sin widget activo)
      if (window.__lastOrderId && typeof refreshOrderById === 'function') {
        refreshOrderById(window.__lastOrderId);
      }
    });
    // Back button hardware (complementa el handler nativo en MainActivity.java)
    CapApp.addListener('backButton', () => {
      const onList = S.list && !S.list.classList.contains('hidden');
      if (onList) {
        CapApp.minimizeApp();
      } else {
        cleanOrderUrl();
        show(S.list);
      }
    });
  }
  console.info('[Capacitor] Modo nativo activo');
}

/* -------------------------------------------------
   Confetti CSS auto-inject (por si falta en index)
--------------------------------------------------*/
(function ensureConfettiCSS(){
  if (document.getElementById('confetti-css')) return;
  const css = `
  .confetti{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999}
  .confetti__piece{position:absolute;top:-10vh;width:10px;height:16px;animation:confetti-fall 1.2s ease-out forwards;will-change:transform,opacity}
  @keyframes confetti-fall{to{transform:translateY(110vh) rotate(540deg);opacity:.9}}
  `;
  const style = document.createElement('style');
  style.id = 'confetti-css';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ...existing code...
const NOTIFY_WEBHOOK = "https://hooks.zapier.com/hooks/catch/25211343/ui7n435/";

// Puedes conservar NOTIFY_WEBHOOK para pruebas manuales, pero usa el endpoint del backend:
async function notifyTeam(payload) {
  const appBase = location.origin + location.pathname;
  const appLink = `${appBase}?open=${encodeURIComponent(payload.orderId || '')}`;
  const body = {
    app: { env: (new URLSearchParams(location.search).get('env') || 'prod') },
    appLink,
    ...payload
  };

  // Misma-origen → no hay CORS ni preflight
  await fetch('/notify', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
}
// ...existing code...

// NUEVO: notifica una sola vez si pago aprobado y estado encolado/entregado
function maybeNotifyPaid(order) {
  try {
    if (!order || !order.id) return;
    const KEY = "tya_mail_paid_notified";
    const seen = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
    if (seen.has(order.id)) return;

    const pay = normalizePayment(order.payment);         // 'paid'|'pending'|'rejected'...
    const st  = (typeof normalizeOrderStatus === 'function')
      ? normalizeOrderStatus(order.status)
      : String(order.status || '').toLowerCase();

    if (pay === 'paid' && (st === 'queued' || st === 'delivered')) {
      notifyTeam({
        type: "order_paid",
        orderId: order.id,
        serviceName: order.serviceName || "",
        contact: order.contact || {},
        price: order.price || order.price_breakdown || {}
      }).catch(e=>console.warn('[notifyTeam]', e));
      seen.add(order.id);
      localStorage.setItem(KEY, JSON.stringify([...seen].slice(0,100)));
    }
  } catch (e) {
    console.warn('[maybeNotifyPaid]', e);
  }
}

// Limpia los query params de orden de la URL (para que refresh no vuelva al comprobante)
function cleanOrderUrl() {
  const q = new URLSearchParams(location.search);
  q.delete('orderId'); q.delete('id'); q.delete('reference'); q.delete('ref'); q.delete('env');
  const clean = q.toString();
  history.replaceState({}, document.title, `${location.pathname}${clean ? `?${clean}` : ''}${location.hash || ''}`);
}

// Polling: revisa periódicamente si la orden fue entregada (certificado listo)
let _pollTimer = null;
function pollForDelivery(orderId) {
  if (_pollTimer) clearInterval(_pollTimer);
  let attempts = 0;
  const MAX = 10; // 10 × 30s = 5 min
  _pollTimer = setInterval(async () => {
    attempts++;
    try {
      const st = await api(`orders?id=${encodeURIComponent(orderId)}`, { ignore404: true, silent: true });
      if (!st) { clearInterval(_pollTimer); return; }
      renderStatus(st);
      updateHistoryStatus(orderId, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
      if (normalizeOrderStatus(st.status) === 'delivered' || attempts >= MAX) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
    } catch {
      if (attempts >= MAX) { clearInterval(_pollTimer); _pollTimer = null; }
    }
  }, 30000);
}
// ...existing code...



/* =====================
   Config & Init
===================== */
// Config pública (solo whatsappNumber)
let APP_CONFIG = { whatsappNumber: "" };

async function loadConfig() {
  try {
    const PROJECT_ID = 'apptramiteya';
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/public`;
    const res = await fetch(url);
    const data = await res.json();
    APP_CONFIG.whatsappNumber = data?.fields?.whatsappNumber?.stringValue || '';
    console.log('[config]', APP_CONFIG);
  } catch (e) {
    console.warn('[config] no se pudo cargar:', e);
  }
}

/* === WhatsApp helpers === */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.startsWith('57') ? digits : `57${digits}`;
}
function buildWhatsAppLink(text) {
  const num = normalizePhone(APP_CONFIG.whatsappNumber);
  const q = new URLSearchParams({ text });
  return `https://wa.me/${num}?${q.toString()}`;
}
function hasWhatsAppNumber() {
  return !!(APP_CONFIG.whatsappNumber && String(APP_CONFIG.whatsappNumber).trim());
}



function mapPayment(payment) {
  if (!payment) return '⏳ Aún no procesado';

  // Cuando viene como string
  if (typeof payment === 'string') {
    const p = String(payment).toLowerCase();
    if (p === 'pending' || p === 'queued')   return '⏳ Pago pendiente';
    if (p === 'paid')                        return '✅ Pago aprobado';
    if (p === 'rejected' || p === 'declined')return '❌ Pago rechazado';
    if (p === 'canceled' || p === 'voided')  return '❌ Pago cancelado';
    if (p === 'error')                       return '❌ Error en el pago';
    // Wompi en mayúsculas
    if (payment === 'APPROVED' || payment === 'SUCCESS') return '✅ Pago aprobado';
    if (payment === 'DECLINED')                            return '❌ Pago rechazado';
    return payment; // fallback
  }

  // Cuando viene como objeto { status: ... }
  switch (String(payment.status || '').toLowerCase()) {
    case 'pending':
    case 'queued':      return '⏳ Pago pendiente';
    case 'success':
    case 'paid':
    case 'approved':    return '✅ Pago aprobado';
    case 'insufficient':
    case 'declined':
    case 'rejected':    return '❌ Pago rechazado';
    case 'canceled':
    case 'voided':      return '❌ Pago cancelado';
    case 'error':       return '❌ Error en el pago';
    default:            return payment.status || '—';
  }
}

// NUEVO: traduce estados de la orden al español
function mapOrderStatus(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'queued':       return 'En cola';
    case 'pending':      return 'Pendiente';
    case 'in_progress':  return 'En proceso';
    case 'delivered':    return 'Entregado';
    case 'rejected':     return 'Rechazado';
    case 'failed':       return 'Fallido';
    default:             return status || '—';
  }
}

function buildWAOrderMessage(order) {
  if (!order) return "Hola, necesito ayuda con TrámiteYA";
  const parts = [
    "Hola, necesito ayuda con TrámiteYA.",
    `Orden: ${order.id}`,
    order.serviceName ? `Trámite: ${order.serviceName}` : "",
    `Estado: ${mapOrderStatus(order.status)} / Pago: ${mapPayment(order.payment)}`
  ].filter(Boolean);
  return parts.join(" ");
}

function setFabWhatsApp(orderOrNull) {
  const fab = document.getElementById('fab-whatsapp');
  if (!fab) return;
  if (!hasWhatsAppNumber()) { fab.style.display = 'none'; return; }
  fab.style.display = '';
  fab.onclick = (e) => {
    e.preventDefault();
    const msg = buildWAOrderMessage(orderOrNull || null);
    window.open(buildWhatsAppLink(msg), '_blank');
  };
}

/* =====================
   Config (Functions base URL)
===================== */
// ...existing code...
// ...existing code...
function functionUrl(name) {
  const qp  = new URLSearchParams(location.search);
  const rawEnv = qp.get('env');
  const ENV = (rawEnv && rawEnv !== 'undefined' && rawEnv !== 'null') ? rawEnv : null;

  // Helper: normaliza base (quita / finales y elimina /us-central1 cuando no es emulador)
  const normalizeBase = (base, isEmu) => {
    let out = String(base || '').replace(/\/+$/,'');
    if (!isEmu) out = out.replace(/\/us-central1$/i, ''); // ← clave
    return out;
  };

  // Override manual
  if (window.__API_BASE) {
    const base = normalizeBase(window.__API_BASE, false);
    console.info('API base (override):', base);
    return `${base}/${name}`;
  }

  // Capacitor: siempre apunta a Firebase Hosting en producción
  if (IS_CAPACITOR) {
    const base = 'https://apptramiteya.web.app';
    console.info('API base (capacitor):', base);
    return `${base}/${name}`;
  }

  // Same-origin en Hosting (incluye túneles de dev como cloudflared/ngrok)
  // HTTPS siempre indica túnel o producción → usar rewrites del hosting
  const isHosting = (location.port === '5000') ||
    location.protocol === 'https:' ||
    location.hostname.endsWith('.web.app') ||
    location.hostname.endsWith('.firebaseapp.com') ||
    location.hostname.endsWith('.trycloudflare.com') ||
    location.hostname.endsWith('.ngrok-free.dev') ||
    location.hostname.endsWith('.ngrok-free.app');
  if (!ENV && isHosting) {
    console.info('API base: (hosting rewrite)');
    return `/${name}`;
  }

  // Emulador o prod explícito
  let base;
  if (ENV === 'emulator') {
    base = normalizeBase(`http://${location.hostname}:5001/apptramiteya/us-central1`, true);
  } else if (ENV === 'prod') {
    base = normalizeBase('https://us-central1-apptramiteya.cloudfunctions.net', false);
  } else {
    base = normalizeBase(`http://${location.hostname}:5001/apptramiteya/us-central1`, true);
  }
  const url = `${base}/${name}`;
  console.info('API url:', url);
  return url;
}
// ...existing code...
// ...existing code...

/* =====================
   Helpers DOM & Currency
===================== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const S = {
  list:  $("#screen-list"),
  form:  $("#screen-form"),
  status:$("#screen-status"),

  services: $("#services"),
  empty:    $("#empty"),

  // header
  btnReload: $("#btn-refresh"),
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function pesos(n) {
  return new Intl.NumberFormat('es-CO', {
    style:'currency', currency:'COP', maximumFractionDigits:0
  }).format(n || 0);
}
function isTerminalOrder(order) {
  const normStatus = normalizeOrderStatus(order?.status);
  const terminalStatus = normStatus === 'delivered' || normStatus === 'failed';
  const p = String((order?.payment && (order.payment.status || order.payment)) || '').toLowerCase();
  const terminalPayment = ['rejected', 'canceled', 'error'].includes(p);
  return terminalStatus || terminalPayment;
}
// NUEVO: normaliza estados de orden (ES → EN)
function normalizeOrderStatus(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'entregado':     return 'delivered';
    case 'en cola':       return 'queued';
    case 'pendiente':     return 'pending';
    case 'en proceso':    return 'in_progress';
    case 'rechazado':     return 'rejected';
    case 'fallido':       return 'failed';
    default:              return s; // ya en EN
  }
}
function isDebug() {
  const q = new URLSearchParams(location.search);
  if (q.get('debug') === '1') return true;
  try { return localStorage.getItem('tya_debug') === '1'; } catch { return false; }
}

/* =====================
   API Wrapper
===================== */
async function api(path, opts = {}) {
  const url = functionUrl(path);
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body
  });
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 404 && opts.ignore404) {
      return null; // ← tratar como “no hay datos”
    }
    console.error('API error', { url, status: res.status, text });
    // Mensaje amigable: nunca mostrar errores técnicos al usuario
    const friendly = res.status === 404 ? 'Servicio no disponible momentáneamente.'
      : res.status >= 500 ? 'Error en el servidor. Intenta de nuevo en unos segundos.'
      : 'Ocurrió un error al procesar tu solicitud.';
    if (!opts.silent) showBanner(friendly, 'error', true);
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
  if (!persist) {
    clearTimeout(window.__bannerTimer);
    window.__bannerTimer = setTimeout(() => { el.classList.add('hidden'); }, 4000);
  }
}
function hideBanner() {
  const el = document.getElementById('banner');
  if (el) el.classList.add('hidden');
}

/* =====================
   Local history (localStorage)
===================== */
const LS_KEY = 'tya_orders';

// Array en memoria como fuente única de verdad — evita race conditions en localStorage
let _historyCache = null;

function loadHistory() {
  if (_historyCache) return _historyCache;
  try { _historyCache = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { _historyCache = []; }
  return _historyCache;
}
function saveHistory(arr) {
  _historyCache = arr.slice(0, 50);
  try { localStorage.setItem(LS_KEY, JSON.stringify(_historyCache)); } catch {}
}
function addHistory(entry) {
  const arr = loadHistory();
  // Evitar duplicados
  if (entry.id && arr.some(x => x.id === entry.id)) {
    updateHistoryStatus(entry.id, entry);
    return;
  }
  arr.unshift(entry);
  saveHistory(arr);
  renderHistory();
}
function updateHistoryStatus(id, changes) {
  const arr = loadHistory();
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) {
    arr[i] = { ...arr[i], ...changes };
  } else if (id && changes) {
    arr.unshift({ id, ...changes, createdAt: new Date().toISOString() });
  }
  saveHistory(arr);
  renderHistory();
}
async function refreshHistoryStatus(id) {
  try {
    const st = await api(`orders?id=${encodeURIComponent(id)}`);
    updateHistoryStatus(id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
  } catch {}
}
// Alias global para Capacitor deep link / appStateChange callbacks
async function refreshOrderById(id) {
  try {
    const st = await api(`orders?id=${encodeURIComponent(id)}`);
    updateHistoryStatus(id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
    // Si estamos viendo el status de esta orden, actualizar vista
    if (window.__lastOrderId === id && typeof renderStatus === 'function') {
      renderStatus(st);
    }
  } catch (e) { console.warn('[refreshOrderById]', e); }
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
        <div class="muted">Estado: ${mapOrderStatus(o.status)}</div> 
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn ghost" data-h-reload="${o.id}">Revisar estado</button>
        <button class="btn" data-h-open="${o.id}">Ver detalle</button>
      </div>
    </div>
  `).join('');

  // Deshabilitar "Revisar estado" SOLO si la orden está entregada o fallida
  const reloadBtns = $$('#history-list [data-h-reload]');
  reloadBtns.forEach((btn, idx) => {
    const o = items[idx];
    const st = normalizeOrderStatus(o?.status);      // 'queued'|'in_progress'|'delivered'|'failed'|...
    const isTerminalForHistory = (st === 'delivered' || st === 'failed'); // ← cambio clave
    if (isTerminalForHistory) {
      btn.setAttribute('disabled', '');
      btn.classList.add('secondary', 'outline');
      btn.textContent = 'Finalizado';
    } else {
      btn.removeAttribute('disabled');
      btn.classList.remove('secondary', 'outline');
      btn.textContent = 'Revisar estado';
      btn.onclick = () => refreshHistoryStatus(btn.dataset.hReload);
    }
  });

  // Abrir detalle
  const openBtns = $$('#history-list [data-h-open]');
  openBtns.forEach(btn => {
    btn.onclick = async () => {
      const st = await api(`orders?id=${encodeURIComponent(btn.dataset.hOpen)}`);
      try {
        const items = loadHistory();
        const h = items.find(x => x.id === btn.dataset.hOpen);
        if (h && h.contact && !st.contact) st.contact = h.contact;
      } catch {}
      // === SINCRONIZA HISTORIAL ===
      updateHistoryStatus(st.id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
      // ============================
      renderStatus(st);
      show(S.status);
    };
  });
}

/* =====================
   Utilidades UI
===================== */
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
function disableFormInputs(disabled) {
  document.querySelectorAll('#form input, #form select').forEach(el => { el.disabled = disabled; });
}
function lockHeader(disabled) {
  ['#btn-reload', '#btn-history', '#btn-clear-history'].forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.disabled = disabled;
  });
}
function lockNavigation(disabled) {
  ['#btn-back', '#btn-retry'].forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.disabled = disabled;
  });
}
function lockUIForPayment(active) {
  lockHeader(active); disableFormInputs(active); lockNavigation(active);
  if (S.btnCreate) S.btnCreate.disabled = active;
}

// Evita duplicados del bloque Contacto
function ensureSingleContactBlock() {
  const form = document.getElementById('form');
  if (!form) return;
  const blocks = form.querySelectorAll('#contact-block');
  blocks.forEach((b, i) => { if (i > 0) b.remove(); });
}
function dedupeContactBlock() {
  try {
    const form = document.getElementById('form');
    if (!form) return;
    const blocks = form.querySelectorAll('#contact-block');
    for (let i = 1; i < blocks.length; i++) blocks[i].remove();
  } catch (e) { console.warn('dedupeContactBlock:', e); }
}

/* =====================
   Screens
===================== */
let currentService = null;
let currentOrder   = null;
let creating       = false;

async function loadServices() {
  S.services.innerHTML = '<div style="text-align:center;padding:32px 0;color:var(--muted)"><div class="spinner" style="margin:0 auto 12px;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite"></div>Cargando servicios…</div>';
  S.empty.classList.add('hidden');

  // Auto-retry con backoff (hasta 3 intentos silenciosos antes de mostrar error)
  const MAX_RETRIES = 3;
  const DELAYS = [2000, 4000, 8000]; // ms entre reintentos
  let data = null;
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      data = await api('services', { silent: true });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[loadServices] intento ${attempt + 1}/${MAX_RETRIES + 1} falló:`, e?.message || e);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, DELAYS[attempt]));
      }
    }
  }
  if (lastErr || !data) {
    S.services.innerHTML = '<div style="text-align:center;padding:32px 0;color:var(--danger)">No pudimos cargar los servicios.<br><button class="btn ghost" onclick="loadServices()" style="margin-top:12px">Reintentar</button></div>';
    return;
  }
  if (!data || !data.items || !data.items.length) {
    S.services.innerHTML = '';
    S.empty.classList.remove('hidden');
    return;
  }

  S.services.innerHTML = '';
  data.items.forEach(svc=>{
    const card = document.createElement('div');
    card.className = 'card';
    // ...existing code...
    card.innerHTML = `
      <div class="title">${svc.name}</div>
      <div class="muted">
        ${svc.description
          ? String(svc.description)
          : `Entrega aprox: ${svc.sla_hours || 24} h • Canales: ${(svc.deliver_channels||[]).join(', ') || 'email'}`}
      </div>
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
  ensureSingleContactBlock();
  if (S.formEl && __FORM_BASE_HTML) S.formEl.innerHTML = __FORM_BASE_HTML;
  dedupeContactBlock();

  const form = S.formEl;
  if (!form) return;

  if (!document.getElementById('contact-block')) {
    form.insertAdjacentHTML('afterbegin', `
      <div class="section-block" id="contact-block">
        <div class="form-section-title"><span class="section-ico">👤</span>Contacto</div>
        <div class="section-content">
          <p class="form-section-help" style="margin:4px 0 8px">Usaremos estos datos para entregarte tu certificado.</p>

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

  let dyn = document.getElementById('dyn-fields');
  if (!dyn) { dyn = document.createElement('div'); dyn.id = 'dyn-fields'; form.appendChild(dyn); }
  else { dyn.innerHTML = ''; }

 const data = await api(`services?id=${encodeURIComponent(id)}`);
  const svc = data.item;
  currentService = svc;
  window.__CURRENT_SERVICE = svc; // ← agregado: disponible para updatePriceUI

  
  S.svcHead.innerHTML = `<div class="title">${svc.name}</div>`;
  // ...existing code...
  const price = svc.price || { base:0, iva:0, fee:0, total:0 };
  const fpb   = document.getElementById('form-price-base');
  const fpt   = document.getElementById('form-price-tax');
  const fpf   = document.getElementById('form-price-fee');
  const fptot = document.getElementById('form-price-total');

  if (fpb)   fpb.textContent   = pesos(price.base || 0);
  if (fpt)   fpt.textContent   = pesos((price.iva ?? price.tax) || 0);
  if (fpf)   fpf.textContent   = pesos(price.fee  || 0);
  if (fptot) fptot.textContent = pesos(price.total|| 0);
  // ...existing code...

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

  const c = loadContact();
  if (c.name)  form.querySelector('[name="contact_name"]').value  = c.name;
  if (c.email) form.querySelector('[name="contact_email"]').value = c.email;
  if (c.phone) form.querySelector('[name="contact_phone"]').value = c.phone;

  S.paySim.classList.add('hidden');
  currentOrder = null;

  lockHeader(false); lockNavigation(false); disableFormInputs(false);
  if (S.btnCreate) S.btnCreate.disabled = false;

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
  if (creating) return;

  const form = S.formEl;
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const data = formDataToObject(form);
  const contact = {
    name:  (data.contact_name || '').trim(),
    email: (data.contact_email || '').trim(),
    phone: (data.contact_phone || '').trim(),
  };
  saveContact(contact);

  creating = true;
  setBtnLoading(S.btnCreate, true, "Creando…");
  disableFormInputs(true);
  lockHeader(true);
  lockNavigation(true);

  const emailOk = /^\S+@\S+\.\S+$/.test(contact.email);
  const phoneClean = contact.phone.replace(/[\s\-()]/g, '');
  const phoneOk = /^(\+?57)?3\d{9}$/.test(phoneClean) || /^\d{7,10}$/.test(phoneClean);
  if (!contact.name || !contact.email || !contact.phone || !emailOk || !phoneOk) {
    const msgs = [];
    if (!contact.name) msgs.push('nombre');
    if (!contact.email || !emailOk) msgs.push('correo electrónico válido');
    if (!contact.phone || !phoneOk) msgs.push('teléfono válido (ej: 3001234567)');
    showBanner(`Completa: ${msgs.join(', ')}.`, 'warn');
    setBtnLoading(S.btnCreate, false, "", "Crear orden");
    disableFormInputs(false); lockHeader(false); lockNavigation(false);
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
        form_data: data,
        status: 'queued',
        payment: 'pending',
        delivery: { channel: null, fileUrl: null }
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
      contact,
      status: 'queued',
      payment: 'pending',
      delivery: { channel: null, fileUrl: null }
    });

    setBtnLoading(S.btnCreate, true, "Procesando pago…");
    console.log('[createOrder] POST /payments_init…');
    const payInit = await api('payments_init', {
      method:'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    console.log('[createOrder] /payments_init OK', JSON.stringify(payInit));

    // === Wompi Widget (pago dentro de la app, sin salir al navegador) ===
    if (payInit?.mode === 'wompi' && payInit.widgetParams) {
      console.log('[createOrder] Abriendo Wompi Widget');
      try {
        setBtnLoading(S.btnCreate, true, "Cargando pasarela…");
        await loadWompiWidget();
        setBtnLoading(S.btnCreate, false, "", "Crear orden");

        // Persistir referencia antes de abrir widget (sobrevive force-close / PSE redirect)
        savePendingPayment(payInit.widgetParams.reference, order.id);

        // Abrir widget con redirectUrl (PSE necesita saber a dónde volver)
        const result = await openWompiWidget(payInit.widgetParams, payInit.redirectUrl);
        console.log('[createOrder] Widget result:', result);
        clearPendingPayment();

        // Widget resuelto — ahora sí desbloquear UI y mostrar status
        disableFormInputs(false); lockHeader(false); lockNavigation(false);
        show(S.status);

        // Confirmar server-side
        const parts = [];
        if (result.transactionId) parts.push(`transactionId=${encodeURIComponent(result.transactionId)}`);
        if (result.reference) parts.push(`reference=${encodeURIComponent(result.reference)}`);
        if (parts.length) await api(`payments_confirm?${parts.join('&')}`).catch(e => console.warn('[createOrder] confirm error:', e));

        // Renderizar estado final
        const st = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
        renderStatus(st);
        updateHistoryStatus(currentOrder.id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        maybeNotifyPaid(st);
        if (normalizePayment(st.payment) === 'paid' && normalizeOrderStatus(st.status) !== 'delivered') {
          pollForDelivery(currentOrder.id);
        }
      } catch (e) {
        console.error('[createOrder] Widget error/dismissed:', e);
        disableFormInputs(false); lockHeader(false); lockNavigation(false);
        showBanner(`Error pasarela: ${e?.message || e}`, 'error', true);
        try {
          const st = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
          renderStatus(st);
          updateHistoryStatus(currentOrder.id, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        } catch {}
        show(S.status);
      }
      return;
    }

if (payInit?.mode === 'mock') {
  // Mostrar simulador de pago en modo mock
  if (S.paySim) {
    S.paySim.classList.remove('hidden');
    S.paySim.style.display = 'block';
    const det = document.getElementById('simulator');
    if (det) det.open = true;
    // Scroll para que el usuario vea el simulador
    setTimeout(() => S.paySim.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
  // Solo alertar si la config realmente falta (no si mock es intencional)
  if (payInit.reason === 'config_missing') {
    showBanner('Configuración de pagos no encontrada. Contacta al administrador.', 'error');
  }
  disableFormInputs(false);
  lockHeader(false);
  lockNavigation(false);
  setBtnLoading(S.btnCreate, false, "Creando…", "Crear orden");
  return;
}
// ...existing code...

    // Llegados aquí (mock no debug, o cualquier otro caso),
    // consultamos el estado y pintamos (dispara confeti si ya está "paid")
    const status = await api(`orders?id=${encodeURIComponent(currentOrder.id)}`);
    renderStatus(status);
    //nuevo para las notificaciones
// Reemplazo: notificar si aplica usando helper (dedup por localStorage)
  maybeNotifyPaid(status);

    //fin codigo nuew para notificaciones
    disableFormInputs(false); lockHeader(false); lockNavigation(false);
    setBtnLoading(S.btnCreate, false, "", "Crear orden");
    show(S.status);
    return;

  } catch (e) {
    showBanner(e?.message || 'No pudimos crear tu orden. Intenta más tarde o contáctanos por WhatsApp.', 'error', true);
    disableFormInputs(false); lockHeader(false); lockNavigation(false);
    setBtnLoading(S.btnCreate, false, "", "Crear orden");
  } finally {
    creating = false;
  }
}

/* =====================
   Simulador (mock)
===================== */
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

    S.paySim.classList.add('hidden');
    setBtnLoading(S.btnCreate, false, "Crear orden");
    disableFormInputs(false); lockHeader(false); lockNavigation(false);

    show(S.status);
  } catch (e) {
    showBanner(e?.message || 'No pudimos confirmar el pago en este momento.', 'error');
  }
}

/* =====================
   Confetti
===================== */
const LOG = (...args) => console.log('[CONFETTI]', ...args);
window.__confettiShown = window.__confettiShown || new Set();
function prefersReducedMotion() {
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}
console.log('[CONFETTI] reducedMotion =', prefersReducedMotion());

function triggerConfetti(orderId) {
  if (prefersReducedMotion()) { LOG('reduced motion: skip'); return; }
  if (!orderId) { LOG('missing orderId'); return; }
  if (window.__confettiShown.has(orderId)) { LOG('already shown for', orderId); return; }

  try {
    console.log('[CONFETTI] trigger for', orderId);
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('role', 'presentation');
    document.body.appendChild(layer);

    const colors = ['#10b981','#0ea5e9','#f59e0b','#ef4444','#6366f1','#14b8a6'];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div');
      d.className = 'confetti__piece';
      d.style.left = (Math.random()*100)+'%';
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = (Math.random()*0.3)+'s';
      layer.appendChild(d);
    }

    window.__confettiShown.add(orderId);
    LOG('START for', orderId);
    setTimeout(() => {
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
      LOG('END for', orderId);
    }, 1200);
  } catch (e) {
    console.warn('[confetti] Error:', e);
  }
}
// ...existing code...
function normalizePayment(p){
  if (!p) return 'pending';
  if (typeof p === 'string') return p;
  switch (String(p.status).toLowerCase()){
    case 'success':      return 'paid';
    case 'paid':         return 'paid';        // ← Wompi
    case 'approved':     return 'paid';        // ← por si acaso
    case 'insufficient': return 'rejected';
    case 'rejected':     return 'rejected';    // ← Wompi
    case 'declined':     return 'rejected';    // ← sinónimo
    case 'canceled':     return 'canceled';
    case 'voided':       return 'canceled';    // ← sinónimo
    case 'error':        return 'error';
    case 'APPROVED':     return 'paid';         // ← Wompi
    case 'DECLINED':     return 'rejected';        // ← Wompi
    case 'SUCCESS':      return 'paid';        // ← Wompi
    default:             return 'pending';
  }
}
// ...existing code...
window.__confettiTest = function(){
  const id = 'TEST-'+Date.now();
  triggerConfetti(id);
  return id;
};

/* =====================
   Payment state + Hero
===================== */
// ...existing code...
function paymentState(order) {
  const p = order?.payment;
  if (!p) return 'pending';
  if (typeof p === 'string') return p;
  switch (String(p.status).toLowerCase()) {
    case 'success':      return 'paid';
    case 'paid':         return 'paid';        // ← Wompi
    case 'approved':     return 'paid';        // ← por si acaso
    case 'insufficient': return 'rejected';
    case 'rejected':     return 'rejected';    // ← Wompi
    case 'declined':     return 'rejected';    // ← sinónimo
    case 'canceled':     return 'canceled';
    case 'voided':       return 'canceled';    // ← sinónimo
    case 'error':        return 'error';
    case 'APPROVED':     return 'paid';         // ← Wompi
    case 'DECLINED':     return 'rejected';        // ← Wompi
    case 'SUCCESS':      return 'paid';        // ← Wompi
    default:             return 'pending';
  }
}
// ...existing code...

// ...existing code...
function updateHero(order) {
  const hero = document.getElementById('status-hero');
  if (!hero) return;

  const heroIcon  = document.getElementById('hero-ico');
  const heroTitle = document.getElementById('hero-title');
  const heroSub   = document.getElementById('hero-sub');
  const heroDate  = document.getElementById('hero-date');

  hero.classList.remove('is-success', 'is-error', 'is-pending');



  
  const p = paymentState(order);
  if (p === 'paid' || p=== 'APPROVED') {
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

  // Mejora: usar audit.created_at si existe
  const d = new Date(
    order?.audit?.created_at ||
    order.createdAt ||
    order.created ||
    Date.now()
  );
  if (heroDate) heroDate.textContent = d.toLocaleString('es-CO');
}
// ...existing code...

/* =====================
   Render Status (dispara confeti)
===================== */
// ...existing code...
async function retryPayment(orderId) {
  const btn = document.getElementById('btn-retry-payment');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando…'; }
  try {
    const payInit = await api('payments_init', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    });

    // === Wompi Widget (pago dentro de la app) ===
    if (payInit?.mode === 'wompi' && payInit.widgetParams) {
      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Cargando pasarela…'; }
        await loadWompiWidget();
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar pago'; }

        savePendingPayment(payInit.widgetParams.reference, orderId);
        const result = await openWompiWidget(payInit.widgetParams, payInit.redirectUrl);
        console.log('[retryPayment] Widget result:', result);
        clearPendingPayment();

        // Confirmar server-side
        const parts = [];
        if (result.transactionId) parts.push(`transactionId=${encodeURIComponent(result.transactionId)}`);
        if (result.reference) parts.push(`reference=${encodeURIComponent(result.reference)}`);
        if (parts.length) await api(`payments_confirm?${parts.join('&')}`).catch(e => console.warn('[retryPayment] confirm error:', e));

        const st = await api(`orders?id=${encodeURIComponent(orderId)}`);
        renderStatus(st);
        updateHistoryStatus(orderId, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        maybeNotifyPaid(st);
        if (normalizePayment(st.payment) === 'paid' && normalizeOrderStatus(st.status) !== 'delivered') {
          pollForDelivery(orderId);
        }
      } catch (e) {
        console.error('[retryPayment] Widget error/dismissed:', e);
        showBanner(`Error pasarela: ${e?.message || e}`, 'error', true);
        try {
          const st = await api(`orders?id=${encodeURIComponent(orderId)}`);
          renderStatus(st);
          updateHistoryStatus(orderId, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        } catch {}
      }
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar pago'; }
      return;
    }

    if (payInit?.mode === 'mock') {
      showBanner('Modo simulado activo. Usa el simulador de pago para confirmar.', 'info');
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar pago'; }
      return;
    }

    showBanner('No se pudo iniciar el pago. Intenta más tarde.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar pago'; }
  } catch (e) {
    console.error('[retryPayment] error:', e);
    showBanner(e?.message || 'No se pudo reintentar el pago.', 'error', true);
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Reintentar pago'; }
  }
}

function renderStatus(order) {
  // Actualiza hero dinámico (antes de calcular badge para consistencia)
  updateHero(order);

  
  // Badge
  const badge = document.getElementById('badge-status');
 
// ...existing code...
// ...existing code...
  let badgeClass = 'pill warn', badgeText = 'Pago pendiente';
  if (
    order.payment === 'paid' ||
    order.payment?.status === 'success' ||
    order.payment?.status === 'paid' ||
    String(order.payment?.status || '').toLowerCase() === 'approved' // <-- agregado
  ) {
    badgeClass = 'pill success'; badgeText = 'Pago aprobado';
  } else if (
    order.payment === 'rejected' ||
    order.payment === 'canceled' ||
    order.payment === 'error' ||
    String(order.payment?.status || '').toLowerCase() === 'rejected' ||
    String(order.payment?.status || '').toLowerCase() === 'canceled' ||
    String(order.payment?.status || '').toLowerCase() === 'error' ||
    String(order.payment?.status || '').toLowerCase() === 'insufficient'
  ) {
    badgeClass = 'pill error'; badgeText = 'Pago no aprobado';
  } else {
    badgeClass = 'pill warn'; badgeText = 'Pago pendiente';
  }
  if (badge) { badge.className = badgeClass; badge.textContent = badgeText; }
// ...existing code...
// ...existing code...


  // Order ID
  const oid = document.getElementById('order-id');
  if (oid) oid.textContent = order.id ? String(order.id).slice(0, 8) : '—';

  // Service
  const osvc = document.getElementById('order-service');
  if (osvc) osvc.textContent = order.serviceName || order.service || currentService?.name || 'Trámite';

  // Date
  const odate = document.getElementById('order-date');
  const ts = order.createdAt || Date.now();
  if (odate) odate.textContent = new Date(ts).toLocaleString();

  // Delivery status
  const sdel = document.getElementById('status-delivery');
  if (sdel) {
    const normSt = normalizeOrderStatus(order.status);
    if (normSt === 'delivered') {
      const ch = order.delivery && order.delivery.channel ? order.delivery.channel : 'entrega';
      sdel.textContent = `Entregado (${ch})`;
    } else {
      sdel.textContent = 'Pendiente';
    }
  }

  // Price breakdown (scope en #screen-status para evitar IDs duplicados)
  const root = document.getElementById('screen-status') || document;
  const snapPrice = order.price_breakdown || order.priceSnapshot || order.price || null;
  const pbase = root.querySelector('#price-base');
  const ptax  = root.querySelector('#price-tax');
  const pfee  = root.querySelector('#price-fee');
  const ptotal= root.querySelector('#price-total');
  if (snapPrice) {
    if (pbase)  pbase.textContent  = pesos(snapPrice.base ?? 0);
    if (ptax)   ptax.textContent   = pesos(snapPrice.iva  ?? snapPrice.tax ?? 0);
    if (pfee)   pfee.textContent   = pesos(snapPrice.fee  ?? 0);
    if (ptotal) ptotal.textContent = pesos(snapPrice.total?? 0);
  } else {
    if (pbase)  pbase.textContent  = '—';
    if (ptax)   ptax.textContent   = '—';
    if (pfee)   pfee.textContent   = '—';
    if (ptotal) ptotal.textContent = '—';
  }

  // CAMBIO: no pasar el objeto order “crudo”; usar el contexto esperado
  updatePriceUI({ order });   // antes: updatePriceUI(order)


  // Friendly message
  const msg = document.getElementById('friendly-message');
  let friendly = '—';
  if (badgeClass === 'pill success') {
    friendly = 'Tu pago fue aprobado ✅. En breve pondremos tu solicitud en cola y te avisaremos por correo/WhatsApp cuando esté lista.';
  } else if (badgeClass === 'pill warn') {
    friendly = 'Tu pago está pendiente ⏳. Si cerraste esta ventana, puedes reintentarlo desde tu historial.';
  } else if (badgeClass === 'pill error') {
    friendly = 'No pudimos procesar el pago ❌. Puedes reintentarlo más tarde o regresar yelegir otro método.';
  }
  if (msg) msg.textContent = friendly;

  // Debug JSON (si existe el bloque)
  const sjson = document.getElementById('status-json');
  if (sjson) sjson.innerHTML = `<pre>${JSON.stringify(order, null, 2)}</pre>`;

  // --- Confetti: de-dupe por sesión; en debug permitimos re-disparar ---
  const pnorm = normalizePayment(order.payment); // "paid" | ...
  if (pnorm === 'paid' && order.id) {
    try {
      const set = (window.__confettiShown = window.__confettiShown || new Set());
      if (isDebug()) set.delete(order.id);
      if (!set.has(order.id)) {
        triggerConfetti(order.id);
        set.add(order.id);
      }
    } catch (e) {
      console.warn('[confetti] error de dedupe:', e);
      try { triggerConfetti(order.id); } catch {}
    }
  }


  //Detalle de cobro con valores cuando el pago fue rechazado?
// REEMPLAZAR: función updatePriceUI por una versión multi-contexto
function updatePriceUI(ctx) {
  // ctx puede ser: { order } o { service }
  const order   = ctx?.order || null;
  const service = ctx?.service || window.__CURRENT_SERVICE || null;

  // Helpers
  const pesos = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n||0));

  // 1) FORM: precios del servicio seleccionado
  (function paintForm(){
    const root = document.getElementById('screen-form');
    if (!root) return;
    const fPrice = service?.price_breakdown || service?.price || null;
    const box = root.querySelector('#price-box');
    if (!box) return;

    const titleEl = root.querySelector('#price-title');
    const baseEl  = root.querySelector('#price-base');
    const ivaEl   = root.querySelector('#price-tax');
    const feeEl   = root.querySelector('#price-fee');
    const totLbl  = root.querySelector('#price-total-label');
    const totEl   = root.querySelector('#price-total');
    const noteEl  = root.querySelector('#price-note');

    if (!fPrice) {
      if (baseEl) baseEl.textContent = '—';
      if (ivaEl)  ivaEl.textContent  = '—';
      if (feeEl)  feeEl.textContent  = '—';
      if (totEl)  totEl.textContent  = '—';
      return;
    }
    // En el formulario siempre mostramos “Desglose/Detalle” y “Total a pagar”
    if (titleEl) titleEl.textContent = 'Desglose de precios';
    if (totLbl)  totLbl.textContent  = 'Total a pagar';
    if (noteEl)  noteEl.textContent  = '';

    if (baseEl) baseEl.textContent = pesos(fPrice.base ?? 0);
    if (ivaEl)  ivaEl.textContent  = pesos(fPrice.iva  ?? fPrice.tax ?? 0);
    if (feeEl)  feeEl.textContent  = pesos(fPrice.fee  ?? 0);
    if (totEl)  totEl.textContent  = pesos(fPrice.total?? 0);
  })();

  // 2) ESTADO: precios tomados de la orden
  (function paintStatus(){
    const root = document.getElementById('screen-status');
    if (!root) return;
    const sPrice = order?.price_breakdown || order?.priceSnapshot || order?.price || null;

    const titleEl = root.querySelector('#price-title');
    const baseEl  = root.querySelector('#price-base');
    const ivaEl   = root.querySelector('#price-tax');
    const feeEl   = root.querySelector('#price-fee');
    const totLbl  = root.querySelector('#price-total-label');
    const totEl   = root.querySelector('#price-total');
    const noteEl  = root.querySelector('#price-note');

    if (!sPrice) {
      if (baseEl) baseEl.textContent = '—';
      if (ivaEl)  ivaEl.textContent  = '—';
      if (feeEl)  feeEl.textContent  = '—';
      if (totEl)  totEl.textContent  = '—';
      return;
    }

    // Etiquetas según estado de pago en la orden
    const norm = paymentState(order); // 'paid' | 'pending' | 'rejected' | 'canceled' | 'error'
    if (norm === 'paid') {
      if (titleEl) titleEl.textContent = 'Detalle de cobro';
      if (totLbl)  totLbl.textContent  = 'Total pagado';
      if (noteEl)  noteEl.textContent  = '';
    } else {
      if (titleEl) titleEl.textContent = 'Resumen de costos';
      if (totLbl)  totLbl.textContent  = 'Total del trámite (No cobrado)';
      if (noteEl)  noteEl.textContent  = (norm === 'pending')
        ? 'Aún no se ha realizado ningún cobro.'
        : 'No se realizó ningún cobro. Puedes reintentarlo ahora o elegir otro método.';
    }

    if (baseEl) baseEl.textContent = pesos(sPrice.base ?? 0);
    if (ivaEl)  ivaEl.textContent  = pesos(sPrice.iva  ?? sPrice.tax ?? 0);
    if (feeEl)  feeEl.textContent  = pesos(sPrice.fee  ?? 0);
    if (totEl)  totEl.textContent  = pesos(sPrice.total?? 0);
  })();
}
// ...existing code...
// ...existing code...


  // fallback: contacto desde historial
  if (!order.contact && order.id) {
    try {
      const items = loadHistory();
      const h = items.find(x => x.id === order.id);
      if (h?.contact) order.contact = h.contact;
    } catch {}
  }
  const contactEl = document.getElementById('order-contact');
  let contactText = '—';
  if (order.contact) {
    if (order.contact.email && order.contact.phone) contactText = `${order.contact.email} / ${order.contact.phone}`;
    else if (order.contact.email) contactText = order.contact.email;
    else if (order.contact.phone) contactText = order.contact.phone;
  }
  if (contactEl) contactEl.textContent = contactText;

  // Acciones de certificado (descargar/compartir)
  const actions = document.getElementById('cert-actions');
  const dl = document.getElementById('download-cert-link');
  const wa = document.getElementById('share-wa');
  const mail = document.getElementById('share-mail');
  if (actions && dl && wa && mail) {
    const normSt = normalizeOrderStatus(order.status); // ← usar normalizado
    if (normSt === "delivered" && order.delivery?.fileUrl) {
      const url = order.delivery.fileUrl;
      dl.href = url; dl.target = '_blank'; dl.rel = 'noopener';
      const waMsg = `Orden: ${order.id}\nTrámite: ${order.serviceName || ""}\nCertificado listo: ${url}`;
      wa.href = buildWhatsAppLink(waMsg); wa.target = '_blank'; wa.rel = 'noopener';
      const subject = encodeURIComponent(`Tu certificado de TrámiteYA - Orden ${order.id}`);
      const body = encodeURIComponent(`Hola,\n\nAquí tienes tu certificado:\n${url}\n\nGracias por usar TrámiteYA.`);
      mail.href = `mailto:?subject=${subject}&body=${body}`;
      actions.style.display = '';
    } else {
      actions.style.display = 'none';
    }
  }
  // "Sigue tu trámite"
  const follow = document.getElementById('followup-card');
  if (follow) follow.style.display = isTerminalOrder(order) ? 'none' : '';

  // Reintentar pago (solo para estados fallidos)
  const retryBlock = document.getElementById('retry-payment-actions');
  if (retryBlock) {
    const pnormR = normalizePayment(order.payment);
    const isFailedPayment = ['rejected', 'canceled', 'error'].includes(pnormR);
    const isAlreadyPaid   = pnormR === 'paid';
    retryBlock.style.display = (isFailedPayment && !isAlreadyPaid) ? '' : 'none';
    if (isFailedPayment) {
      const btn = document.getElementById('btn-retry-payment');
      if (btn) btn.dataset.orderId = order.id || '';
    }
  }

  // WhatsApp contextual
  setFabWhatsApp(order);
}

/* =====================
   Events & Init
===================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Modo debug: muestra/oculta card de detalles técnicos
  const debugCard = document.getElementById('debug-card');
  const showDebug = new URLSearchParams(location.search).get('debug') === '1';
  if (debugCard) debugCard.style.display = showDebug ? 'block' : 'none';

  // Recuperar pago pendiente de localStorage (sobrevive force-close y redirección PSE)
  const q = new URLSearchParams(location.search);
  const orderIdFromQS = q.get('orderId');
  const pendingPay = loadPendingPayment();
  if (!orderIdFromQS && pendingPay) {
    // App reabierta tras force-close con pago PSE en curso
    console.log('[startup] Recuperando pago pendiente:', pendingPay);
    clearPendingPayment();
    try {
      await api(`payments_confirm?reference=${encodeURIComponent(pendingPay.reference)}`);
    } catch (e) { console.warn('[startup] confirm pendiente skip:', e); }
    try {
      const st = await api(`orders?id=${encodeURIComponent(pendingPay.orderId)}`, { ignore404: true, silent: true });
      if (st) {
        renderStatus(st);
        updateHistoryStatus(pendingPay.orderId, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        maybeNotifyPaid(st);
        show(S.status);
        if (normalizePayment(st.payment) === 'pending') {
          pollForDelivery(pendingPay.orderId);
        }
      }
    } catch {}
  }

  // Si regresamos con ?orderId=..., cargar estado y pintar hero dinámico
  // [CONSERVAR – bloque robusto con reconfirmación y polling]
  if (orderIdFromQS) {
    // Guardar reference del pago pendiente ANTES de limpiarlo (se usa como fallback en reconfirmación)
    const pendingRef = (pendingPay && pendingPay.orderId === orderIdFromQS) ? pendingPay.reference : null;
    if (pendingRef) clearPendingPayment();
    try {
      let st = await api(`orders?id=${encodeURIComponent(orderIdFromQS)}`, { ignore404: true, silent: true });
      if (!st) {
        // limpiar URL y seguir en catálogo
        q.delete('orderId'); q.delete('id'); q.delete('reference'); q.delete('ref');
        history.replaceState({}, document.title, `${location.pathname}${q.toString() ? `?${q.toString()}` : ''}${location.hash || ''}`);
      } else {
        renderStatus(st);
        // === ACTUALIZA HISTORIAL AUTOMÁTICAMENTE ===
        updateHistoryStatus(orderIdFromQS, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
        // ===========================================
                maybeNotifyPaid(st);

        // Polling automático si pagó pero aún no entregado
        if (normalizePayment(st.payment) === 'paid' && normalizeOrderStatus(st.status) !== 'delivered') {
          pollForDelivery(orderIdFromQS);
        }

        show(S.status);

        // Limpiar URL para que refresh no vuelva al comprobante
        cleanOrderUrl();

        // Reconfirmación + polling si sigue pendiente (Wompi)
        const isWompi = st?.payment?.mode === 'wompi' || st?.paymentMode === 'wompi';
        const isPending = (normalizePayment(st.payment) === 'pending');
        if (isWompi && isPending) {
          const txId = q.get('id') || q.get('transactionId') || '';
          const ref  = q.get('reference') || q.get('ref') || pendingRef || '';
          try {
            const parts = [];
            if (txId) parts.push(`transactionId=${encodeURIComponent(txId)}`);
            if (ref)  parts.push(`reference=${encodeURIComponent(ref)}`);
            parts.push(`orderId=${encodeURIComponent(orderIdFromQS)}`);
            await api(`payments_confirm?${parts.join('&')}`);
          } catch (e) { console.warn('[return] reconfirm skip:', e); }
          for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 600 * (i + 1)));
            try {
              st = await api(`orders?id=${encodeURIComponent(orderIdFromQS)}`, { ignore404: true, silent: true });
              if (!st) break;
              renderStatus(st);
              // === REFRESCA HISTORIAL EN CADA PULL ===
              updateHistoryStatus(orderIdFromQS, { status: st.status, payment: st.payment, delivery: st.delivery ?? null });
              // =======================================
                         maybeNotifyPaid(st);       // ← agregado en cada actualización

              if (normalizePayment(st.payment) !== 'pending') break;
            } catch {}
          }
        }
      }
    } catch {
      // silencioso en primer arranque
    }
  }

  // Header actions
  if (S.btnReload) {
    S.btnReload.addEventListener('click', async () => {
      if (S.btnReload.disabled) return;
      S.btnReload.disabled = true;
      try {
        show(S.list);
        await loadServices();
        document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
      } finally { S.btnReload.disabled = false; }
    });
  }
  if (S.btnHistory) {
    S.btnHistory.addEventListener('click', () => {
      show(S.list);
      document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (S.btnClearHistory) {
    S.btnClearHistory.addEventListener('click', () => {
      localStorage.removeItem(LS_KEY);
      renderHistory();
    });
  }
  if (S.btnBack)  S.btnBack.addEventListener('click', () => { cleanOrderUrl(); show(S.list); });
  if (S.btnRetry) S.btnRetry.addEventListener('click', () => { cleanOrderUrl(); show(S.list); loadServices(); });

  document.getElementById('btn-retry-payment')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-retry-payment');
    const oid = btn?.dataset?.orderId || window.__lastOrderId || '';
    if (!oid) { showBanner('No se encontró el ID de la orden.', 'error'); return; }
    retryPayment(oid).catch(e => console.error('[retryPayment] unhandled:', e));
  });
  if (S.btnCreate) {
    S.btnCreate.addEventListener('click', (e) => { e.preventDefault(); createOrder().catch(err => alert(err.message)); });
  }

  // Simulador mock
  document.getElementById('pay-sim')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-sim]');
    if (!btn) return;
    const scenario = btn.dataset.sim;
    confirmPayment(scenario).catch(err=>alert(err.message));
  });

  // Init principal
  try { await loadConfig(); setFabWhatsApp(null); } catch { setFabWhatsApp(null); }
  _historyCache = null; // forzar lectura fresca de localStorage
  renderHistory();
  // Re-render tras delays: Android auto-backup puede restaurar localStorage con retraso
  setTimeout(() => { _historyCache = null; renderHistory(); }, 800);
  setTimeout(() => { _historyCache = null; renderHistory(); }, 2500);
  loadServices();
  if (typeof loadCatalog === 'function') loadCatalog();

// Simulador de pago: siempre oculto al inicio, se muestra dinámicamente en modo mock
if (S.paySim) S.paySim.classList.add('hidden');
// ...existing code...
  const f = document.getElementById('form');
  if (f) {
    __FORM_BASE_HTML = f.innerHTML; // snapshot base
    const obs = new MutationObserver(() => ensureSingleContactBlock());
    obs.observe(f, { childList: true, subtree: true });
  }

  // ...existing code...

  // Bottom nav handlers
document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-nav]');
  if (!btn) return;
  const where = btn.dataset.nav;

  // Marcar tab activa
  document.querySelectorAll('#bottom-nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (where === 'catalog') {
    show(S.list);
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (where === 'history') {
    show(S.list);
    document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (where === 'about') {
    document.getElementById('about-modal')?.showModal();
  }
  // NUEVO: acción del botón "Contacto"
  if (where === 'contact') {
    const msg = buildWAOrderMessage(null);
    if (hasWhatsAppNumber()) window.open(buildWhatsAppLink(msg), '_blank');
  }
});

// Cierre del modal
document.getElementById('about-close')?.addEventListener('click', () => {
  document.getElementById('about-modal')?.close();
});

  /* =====================
     Copiar (data-copy)
  ===================== */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const sel = btn.getAttribute('data-copy');
    const el = document.querySelector(sel);
    if (!el) return;

    try {
      await navigator.clipboard.writeText(el.innerText.trim());
      const oldTitle = btn.title, oldSrc = btn.src;
      btn.title = 'Copiado ✔';
      if (btn.tagName === 'IMG') btn.src = 'img/copiar.png';
      setTimeout(() => { btn.title = oldTitle; if (btn.tagName === 'IMG') btn.src = oldSrc; }, 2000);
    } catch { btn.title = 'Error'; }
  });

  // Hook de prueba manual
  window.__confettiTest = function() {
    const id = 'TEST-'+Date.now();
    triggerConfetti(id);
    return id;
  };

}); // Cierre de DOMContentLoaded
