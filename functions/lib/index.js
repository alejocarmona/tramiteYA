"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orders = exports.services = exports.config_public = exports.payments_confirm = exports.payments_init = exports.notify = exports.health = void 0;
// functions/src/index.ts
const cors_1 = __importDefault(require("cors"));
const https_1 = require("firebase-functions/v2/https");
// Importa handlers (usa sufijo .js para ESM, igual que en orders.ts)
const services_js_1 = require("./services.js");
const orders_js_1 = require("./orders.js");
var health_1 = require("./health");
Object.defineProperty(exports, "health", { enumerable: true, get: function () { return health_1.health; } });
// ...existing code...
exports.notify = (0, https_1.onRequest)({ cors: ["https://<tu-sitio>.web.app", "http://localhost:5000"] }, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    } // ← no retornes Response
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    try {
        const NOTIFY_WEBHOOK = "https://hooks.zapier.com/hooks/catch/25211343/ui7n435/";
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
        await fetch(NOTIFY_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        res.status(204).end(); // ← terminar respuesta
        return; // ← sin valor
    }
    catch (e) {
        console.error('notify error', e);
        res.status(500).send('notify failed');
        return; // ← sin valor
    }
});
// ...existing code...
// Re-exporta funciones de otros módulos (usa .js)
var payments_js_1 = require("./payments.js");
Object.defineProperty(exports, "payments_init", { enumerable: true, get: function () { return payments_js_1.payments_init; } });
Object.defineProperty(exports, "payments_confirm", { enumerable: true, get: function () { return payments_js_1.payments_confirm; } });
var config_js_1 = require("./config.js");
Object.defineProperty(exports, "config_public", { enumerable: true, get: function () { return config_js_1.config_public; } });
const cors = (0, cors_1.default)({ origin: true });
// ----- Services -----
// GET /services          -> lista
// GET /services?id=...   -> detalle
exports.services = (0, https_1.onRequest)((req, res) => {
    cors(req, res, async () => {
        try {
            res.setHeader("Access-Control-Allow-Origin", "*"); // ← asegura CORS también en GET
            // ===== CORS preflight =====
            if (req.method === "OPTIONS") {
                res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
                res.status(204).end();
                return;
            }
            // ==========================
            if (req.method === "GET") {
                if (req.query.id)
                    return (0, services_js_1.getService)(req, res);
                return (0, services_js_1.listServices)(req, res);
            }
            return res.status(405).send("Method Not Allowed");
        }
        catch (e) { /* ...existing code... */ }
    });
});
// ----- Orders -----
// POST /orders           -> createOrder
// GET  /orders?id=...    -> getOrderStatus
exports.orders = (0, https_1.onRequest)((req, res) => {
    cors(req, res, async () => {
        try {
            res.setHeader("Access-Control-Allow-Origin", "*"); // ← asegura CORS también en GET/POST
            if (req.method === "OPTIONS") {
                res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.status(204).end();
                return;
            }
            if (req.method === "POST")
                return (0, orders_js_1.createOrder)(req, res);
            if (req.method === "GET")
                return (0, orders_js_1.getOrderStatus)(req, res);
            return res.status(405).send("Method Not Allowed");
        }
        catch (e) { /* ...existing code... */ }
    });
});
