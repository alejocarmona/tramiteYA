"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config_public = void 0;
// functions/src/config.ts
const https_1 = require("firebase-functions/v2/https");
const utils_1 = require("./utils");
function cors(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return true;
    }
    return false;
}
/** Devuelve config pública (nunca expone claves secretas) */
exports.config_public = (0, https_1.onRequest)(async (req, res) => {
    if (cors(req, res))
        return;
    const db = (0, utils_1.ensureFirebase)();
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
