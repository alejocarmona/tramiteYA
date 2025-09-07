"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.getOrderStatus = getOrderStatus;
const utils_js_1 = require("./utils.js");
async function createOrder(req, res) {
    const db = (0, utils_js_1.ensureFirebase)();
    const { service_id, form_data, contact } = req.body || {};
    if (!service_id)
        return res.status(400).json({ error: 'service_id is required' });
    if (!contact?.email || !contact?.phone)
        return res.status(400).json({ error: 'contact.email and contact.phone are required' });
    // Lee servicio
    const svcDoc = await db.collection('services').doc(String(service_id)).get();
    if (!svcDoc.exists)
        return res.status(404).json({ error: 'Service not found' });
    // evita sobrescribir id si el doc tuviera un campo id
    const data = svcDoc.data();
    const { id: _ignored, ...rest } = (data ?? {});
    const svc = { ...rest, id: svcDoc.id };
    // Calcula precio desde el servicio (parametrizado)
    const price = svc.price;
    // Flags (para saber si usamos mock)
    const flagsDoc = await db.collection('flags').doc('global').get();
    const flags = (flagsDoc.exists ? flagsDoc.data() : { payments: { useMock: true } });
    const now = new Date().toISOString();
    const ref = db.collection('orders').doc();
    const order = {
        id: ref.id,
        service_id: svc.id,
        contact: { email: String(contact.email), phone: String(contact.phone) },
        form_data: form_data || {},
        price_breakdown: price,
        payment: { mode: flags.payments?.useMock ? 'mock' : 'wompi', status: 'pending' },
        status: 'pending',
        audit: { created_at: now, updated_at: now, actor: 'user' }
    };
    await ref.set(order);
    return res.status(201).json({ id: order.id, paymentMode: order.payment.mode });
}
async function getOrderStatus(req, res) {
    try {
        const id = String(req.query.id || "").trim();
        if (!id)
            return res.status(400).json({ error: "Missing id" });
        const db = (0, utils_js_1.ensureFirebase)();
        const snap = await db.collection("orders").doc(id).get();
        if (!snap.exists)
            return res.status(404).json({ error: "Order not found", id });
        const d = snap.data() || {};
        // Enviamos también los campos relevantes de pago
        return res.json({
            id,
            status: d.status || "pending",
            delivery: d.delivery ?? null,
            // ---- NUEVO: campos de pago que necesita el front ----
            payment: d.payment ?? (d.payment?.status ?? null),
            payment_reason: d.payment_reason ?? null,
            paymentMode: d.paymentMode ?? null,
            // -----------------------------------------------------
        });
    }
    catch (e) {
        console.error("getOrderStatus error:", e);
        return res.status(500).json({ error: "Internal error", detail: String(e?.message || e) });
    }
}
