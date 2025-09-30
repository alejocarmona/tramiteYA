"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.getOrderStatus = getOrderStatus;
const utils_js_1 = require("./utils.js");
/**
 * POST /orders
 * Crea una orden con esquema estable:
 *  - status = 'queued'
 *  - payment = { mode: 'mock'|'wompi', status: 'pending' }
 *  - delivery = { channel: null, fileUrl: null }
 */
async function createOrder(req, res) {
    const db = (0, utils_js_1.ensureFirebase)();
    // Payload
    const { service_id, form_data, contact } = (req.body || {});
    // Validaciones mínimas
    if (!service_id) {
        return res.status(400).json({ error: "service_id is required" });
    }
    if (!contact?.email || !contact?.phone) {
        return res
            .status(400)
            .json({ error: "contact.email and contact.phone are required" });
    }
    // Leer servicio
    const svcDoc = await db.collection("services").doc(String(service_id)).get();
    if (!svcDoc.exists) {
        return res.status(404).json({ error: "Service not found" });
    }
    // Normalizar servicio (evitar sobreescribir id)
    const svcData = svcDoc.data();
    const { id: _ignored, ...rest } = (svcData ?? {});
    const svc = { ...rest, id: svcDoc.id };
    // Precio: usa svc.price si existe; si no, construye con campos sueltos
    const price = svc.price ??
        {
            base: Number(svc.price_base ?? 0),
            fee: Number(svc.fee ?? 0),
            iva: Number(svc.iva ?? 0),
            total: Number(svc.total ??
                Number(svc.price_base ?? 0) +
                    Number(svc.fee ?? 0) +
                    Number(svc.iva ?? 0)),
        };
    // Flags: mock/wompi
    let flags = {};
    try {
        const fg = await db.collection("config").doc("public").get(); // CAMBIO: config/public
        flags = (fg.exists ? fg.data() : {}) || {};
    }
    catch { /* ignora errores de flags */ }
    const paymentMode = flags?.payments?.useMock === true ? "mock" : "wompi"; // CAMBIO: true = mock, false/undefined = wompi
    // ...existing code...
    // Construir orden con defaults robustos
    const now = new Date().toISOString();
    const ref = db.collection("orders").doc();
    const contactNorm = {
        email: String(contact?.email ?? ""),
        phone: String(contact?.phone ?? ""),
        name: contact?.name ? String(contact.name) : undefined,
    };
    const order = {
        id: ref.id,
        service_id: String(service_id),
        serviceName: svc.name || String(service_id),
        contact: contactNorm,
        form_data: form_data || {},
        price_breakdown: price,
        status: "queued",
        payment: { mode: paymentMode, status: "pending" },
        delivery: { channel: null, fileUrl: null },
        audit: { created_at: now, updated_at: now, actor: "user" },
    };
    await ref.set(order);
    // Front solo necesita el id inmediatamente; el resto lo consulta por GET
    return res.status(201).json({ id: order.id });
}
/**
 * GET /orders?id=ORDER_ID
 * Devuelve la orden normalizando:
 *  - payment como string (paid/pending/rejected/...)
 *  - delivery siempre objeto { channel|null, fileUrl|null }
 */
// ...existing code...
async function getOrderStatus(req, res) {
    try {
        const id = String(req.query.id || "").trim();
        if (!id)
            return res.status(400).json({ error: "id is required" });
        const snap = await (0, utils_js_1.ensureFirebase)().collection("orders").doc(id).get();
        if (!snap.exists)
            return res.status(404).json({ error: "Order not found" });
        const d = (snap.data() || {});
        const paymentStatus = d?.payment?.status ??
            (typeof d?.payment === "string" ? d.payment : "pending");
        const paymentMode = d?.payment?.mode ?? d?.paymentMode ?? null;
        return res.json({
            id: snap.id,
            serviceId: d.service_id ?? null,
            serviceName: d.serviceName ?? null,
            contact: d.contact ?? null,
            form_data: d.form_data ?? {},
            price_breakdown: d.price_breakdown ?? null,
            status: d.status ?? "queued",
            // Mantén objeto si existe → UI podrá mapear success/insufficient/canceled/error
            payment: (typeof d?.payment === "object") ? d.payment : paymentStatus,
            paymentMode,
            delivery: d.delivery ?? { channel: null, fileUrl: null },
            audit: d.audit ?? null,
        });
    }
    catch (e) {
        console.error("getOrderStatus error:", e);
        return res
            .status(500)
            .json({ error: "Internal error", detail: String(e?.message || e) });
    }
}
// ...existing code...
