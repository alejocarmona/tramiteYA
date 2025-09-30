"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orders = exports.services = exports.config_public = exports.payments_confirm = exports.payments_init = void 0;
// functions/src/index.ts
const cors_1 = __importDefault(require("cors"));
const https_1 = require("firebase-functions/v2/https");
// Importa handlers (usa sufijo .js para ESM, igual que en orders.ts)
const services_js_1 = require("./services.js");
const orders_js_1 = require("./orders.js");
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
            if (req.method === "GET") {
                if (req.query.id)
                    return (0, services_js_1.getService)(req, res);
                return (0, services_js_1.listServices)(req, res);
            }
            return res.status(405).send("Method Not Allowed");
        }
        catch (e) {
            console.error("services handler error:", e);
            return res
                .status(500)
                .json({ error: "Internal error", detail: String(e?.message || e) });
        }
    });
});
// ----- Orders -----
// POST /orders           -> createOrder
// GET  /orders?id=...    -> getOrderStatus
exports.orders = (0, https_1.onRequest)((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method === "POST")
                return (0, orders_js_1.createOrder)(req, res);
            if (req.method === "GET")
                return (0, orders_js_1.getOrderStatus)(req, res);
            return res.status(405).send("Method Not Allowed");
        }
        catch (e) {
            console.error("orders handler error:", e);
            return res
                .status(500)
                .json({ error: "Internal error", detail: String(e?.message || e) });
        }
    });
});
