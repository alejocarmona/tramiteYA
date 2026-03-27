import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import corsLib from "cors";
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

      return ok(res, { ok: true, orderId, fileUrl });
    } catch (e: any) {
      console.error("[admin_upload] error:", e);
      return bad(res, String(e?.message || e), 500);
    }
  });
});
