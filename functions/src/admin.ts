import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import corsLib from "cors";
import nodemailer from "nodemailer";
import { ensureFirebase } from "./utils.js";
import { getStorage } from "firebase-admin/storage";

const cors = corsLib({ origin: true });

function ok(res: Response, data: any) { return res.status(200).json(data); }
function bad(res: Response, msg: string, code = 400) { return res.status(code).json({ error: msg }); }

/**
 * POST /admin_upload
 * Sube un certificado (base64) a Firebase Storage y marca la orden como "delivered".
 *
 * Headers:  Authorization: Bearer <uploadSecret>
 * Body:     { orderId, fileBase64, fileName?, contentType? }
 */
export const admin_upload = onRequest(async (req: Request, res: Response) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return bad(res, "Method Not Allowed", 405);

      const db = ensureFirebase();

      // --- Auth: verificar secret contra config/admin.uploadSecret ---
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!token) return bad(res, "Authorization header required", 401);

      const adminSnap = await db.collection("config").doc("admin").get();
      const uploadSecret = adminSnap.exists ? adminSnap.get("uploadSecret") : null;
      if (!uploadSecret || token !== uploadSecret) {
        return bad(res, "Invalid credentials", 403);
      }

      // --- Parsear body ---
      const { orderId, fileBase64, fileName, contentType } = req.body || {};
      if (!orderId) return bad(res, "orderId is required");
      if (!fileBase64) return bad(res, "fileBase64 is required");

      // Verificar que la orden existe
      const orderRef = db.collection("orders").doc(String(orderId));
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) return bad(res, "Order not found", 404);

      // --- Subir a Storage ---
      const bucket = getStorage().bucket();
      const safeName = String(fileName || "certificado.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `certificates/${orderId}/${safeName}`;
      const file = bucket.file(filePath);

      const buffer = Buffer.from(fileBase64, "base64");
      await file.save(buffer, {
        metadata: {
          contentType: contentType || "application/pdf",
          cacheControl: "public, max-age=31536000",
        },
      });

      // URL de descarga pública (formato Firebase Storage, funciona con buckets nuevos y viejos)
      const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
      let fileUrl: string;
      if (emulatorHost) {
        // Emulador: URL local
        fileUrl = `http://${emulatorHost}/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
      } else {
        // Producción: hacer público y usar URL de Firebase Storage
        await file.makePublic();
        fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
      }

      // --- Actualizar orden ---
      const now = new Date().toISOString();
      await orderRef.set({
        status: "delivered",
        delivery: {
          channel: "download",
          fileUrl,
        },
        audit: {
          ...(orderSnap.data() as any)?.audit,
          updated_at: now,
          actor: "operator",
        },
      }, { merge: true });

      console.log("[admin_upload] Certificado subido para orden:", orderId, "→", fileUrl);

      // --- Notificar al cliente por email ---
      try {
        const adminData = adminSnap.data() as any;
        const { gmailUser, gmailAppPassword } = adminData || {};
        const orderData = orderSnap.data() as any;
        const clientEmail = orderData?.contact?.email;
        const clientName  = orderData?.contact?.name || "Cliente";
        const serviceName = orderData?.serviceName || orderData?.service_id || "Trámite";
        const shortId     = String(orderId).slice(0, 8);

        if (clientEmail && gmailUser && gmailAppPassword) {
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: gmailUser, pass: gmailAppPassword },
          });
          const htmlBody = `
            <div style="font-family:system-ui,Arial;max-width:600px;margin:0 auto;">
              <h2 style="color:#16a34a;">Tu certificado está listo</h2>
              <p>Hola ${clientName}, tu trámite <strong>${serviceName}</strong> fue procesado exitosamente.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">N° de orden</td>
                    <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${shortId}</td></tr>
              </table>
              <p style="margin:16px 0;">
                <a href="${fileUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
                  📄 Descargar certificado
                </a>
              </p>
              <p style="color:#64748b;font-size:0.85rem;">Si el botón no funciona, copia este enlace en tu navegador:<br>${fileUrl}</p>
              <p style="color:#94a3b8;font-size:0.8rem;margin-top:24px;">TrámiteYA — agilizamos tus trámites en Colombia.</p>
            </div>
          `;
          await transporter.sendMail({
            from: `"TramiteYA" <${gmailUser}>`,
            to: clientEmail,
            subject: `Tu certificado está listo - ${serviceName} (Orden ${shortId})`,
            html: htmlBody,
          });
          console.log("[admin_upload] Email de entrega enviado a", clientEmail);
        } else {
          console.warn("[admin_upload] No se envió email al cliente: falta clientEmail o config Gmail");
        }
      } catch (emailErr) {
        console.error("[admin_upload] Error enviando email al cliente:", emailErr);
        // No falla el upload si el email falla
      }

      return ok(res, { ok: true, orderId, fileUrl });
    } catch (e: any) {
      console.error("[admin_upload] error:", e);
      return bad(res, String(e?.message || e), 500);
    }
  });
});
