// functions/src/config.ts
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { ensureFirebase } from "./utils";

function cors(req: Request, res: Response): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

/** Devuelve config pública (nunca expone claves secretas) */
export const config_public = onRequest(async (req: Request, res: Response) => {
  if (cors(req, res)) return;
  const db = ensureFirebase();

  const [publicSnap, paymentsSnap] = await Promise.all([
    db.collection("config").doc("public").get(),
    db.collection("config").doc("payments").get(),
  ]);

  res.json({
    whatsappNumber: (publicSnap.exists && publicSnap.get("whatsappNumber")) || "",
    supportEmail: (publicSnap.exists && publicSnap.get("supportEmail")) || "",
    appName: (publicSnap.exists && publicSnap.get("appName")) || "TrámiteYA",
    paymentEnv: (paymentsSnap.exists && paymentsSnap.get("activeEnv")) || "mock",
  });
});
