"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payments = exports.payments_confirm = exports.payments_init = void 0;
// functions/src/payments.ts
const https_1 = require("firebase-functions/v2/https");
const utils_1 = require("./utils");
/** CORS helper (permite POST desde Hosting :5000 hacia Functions :5001) */
function applyCors(req, res) {
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
exports.payments_init = (0, https_1.onRequest)(async (req, res) => {
    if (applyCors(req, res))
        return;
    try {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
        const orderId = body.orderId || body.order_id;
        if (!orderId) {
            res.status(400).json({ error: "Missing orderId" });
            return;
        }
        // Limpia estado de pago previo (opcional)
        const db = (0, utils_1.ensureFirebase)();
        await db.collection("orders").doc(orderId).set({
            payment: null,
            paymentMode: "mock",
            updatedAt: Date.now()
        }, { merge: true });
        res.json({
            checkoutUrl: `/mockpay.html?orderId=${encodeURIComponent(orderId)}`
        });
    }
    catch (e) {
        console.error("payments_init error:", e);
        res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
});
/** Confirma el pago (mock): guarda paid / rejected / canceled / error */
exports.payments_confirm = (0, https_1.onRequest)(async (req, res) => {
    if (applyCors(req, res))
        return;
    try {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
        const orderId = body.orderId || body.order_id;
        const scenario = body.scenario || "success";
        if (!orderId) {
            res.status(400).json({ error: "Missing orderId" });
            return;
        }
        const db = (0, utils_1.ensureFirebase)();
        const ref = db.collection("orders").doc(orderId);
        const snap = await ref.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Order not found", orderId });
            return;
        }
        const updates = { paymentMode: "mock", updatedAt: Date.now() };
        switch (scenario) {
            case "success":
                updates.payment = "paid";
                updates.status = "queued"; // entra a la cola para el operador
                break;
            case "insufficient":
                updates.payment = "rejected";
                updates.payment_reason = "insufficient_funds";
                updates.status = "pending";
                break;
            case "canceled":
                updates.payment = "canceled";
                updates.status = "pending";
                break;
            default:
                updates.payment = "error";
                updates.payment_reason = "technical_error";
                updates.status = "pending";
                break;
        }
        await ref.set(updates, { merge: true });
        res.json({ ok: true, orderId, result: updates.payment, scenario });
    }
    catch (e) {
        console.error("payments_confirm error:", e);
        res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
});
/** (Opcional / legacy) endpoint único usado antes — lo dejamos por compatibilidad */
exports.payments = (0, https_1.onRequest)(async (req, res) => {
    if (applyCors(req, res))
        return;
    try {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
        const orderId = body.orderId || body.order_id;
        const scenario = body.scenario || "success";
        if (!orderId) {
            res.status(400).json({ error: "Missing orderId" });
            return;
        }
        const db = (0, utils_1.ensureFirebase)();
        const ref = db.collection("orders").doc(orderId);
        const snap = await ref.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Order not found", orderId });
            return;
        }
        const updates = { paymentMode: "mock", updatedAt: Date.now() };
        switch (scenario) {
            case "success":
                updates.payment = "paid";
                updates.status = "queued";
                break;
            case "insufficient":
                updates.payment = "rejected";
                updates.payment_reason = "insufficient_funds";
                updates.status = "pending";
                break;
            case "canceled":
                updates.payment = "canceled";
                updates.status = "pending";
                break;
            default:
                updates.payment = "error";
                updates.payment_reason = "technical_error";
                updates.status = "pending";
                break;
        }
        await ref.set(updates, { merge: true });
        res.json({ ok: true, orderId, result: updates.payment, scenario });
    }
    catch (e) {
        console.error("payments (legacy) error:", e);
        res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
});
