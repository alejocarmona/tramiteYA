// functions/src/payments.ts
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import corsLib from "cors";
import crypto from "node:crypto";
import { ensureFirebase } from "./utils.js";
import type { Firestore } from "firebase-admin/firestore"; // ← agrega esto


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

// ...existing code...



//async function computeAmountInCents(db: FirebaseFirestore.Firestore, orderId: string): Promise<number> {
  async function computeAmountInCents(db: Firestore, orderId: string): Promise<number> {

  try {
    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) {
      console.warn("[computeAmountInCents] order not found, fallback 10000");
      return 10000;
    }
    const d: any = snap.data() || {};

    // 1) price_breakdown.total (en pesos)
    if (d?.price_breakdown?.total) {
      const v = Number(d.price_breakdown.total);
      if (!isNaN(v) && v > 0) return Math.round(v * 100);
    }

    // 2) Sumar items (si existen) (qty * unit)
    if (Array.isArray(d?.price_breakdown?.items)) {
      const sum = d.price_breakdown.items.reduce((acc: number, it: any) => {
        const qty  = Number(it?.qty || 1);
        const unit = Number(it?.unit || it?.price || 0);
        if (!isNaN(qty) && !isNaN(unit)) return acc + (qty * unit);
        return acc;
      }, 0);
      if (sum > 0) return Math.round(sum * 100);
    }

    // 3) Campo directo price / amount si existiera
    if (d?.price) {
      const p = Number(d.price);
      if (!isNaN(p) && p > 0) return Math.round(p * 100);
    }

    // Fallback
    return 10000; // 100 COP (ajusta según tu caso)
  } catch (e) {
    console.error("[computeAmountInCents] error", e);
    return 10000;
  }
}


async function readSecureFlags(db = ensureFirebase()): Promise<SecureFlags> {
  try {
    const snap = await db.collection("flags").doc("secure").get();
    let data: any = snap.exists ? snap.data() : {};

    // Aceptar forma legacy: campos sueltos en top-level
    if (data && !data.wompi) {
      if (data.integritySecret || data.secretKey) {
        data.wompi = {
          integritySecret: data.integritySecret,
          secretKey: data.secretKey
        };
      }
    }

    // Fallback: config/secure
    if (!data?.wompi?.integritySecret || !data?.wompi?.secretKey) {
        const alt = await db.collection("config").doc("secure").get();
        if (alt.exists) {
          const altData: any = alt.data();
            if (altData?.wompi) {
              data.wompi = { ...(data.wompi || {}), ...altData.wompi };
              console.log("[readSecureFlags] merge desde config/secure");
            }
        }
    }

    return data || {};
  } catch (e) {
    console.warn("[readSecureFlags] error", e);
    return {};
  }
}

// ...existing code (antes de usar sec en payments_init) añade un log:
// Mueve este log dentro de payments_init después de definir sec

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
// ...existing code...
export const payments_init = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const db  = ensureFirebase();
      const cfg = await readPublicConfig(db); // contiene wompi.publicKey, apiUrl, app.returnUrl
      const sec = await readSecureFlags(db);  // contiene wompi.secretKey, integritySecret
      console.log("[payments_init] secure wompi keys =", Object.keys(sec?.wompi || {}));

      if (cfg?.payments?.useMock === true) {
        return ok(res, { mode: "mock", status: "pending" });
      }

      const publicKey  = cfg?.wompi?.publicKey || "";
      const apiUrl     = cfg?.wompi?.apiUrl || "https://sandbox.wompi.co";
      let returnUrl    = cfg?.app?.returnUrl || "";
      if (!returnUrl) return bad(res, "returnUrl missing in config.public.app.returnUrl");
      // Normaliza (añade return.html si falta)
      if (!/return\.html$/i.test(returnUrl)) {
        if (!returnUrl.endsWith("/")) returnUrl += "/";
        returnUrl += "return.html";
      }

      const orderId = String(req.body?.orderId || req.query?.orderId || "").trim();
      if (!orderId) return bad(res, "orderId required");
      // reference único (timestamp + aleatorio corto para evitar duplicación)
      const suffix = Date.now() + "-" + Math.floor(Math.random() * 1e5).toString(36);
      const reference = `${orderId}-${suffix}`.slice(0, 64);

try {
        const u = new URL(returnUrl);
        u.searchParams.set("ref", reference);
        returnUrl = u.toString();
      } catch { /* ignora si falla parse */ }

// ...existing code...


// ...existing code (appendDebug etc)...
      

      // Mapea monto (ejemplo: suma breakdown si existe)
      const amountInCents = await computeAmountInCents(db, orderId); // implementa o reemplaza
      const currency = "COP";

      const integritySecret = sec?.wompi?.integritySecret || "";
      const skipSignature = (req.query?.skipSignature === "1") || (req.query?.debug === "1");

      const qs = new URLSearchParams({
        "public-key": publicKey,
        "amount-in-cents": String(amountInCents),
        currency,
        reference,
        "redirect-url": appendDebug(returnUrl, req.query?.debug ? "1" : "")
      });

// ...existing code...
      if (integritySecret && !skipSignature) {
        const raw = `${reference}${amountInCents}${currency}${integritySecret}`;
        const signature = crypto.createHash("sha256").update(raw).digest("hex");
        // CAMBIO: Wompi espera el parámetro 'signature:integrity'
        // qs.set("signature", signature);
        qs.set("signature:integrity", signature);
        console.log("🔐 [payments_init] Generando firma de integridad:");
        console.log("  - reference:", reference);
        console.log("  - amount:", amountInCents);
        console.log("  - currency:", currency);
        console.log("  - integritySecret presente:", integritySecret ? "SÍ (" + integritySecret.substring(0, 10) + "...)" : "NO");
        console.log("  - toSign:", raw);
        console.log("  - hash generado:", signature);
      } else {
        console.warn("⚠️ [payments_init] signature OMITIDA (integritySecret vacío o skipSignature)");
        if (!integritySecret) console.error("❌ integritySecret NO está configurado en flags/secure");
      }
// ...existing code...

      console.log("[payments_init] built checkout params", {
        reference,
        amountInCents,
        currency,
        returnUrl,
        skipSignature
      });

      const checkoutUrlBase = cfg?.wompi?.checkoutUrlBase || "https://checkout.wompi.co/p/";
      const checkoutUrl = `${checkoutUrlBase}?${qs.toString()}`;

      // Validar URL antes de retornar
      console.log("✅ [payments_init] URL completa generada:", checkoutUrl);
      if (!checkoutUrl.includes("signature%3Aintegrity") && !checkoutUrl.includes("signature:integrity")) {
        console.error("❌ La firma de integridad NO se agregó a la URL");
        return bad(res, "Error de configuración: firma de integridad faltante. Verifica flags/secure en Firebase.", 500);
      }

      return ok(res, {
        mode: "wompi",
        checkoutUrl,
        reference,
        orderId
      });

    } catch (e: any) {
      console.error("[payments_init] error", e);
      return bad(res, String(e?.message || e), 500);
    }
  });
});

// Utilidades locales (añade al final del archivo o en helpers)
function appendDebug(url: string, dbg: string) {
  if (!dbg) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("debug", dbg);
    return u.toString();
  } catch { return url + (url.includes("?") ? "&" : "?") + "debug=" + dbg; }
}
// ...existing code...

/**
 * GET/POST /payments_confirm
 * Params: transactionId (preferido) o reference (orderId[-ts])
 * Verifica S2S y actualiza la orden.
 */
// ...existing code...
// ...existing code...
export const payments_confirm = onRequest(async (req: Request, res: Response) => {
  return cors(req, res, async () => {
    try {
      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "POST") return bad(res, "Method Not Allowed", 405);

      const q      = method === "GET" ? req.query : req.body;
      const transactionIdRaw = String(q?.transactionId || q?.id || "").trim();
      // Aceptar 'ref' como alias
      const reference        = String(q?.reference || q?.ref || "").trim();
      const orderIdBody      = String(q?.orderId || "").trim();

      if (!transactionIdRaw && !reference && !orderIdBody) {
        return bad(res, "transactionId or reference or orderId required", 400);
      }

      const db  = ensureFirebase();
      const cfg = await readPublicConfig(db);
      const sec = await readSecureFlags(db);

// FIX: API base correcta
      // Normaliza base del API (host correcto y sin /v1 duplicado)
      const rawApi  = cfg?.wompi?.apiUrl || "https://api-sandbox.wompi.co";
      const apiBase = rawApi.replace(/\/+$/,"").replace(/\/v1$/,""); // ← quita sufijo /v1
      const secretKey = sec?.wompi?.secretKey || "";
      if (!secretKey) return bad(res, "Missing wompi.secretKey (secure flags)", 500);

      const transactionId = transactionIdRaw;
      console.log("[payments_confirm] txId =", transactionId || "(none)", "reference =", reference || "(none)");
      console.log("[payments_confirm] apiBase =", apiBase);

      let tx: any = null;

      if (!transactionId && reference) {
        const byRef = `${apiBase}/v1/transactions?reference=${encodeURIComponent(reference)}`;
        console.log("[payments_confirm] fetch by reference", byRef);
        const r2 = await fetch(byRef, { headers: { Authorization: `Bearer ${secretKey}` } });
        const b2 = await r2.json().catch(()=>null);
        if (r2.ok && Array.isArray(b2?.data) && b2.data.length) {
          tx = b2.data[0];
        } else {
          return bad(res, "Transaction not found in Wompi", 404);
        }
      } else {
        const txUrl = `${apiBase}/v1/transactions/${encodeURIComponent(transactionId)}`;
        console.log("[payments_confirm] fetch", txUrl);
        const resp = await fetch(txUrl, { headers: { Authorization: `Bearer ${secretKey}` } });
        const body = await resp.json().catch(()=>null);

        if (resp.status === 404 && reference) {
          console.warn("[payments_confirm] 404 by id, fallback by reference:", reference);
          const byRef = `${apiBase}/v1/transactions?reference=${encodeURIComponent(reference)}`;
          const r2 = await fetch(byRef, { headers: { Authorization: `Bearer ${secretKey}` } });
          const b2 = await r2.json().catch(()=>null);
          if (r2.ok && Array.isArray(b2?.data) && b2.data.length) {
            tx = b2.data[0];
          } else {
            return bad(res, "Transaction not found in Wompi", 404);
          }
        } else if (!resp.ok) {
          console.error("[payments_confirm] non-ok wompi response", resp.status, body);
          return bad(res, `Wompi fetch failed (${resp.status})`, 502);
        } else {
          tx = (Array.isArray(body?.data) ? body.data[0] : body?.data) || null;
        }
      }
      
      if (!tx || !tx.id) {
        console.error("[payments_confirm] invalid Wompi payload", tx);
        return bad(res, "Invalid Wompi response", 502);
      }

      const mapped = mapWompiStatus(tx.status);
      const derivedOrderId =
        orderIdBody ||
        (tx.reference ? String(tx.reference).split("-")[0] : "") ||
        (reference ? reference.split("-")[0] : "");

      if (!derivedOrderId) {
        return ok(res, { mode: "wompi", transactionId: tx.id, status: mapped.payment, detail: "Order id not derivable" });
      }

      const orderRef = db.collection("orders").doc(derivedOrderId);
      const snap = await orderRef.get();
      if (!snap.exists) {
        console.warn("[payments_confirm] order not found to update", derivedOrderId);
        return ok(res, { mode: "wompi", transactionId: tx.id, status: mapped.payment, orderId: derivedOrderId, detail: "Order not found to update" });
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
// ...existing code...