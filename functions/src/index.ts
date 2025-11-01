// functions/src/index.ts
import corsLib from "cors";
import { onRequest } from "firebase-functions/v2/https";

// Importa handlers (usa sufijo .js para ESM, igual que en orders.ts)
import { listServices, getService } from "./services.js";
import { createOrder, getOrderStatus } from "./orders.js";

// ...existing code...

export const notify = onRequest({ cors: ["https://<tu-sitio>.web.app", "http://localhost:5000"] }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }     // ← no retornes Response
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  try {
    const NOTIFY_WEBHOOK = "https://hooks.zapier.com/hooks/catch/25211343/ui7n435/";
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    await fetch(NOTIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    res.status(204).end();                                             // ← terminar respuesta
    return;                                                            // ← sin valor
  } catch (e:any) {
    console.error('notify error', e);
    res.status(500).send('notify failed');
    return;                                                            // ← sin valor
  }
});
// ...existing code...


// Re-exporta funciones de otros módulos (usa .js)
export { payments_init, payments_confirm } from "./payments.js";
export { config_public } from "./config.js";

const cors = corsLib({ origin: true });

// ----- Services -----
// GET /services          -> lista
// GET /services?id=...   -> detalle
export const services = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*"); // ← asegura CORS también en GET
      // ===== CORS preflight =====
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).end();
        return;
      }
      // ==========================
      if (req.method === "GET") {
        if (req.query.id) return getService(req, res);
        return listServices(req, res);
      }
      return res.status(405).send("Method Not Allowed");
    } catch (e: any) { /* ...existing code... */ }
  });
});

// ----- Orders -----
// POST /orders           -> createOrder
// GET  /orders?id=...    -> getOrderStatus
export const orders = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*"); // ← asegura CORS también en GET/POST
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.status(204).end();
        return;
      }
      if (req.method === "POST") return createOrder(req, res);
      if (req.method === "GET")  return getOrderStatus(req, res);
      return res.status(405).send("Method Not Allowed");
    } catch (e: any) { /* ...existing code... */ }
  });
});
