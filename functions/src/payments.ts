// functions/src/payments.ts
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import corsLib from "cors";
import crypto from "node:crypto";
import { ensureFirebase } from "./utils.js";
import type { Firestore } from "firebase-admin/firestore";
import type { PaymentsConfig, WompiEnvConfig } from "./types.js";

const cors = corsLib({ origin: true });

function ok(res: Response, data: any) { return res.status(200).json(data); }
function bad(res: Response, msg: string, code = 400) { return res.status(code).json({ error: msg }); }

// --- Lectura unificada de config de pagos ---

async function readPaymentsConfig(db: Firestore): Promise<PaymentsConfig | null> {
  try {
    const snap = await db.collection("config").doc("payments").get();
    if (!snap.exists) return null;
    return snap.data() as PaymentsConfig;
  } catch (e) {
    console.error("[readPaymentsConfig] error", e);
    return null;
  }
}

function getActiveEnv(config: PaymentsConfig | null): { env: string; wompi: WompiEnvConfig | null } {
  if (!config) return { env: "mock", wompi: null };
  const env = config.activeEnv || "mock";
  if (env === "mock") return { env, wompi: null };
  const wompi = config.environments?.[env as "test" | "prod"] || null;
  return { env, wompi };
}

// --- Helpers ---

async function computeAmountInCents(db: Firestore, orderId: string): Promise<number> {
  try {
    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) {
      console.warn("[computeAmountInCents] order not found, fallback 10000");
      return 10000;
    }
    const d: any = snap.data() || {};

    if (d?.price_breakdown?.total) {
      const v = Number(d.price_breakdown.total);
      if (!isNaN(v) && v > 0) return Math.round(v * 100);
    }

    if (Array.isArray(d?.price_breakdown?.items)) {
      const sum = d.price_breakdown.items.reduce((acc: number, it: any) => {
        const qty  = Number(it?.qty || 1);
        const unit = Number(it?.unit || it?.price || 0);
        if (!isNaN(qty) && !isNaN(unit)) return acc + (qty * unit);
        return acc;
      }, 0);
      if (sum > 0) return Math.round(sum * 100);
    }

    if (d?.price) {
      const p = Number(d.price);
      if (!isNaN(p) && p > 0) return Math.round(p * 100);
    }

    return 10000;
  } catch (e) {
    console.error("[computeAmountInCents] error", e);
    return 10000;
  }
}

function mapWompiStatus(s?: string) {
  const x = String(s || "").toUpperCase();
  if (x === "APPROVED") return { payment: "paid",      reason: null };
  if (x === "DECLINED") return { payment: "rejected",  reason: "declined" };
  if (x === "VOIDED")   return { payment: "canceled",  reason: "voided" };
  if (x === "ERROR")    return { payment: "error",     reason: "error" };
  return { payment: "pending", reason: "pending" };
}

function appendDebug(url: string, dbg: string) {
  if (!dbg) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("debug", dbg);
    return u.toString();
  } catch { return url + (url.includes("?") ? "&" : "?") + "debug=" + dbg; }
}

// --- POST /payments_init ---

export const payments_init = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const db = ensureFirebase();
      const config = await readPaymentsConfig(db);
      const { env, wompi } = getActiveEnv(config);

      console.log("[payments_init] activeEnv =", env);

      // Mock: retorna inmediatamente
      if (env === "mock" || !wompi) {
        const reason = !config ? "config_missing" : !wompi ? "wompi_config_missing" : undefined;
        if (reason) console.warn("[payments_init]", reason, "→ usando mock");
        return ok(res, { mode: "mock", status: "pending", ...(reason ? { reason } : {}) });
      }

      // Validar config mínima de Wompi
      if (!wompi.publicKey || !wompi.integritySecret || !wompi.returnUrl) {
        console.warn("[payments_init] Config Wompi incompleta para env:", env);
        return ok(res, { mode: "mock", status: "pending", reason: "wompi_config_incomplete" });
      }

      const orderId = String(req.body?.orderId || req.query?.orderId || "").trim();
      if (!orderId) return bad(res, "orderId required");

      // Reference único
      const suffix = Date.now() + "-" + Math.floor(Math.random() * 1e5).toString(36);
      const reference = `${orderId}-${suffix}`.slice(0, 64);

      // Return URL con reference
      let returnUrl = wompi.returnUrl;
      if (!/return\.html$/i.test(returnUrl)) {
        if (!returnUrl.endsWith("/")) returnUrl += "/";
        returnUrl += "return.html";
      }
      try {
        const u = new URL(returnUrl);
        u.searchParams.set("ref", reference);
        returnUrl = u.toString();
      } catch { /* ignora */ }

      // Monto
      const amountInCents = await computeAmountInCents(db, orderId);
      const currency = "COP";

      // Query params para checkout
      const qs = new URLSearchParams({
        "public-key": wompi.publicKey,
        "amount-in-cents": String(amountInCents),
        currency,
        reference,
        "redirect-url": appendDebug(returnUrl, req.query?.debug ? "1" : "")
      });

      // Firma de integridad
      const raw = `${reference}${amountInCents}${currency}${wompi.integritySecret}`;
      const signature = crypto.createHash("sha256").update(raw).digest("hex");
      qs.set("signature:integrity", signature);

      console.log("[payments_init] firma generada para ref:", reference, "amount:", amountInCents);

      const checkoutUrlBase = wompi.checkoutUrlBase || "https://checkout.wompi.co/p/";
      const checkoutUrl = `${checkoutUrlBase}?${qs.toString()}`;

      // Validar que la firma está en la URL
      if (!checkoutUrl.includes("signature%3Aintegrity") && !checkoutUrl.includes("signature:integrity")) {
        console.error("[payments_init] firma NO presente en URL");
        return bad(res, "Error generando URL de pago. Contacta soporte.", 500);
      }

      return ok(res, { mode: "wompi", checkoutUrl, reference, orderId });

    } catch (e: any) {
      console.error("[payments_init] error", e);
      return bad(res, String(e?.message || e), 500);
    }
  });
});

// --- GET/POST /payments_confirm ---

export const payments_confirm = onRequest(async (req: Request, res: Response) => {
  return cors(req, res, async () => {
    try {
      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "POST") return bad(res, "Method Not Allowed", 405);

      const q = method === "GET" ? req.query : req.body;
      const transactionId = String(q?.transactionId || q?.id || "").trim();
      const reference     = String(q?.reference || q?.ref || "").trim();
      const orderIdBody   = String(q?.orderId || "").trim();

      // Mock: auto-confirmar sin Wompi
      if (q?.scenario || orderIdBody) {
        const db = ensureFirebase();
        const config = await readPaymentsConfig(db);
        const { env } = getActiveEnv(config);

        if (env === "mock" || q?.scenario) {
          const oid = orderIdBody || (reference ? reference.split("-")[0] : "");
          if (oid) {
            const scenario = String(q?.scenario || "success");
            const mockStatus = scenario === "success" ? "paid"
              : scenario === "insufficient" ? "rejected"
              : scenario === "canceled" ? "canceled"
              : "error";
            await db.collection("orders").doc(oid).set({
              payment: { mode: "mock", status: mockStatus, updatedAt: new Date().toISOString() },
              audit: { updated_at: new Date().toISOString() }
            }, { merge: true });
            return ok(res, { mode: "mock", orderId: oid, status: mockStatus });
          }
        }
      }

      if (!transactionId && !reference && !orderIdBody) {
        return bad(res, "transactionId or reference or orderId required", 400);
      }

      const db = ensureFirebase();
      const config = await readPaymentsConfig(db);
      const { wompi } = getActiveEnv(config);

      if (!wompi?.secretKey) return bad(res, "Configuración de pagos incompleta (secretKey)", 500);
      if (!wompi?.apiUrl) return bad(res, "Configuración de pagos incompleta (apiUrl)", 500);

      const apiBase = wompi.apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      const secretKey = wompi.secretKey;

      console.log("[payments_confirm] txId =", transactionId || "(none)", "reference =", reference || "(none)");

      let tx: any = null;

      // Buscar transacción en Wompi
      if (!transactionId && reference) {
        const byRef = `${apiBase}/v1/transactions?reference=${encodeURIComponent(reference)}`;
        const r2 = await fetch(byRef, { headers: { Authorization: `Bearer ${secretKey}` } });
        const b2 = await r2.json().catch(() => null);
        if (r2.ok && Array.isArray(b2?.data) && b2.data.length) {
          tx = b2.data[0];
        } else {
          return bad(res, "Transaction not found in Wompi", 404);
        }
      } else if (transactionId) {
        const txUrl = `${apiBase}/v1/transactions/${encodeURIComponent(transactionId)}`;
        const resp = await fetch(txUrl, { headers: { Authorization: `Bearer ${secretKey}` } });
        const body = await resp.json().catch(() => null);

        if (resp.status === 404 && reference) {
          const byRef = `${apiBase}/v1/transactions?reference=${encodeURIComponent(reference)}`;
          const r2 = await fetch(byRef, { headers: { Authorization: `Bearer ${secretKey}` } });
          const b2 = await r2.json().catch(() => null);
          if (r2.ok && Array.isArray(b2?.data) && b2.data.length) {
            tx = b2.data[0];
          } else {
            return bad(res, "Transaction not found in Wompi", 404);
          }
        } else if (!resp.ok) {
          return bad(res, `Wompi fetch failed (${resp.status})`, 502);
        } else {
          tx = (Array.isArray(body?.data) ? body.data[0] : body?.data) || null;
        }
      }

      if (!tx || !tx.id) {
        return bad(res, "Invalid Wompi response", 502);
      }

      const mapped = mapWompiStatus(tx.status);
      const derivedOrderId =
        orderIdBody ||
        (tx.reference ? String(tx.reference).split("-")[0] : "") ||
        (reference ? reference.split("-")[0] : "");

      if (!derivedOrderId) {
        return ok(res, { mode: "wompi", transactionId: tx.id, status: mapped.payment });
      }

      const orderRef = db.collection("orders").doc(derivedOrderId);
      const snap = await orderRef.get();
      if (!snap.exists) {
        return ok(res, { mode: "wompi", transactionId: tx.id, status: mapped.payment, orderId: derivedOrderId });
      }

      await orderRef.set({
        payment: {
          mode: "wompi",
          status: mapped.payment,
          rawStatus: String(tx.status || "").toUpperCase(),
          txId: tx.id,
          reference: tx.reference || null,
          updatedAt: new Date().toISOString()
        },
        audit: { ...(snap.data() as any)?.audit, updated_at: new Date().toISOString() }
      }, { merge: true });

      return ok(res, { mode: "wompi", orderId: derivedOrderId, transactionId: tx.id, status: mapped.payment });
    } catch (e: any) {
      console.error("[payments_confirm] error", e);
      return bad(res, String(e?.message || e), 500);
    }
  });
});
