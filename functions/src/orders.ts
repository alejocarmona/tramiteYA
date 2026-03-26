// functions/src/orders.ts
import { Request, Response } from "express";
import { ensureFirebase } from "./utils.js";
import { Order, Price, Service } from "./types.js";

/**
 * POST /orders
 * Crea una orden con esquema estable:
 *  - status = 'queued'
 *  - payment = { mode: 'mock'|'wompi', status: 'pending' }
 *  - delivery = { channel: null, fileUrl: null }
 */
export async function createOrder(req: Request, res: Response) {
  const db = ensureFirebase();

  // Payload
  const { service_id, form_data, contact } = (req.body || {}) as {
    service_id?: string;
    form_data?: Record<string, unknown>;
    contact?: { email?: string; phone?: string; name?: string };
  };

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
  const svcData = svcDoc.data() as Partial<Service> | undefined;
  const { id: _ignored, ...rest } =
    (svcData ?? {}) as Record<string, unknown>;
  const svc: Service = { ...(rest as Omit<Service, "id">), id: svcDoc.id } as Service;

  // Precio: usa svc.price si existe; si no, construye con campos sueltos
  const price: Price =
    (svc as any).price ??
    ({
      base: Number((svc as any).price_base ?? 0),
      fee: Number((svc as any).fee ?? 0),
      iva: Number((svc as any).iva ?? 0),
      total: Number(
        (svc as any).total ??
          Number((svc as any).price_base ?? 0) +
            Number((svc as any).fee ?? 0) +
            Number((svc as any).iva ?? 0)
      ),
    } as Price);

// Leer ambiente de pagos desde config/payments
let paymentMode: "mock" | "wompi" = "mock";
try {
  const pcSnap = await db.collection("config").doc("payments").get();
  const pc = pcSnap.exists ? pcSnap.data() : null;
  const activeEnv = pc?.activeEnv || "mock";
  paymentMode = activeEnv === "mock" ? "mock" : "wompi";
} catch { /* default mock */ }

  // Construir orden con defaults robustos
  const now = new Date().toISOString();
  const ref = db.collection("orders").doc();

const contactNorm = {
  email: String(contact?.email ?? ""),
  phone: String(contact?.phone ?? ""),
  name:  contact?.name ? String(contact.name) : undefined,
};


type OrderDoc = {
  id: string;
  service_id: string;
  serviceName?: string;
  contact: { email: string; phone: string; name?: string };
  form_data: Record<string, unknown>;
  price_breakdown: Price;
  status: string;
  payment: { mode: "mock" | "wompi"; status: string } | string;
  delivery: { channel: string | null; fileUrl: string | null };
  audit: { created_at: string; updated_at: string; actor: string };
};

const order: OrderDoc 
 = {
    id: ref.id,
    service_id: String(service_id),
    serviceName: (svc as any).name || String(service_id),
    contact: contactNorm,
    form_data: (form_data as Record<string, unknown>) || {},
    price_breakdown: price,
    status: "queued",
    payment: { mode: paymentMode as "mock" | "wompi", status: "pending" },
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
export async function getOrderStatus(req: Request, res: Response) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const snap = await ensureFirebase().collection("orders").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found" });

    const d = (snap.data() || {}) as any;
    const paymentStatus =
      d?.payment?.status ??
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
  } catch (e: any) {
    console.error("getOrderStatus error:", e);
    return res
      .status(500)
      .json({ error: "Internal error", detail: String(e?.message || e) });
  }
}
// ...existing code...
