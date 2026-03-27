import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";

// Inicializar a nivel de módulo — necesario para triggers de Firestore
// que corren en un worker aislado donde ensureFirebase() no funciona.
if (!getApps().length) initializeApp();
const db = getFirestore();

/**
 * Firestore trigger: notifica al admin por email cuando una orden pasa a payment.status === "paid".
 * Idempotente: solo dispara en la transición (before !== "paid" → after === "paid").
 */
export const onOrderPaymentPaid = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const prevStatus = before.payment?.status ?? (typeof before.payment === "string" ? before.payment : "");
  const newStatus = after.payment?.status ?? (typeof after.payment === "string" ? after.payment : "");

  if (prevStatus === "paid" || newStatus !== "paid") return;

  const orderId = event.params.orderId;
  console.log("[onOrderPaymentPaid] Pago aprobado para orden:", orderId);

  // Leer config de email
  const adminSnap = await db.collection("config").doc("admin").get();
  if (!adminSnap.exists) {
    console.warn("[onOrderPaymentPaid] config/admin no existe");
    return;
  }

  const adminData = adminSnap.data() as any;
  const { notifyEmail, gmailUser, gmailAppPassword } = adminData;

  if (!notifyEmail || !gmailUser || !gmailAppPassword) {
    console.warn("[onOrderPaymentPaid] Faltan campos en config/admin (notifyEmail, gmailUser, gmailAppPassword)");
    return;
  }

  const contact = after.contact || {};
  const price = after.price_breakdown || {};
  const serviceName = after.serviceName || after.service_id || "Trámite";
  const fmtCOP = (n: number) => "$" + (n || 0).toLocaleString("es-CO");

  const htmlBody = `
    <div style="font-family:system-ui,Arial;max-width:600px;margin:0 auto;">
      <h2 style="color:#16a34a;">Nuevo pago aprobado</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Orden</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${orderId}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Tramite</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${serviceName}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Cliente</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${contact.name || "—"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Email</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${contact.email || "—"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Telefono</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${contact.phone || "—"}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Total</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#16a34a;">${fmtCOP(price.total)}</td></tr>
      </table>
      <p style="font-size:0.85rem;"><a href="https://apptramiteya.web.app/admin.html" style="color:#2563eb;text-decoration:underline;">Subir certificado desde Admin</a></p>
    </div>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"TramiteYA" <${gmailUser}>`,
      to: notifyEmail,
      subject: `Pago aprobado - ${serviceName} (Orden ${orderId.slice(0, 8)})`,
      html: htmlBody,
    });

    console.log("[onOrderPaymentPaid] Email enviado a", notifyEmail);
  } catch (e) {
    console.error("[onOrderPaymentPaid] Error enviando email:", e);
  }
});
