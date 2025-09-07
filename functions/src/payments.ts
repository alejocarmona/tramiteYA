// functions/src/payments.ts
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { ensureFirebase } from "./utils";

/** CORS helper (permite POST desde Hosting :5000 hacia Functions :5001) */
function applyCors(req: Request, res: Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Inicia el “checkout” (mock): devuelve URL del simulador */
export const payments_init = onRequest(async (req: Request, res: Response): Promise<void> => {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderId: string = body.orderId || body.order_id;
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }
    // Limpia estado de pago previo (opcional)
    const db = ensureFirebase();
    await db.collection("orders").doc(orderId).set(
      {
        payment: null,
        paymentMode: "mock",
        updatedAt: Date.now()
      },
      { merge: true }
    );

    res.json({
      checkoutUrl: `/mockpay.html?orderId=${encodeURIComponent(orderId)}`
    });
  } catch (e: any) {
    console.error("payments_init error:", e);
    res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
  }
});

/** Confirma el pago (mock): guarda paid / rejected / canceled / error */
export const payments_confirm = onRequest(async (req: Request, res: Response): Promise<void> => {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderId: string = body.orderId || body.order_id;
    const scenario: string = body.scenario || "success";
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    const db = ensureFirebase();
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Order not found", orderId });
      return;
    }

    const updates: any = { paymentMode: "mock", updatedAt: Date.now() };
    switch (scenario) {
      case "success":
        updates.payment = "paid";
        updates.status  = "queued";     // entra a la cola para el operador
        break;
      case "insufficient":
        updates.payment = "rejected";
        updates.payment_reason = "insufficient_funds";
        updates.status  = "pending";
        break;
      case "canceled":
        updates.payment = "canceled";
        updates.status  = "pending";
        break;
      default:
        updates.payment = "error";
        updates.payment_reason = "technical_error";
        updates.status  = "pending";
        break;
    }

    await ref.set(updates, { merge: true });
    res.json({ ok: true, orderId, result: updates.payment, scenario });
  } catch (e: any) {
    console.error("payments_confirm error:", e);
    res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
  }
});

/** (Opcional / legacy) endpoint único usado antes — lo dejamos por compatibilidad */
export const payments = onRequest(async (req: Request, res: Response): Promise<void> => {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderId: string = body.orderId || body.order_id;
    const scenario: string = body.scenario || "success";
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    const db = ensureFirebase();
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Order not found", orderId });
      return;
    }

    const updates: any = { paymentMode: "mock", updatedAt: Date.now() };
    switch (scenario) {
      case "success":
        updates.payment = "paid";
        updates.status  = "queued";
        break;
      case "insufficient":
        updates.payment = "rejected";
        updates.payment_reason = "insufficient_funds";
        updates.status  = "pending";
        break;
      case "canceled":
        updates.payment = "canceled";
        updates.status  = "pending";
        break;
      default:
        updates.payment = "error";
        updates.payment_reason = "technical_error";
        updates.status  = "pending";
        break;
    }

    await ref.set(updates, { merge: true });
    res.json({ ok: true, orderId, result: updates.payment, scenario });
  } catch (e: any) {
    console.error("payments (legacy) error:", e);
    res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
  }
});
