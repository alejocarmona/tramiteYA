// functions/src/payments.ts
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import corsLib from "cors";
import crypto from "node:crypto";
import { ensureFirebase } from "./utils.js";

const cors = corsLib({ origin: true });

type PublicConfig = {
  payments?: { useMock?: boolean };
  wompi?: {
    publicKey?: string;          // ej: pub_test_...
    apiUrl?: string;             // ej: https://sandbox.wompi.co
    checkoutUrlBase?: string;    // ej: https://checkout.wompi.co/p/
  };
  app?: { returnUrl?: string };  // ej: http://127.0.0.1:5000/
};

type SecureFlags = {
  wompi?: {
    secretKey?: string;          // SK sandbox (S2S confirm)
    eventsSecret?: string;       // (opcional) para webhooks futuros
    integritySecret?: string;    // NUEVO: Secreto de integridad
  };
};

function ok(res: Response, data: any) { return res.status(200).json(data); }
function bad(res: Response, msg: string, code = 400) { return res.status(code).json({ error: msg }); }

async function readPublicConfig(db = ensureFirebase()): Promise<PublicConfig> {
  try {
    const snap = await db.collection("config").doc("public").get();
    return (snap.exists ? (snap.data() as PublicConfig) : {}) || {};
  } catch { return {}; }
}

async function readSecureFlags(db = ensureFirebase()): Promise<SecureFlags> {
  try {
    const snap = await db.collection("flags").doc("secure").get();
    return (snap.exists ? (snap.data() as SecureFlags) : {}) || {};
  } catch { return {}; }
}

function cents(n: number): number { return Math.round(Number(n || 0) * 100); }

function mapWompiStatus(s?: string) {
  const x = String(s || "").toUpperCase();
  if (x === "APPROVED") return { payment: "paid",      reason: null };
  if (x === "DECLINED") return { payment: "rejected",  reason: "declined" };
  if (x === "VOIDED")   return { payment: "canceled",  reason: "voided" };
  if (x === "ERROR")    return { payment: "error",     reason: "error" };
  return { payment: "pending", reason: "pending" };
}

/**
 * POST /payments_init
 * Body: { orderId: string }
 * Devuelve { mode: "wompi", checkoutUrl } o { mode: "mock" }
 */
export const payments_init = onRequest(async (req: Request, res: Response) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return bad(res, "Method Not Allowed", 405);

      const { orderId } = (req.body || {}) as { orderId?: string };
      if (!orderId) return bad(res, "orderId is required");

      const db  = ensureFirebase();
      const cfg = await readPublicConfig(db);

      // 👉 Usa mock SOLO si es true explícito
      console.log("[payments_init] useMock =", cfg?.payments?.useMock);
// ...existing code...
if (cfg?.payments?.useMock === true) {
   return ok(res, { mode: "mock", status: "pending" });
}
// ...existing code...


      // Lee orden para calcular monto
      const snap = await db.collection("orders").doc(orderId).get();
      if (!snap.exists) return bad(res, "Order not found", 404);
      const d = snap.data() as any;

      const amountInCents = cents(d?.price_breakdown?.total ?? 0);
      if (!amountInCents || amountInCents < 1) return bad(res, "Invalid amount for order");

      const publicKey    = cfg?.wompi?.publicKey || "";
      const checkoutBase = cfg?.wompi?.checkoutUrlBase || "https://checkout.wompi.co/p/";
      const returnUrl    = cfg?.app?.returnUrl || "";
      if (!publicKey) return bad(res, "Missing wompi.publicKey in config/public");
      if (!returnUrl) return bad(res, "Missing app.returnUrl in config/public");

      // Reference ÚNICA por intento
      const reference = `${orderId}-${Date.now()}`;
      const currency  = "COP";

      // Firma de integridad (si existe en flags/secure)
      const sec = await readSecureFlags(db);
      const integritySecret = sec?.wompi?.integritySecret || "";
// Arma query del checkout
const qs = new URLSearchParams({
  "public-key": publicKey,
  "amount-in-cents": String(amountInCents),
  currency,
  reference,
  "redirect-url": returnUrl,
});

// Si hay secreto de integridad, genera firma SHA256(reference + amount + currency + secret)
if (integritySecret) {
  const raw = `${reference}${amountInCents}${currency}${integritySecret}`;
  const signature = crypto.createHash("sha256").update(raw).digest("hex");
  qs.set("signature", signature);
}

      const checkoutUrl = `${checkoutBase}?${qs.toString()}`;


      // Marca la orden con modo/status esperado
      await snap.ref.set({
        payment: { ...(d?.payment || {}), mode: "wompi", status: "pending" },
        audit:   { ...(d?.audit || {}),   updated_at: new Date().toISOString() }
      }, { merge: true });

      return ok(res, { mode: "wompi", checkoutUrl });
    } catch (e: any) {
      console.error("payments_init error:", e);
      return res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
  });
});

/**
 * GET/POST /payments_confirm
 * Params: transactionId (preferido) o reference (orderId[-ts])
 * Verifica S2S y actualiza la orden.
 */
// ...existing code...
export const payments_confirm = onRequest(async (req: Request, res: Response) => {
  return cors(req, res, async () => {
    try {
      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "POST") return bad(res, "Method Not Allowed", 405);

      const q = method === "GET" ? req.query : req.body;
      const transactionId = String(q?.transactionId || q?.id || "").trim();
      const reference     = String(q?.reference || "").trim();

      const db  = ensureFirebase();
      const cfg = await readPublicConfig(db);
      const sec = await readSecureFlags(db);

      // --- MODO MOCK: aplicar escenario recibido ---
      if (cfg?.payments?.useMock === true) {
        const orderId = String(q?.orderId || "").trim();
        const scenarioRaw = String(q?.scenario || "").trim().toLowerCase();
        if (!orderId) return bad(res, "orderId is required in mock mode");
        const allowed = ["success","insufficient","canceled","error"];
        const scenario = allowed.includes(scenarioRaw) ? scenarioRaw : "success";

        const snap = await db.collection("orders").doc(orderId).get();
        if (!snap.exists) return bad(res, "Order not found", 404);
        const d = snap.data() || {};

        await snap.ref.set({
          payment: {
            ...(typeof d.payment === "object" ? d.payment : {}),
            mode: "mock",
            status: scenario
          },
          audit: { ...(d as any).audit, updated_at: new Date().toISOString() }
        }, { merge: true });

        return ok(res, { mode: "mock", status: scenario, orderId });
      }
      // ...existing code (flujo Wompi real)...
// ...existing code...

      const apiUrl    = cfg?.wompi?.apiUrl || "https://sandbox.wompi.co";
      const secretKey = sec?.wompi?.secretKey || "";
      if (!secretKey) return bad(res, "Missing wompi.secretKey in flags/secure");

      let txUrl = "";
      if (transactionId) {
        txUrl = `${apiUrl}/v1/transactions/${encodeURIComponent(transactionId)}`;
      } else if (reference) {
        txUrl = `${apiUrl}/v1/transactions?reference=${encodeURIComponent(reference)}`;
      } else {
        return bad(res, "transactionId or reference is required");
      }

      const resp = await fetch(txUrl, { headers: { Authorization: `Bearer ${secretKey}` } });
      const json = await resp.json();
      const tx = (json?.data && Array.isArray(json.data) ? json.data[0] : json?.data) || null;
      if (!tx) return bad(res, "Transaction not found in Wompi", 404);

      const { payment, reason } = mapWompiStatus(tx?.status);

      // Nuestra referencia es orderId-<ts> → extrae el orderId puro
      const refStr  = String(tx?.reference || reference || "").trim();
      const orderId = refStr.split("-")[0] || refStr;
      if (!orderId) return bad(res, "reference (orderId) missing in transaction");

      const snap = await db.collection("orders").doc(orderId).get();
      if (!snap.exists) return bad(res, "Order not found", 404);
      const d = snap.data() || {};

      await snap.ref.set({
        payment: (typeof d?.payment === "object")
          ? { ...(d as any).payment, status: payment, mode: "wompi" }
          : payment, // si el modelo original era string simple
        payment_reason: reason ?? null,
        audit: { ...(d as any)?.audit, updated_at: new Date().toISOString() }
      }, { merge: true });

      return ok(res, {
        orderId,
        transactionId: tx?.id ?? transactionId ?? null,
        status: payment
      });
    } catch (e: any) {
      console.error("payments_confirm error:", e);
      return res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
  });
});
