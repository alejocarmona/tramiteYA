"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orders = exports.services = exports.payments_confirm = exports.payments_init = void 0;
// functions/src/index.ts
const cors_1 = __importDefault(require("cors"));
const https_1 = require("firebase-functions/v2/https");
const services_1 = require("./services");
const orders_1 = require("./orders");
// Re-exporta tal cual, usando los nombres definidos en payments.ts
var payments_1 = require("./payments");
Object.defineProperty(exports, "payments_init", { enumerable: true, get: function () { return payments_1.payments_init; } });
Object.defineProperty(exports, "payments_confirm", { enumerable: true, get: function () { return payments_1.payments_confirm; } });
const cors = (0, cors_1.default)({ origin: true });
// ----- Services -----
exports.services = (0, https_1.onRequest)((req, res) => {
    cors(req, res, async () => {
        if (req.method === "GET") {
            if (req.query.id)
                return (0, services_1.getService)(req, res);
            return (0, services_1.listServices)(req, res);
        }
        res.status(405).send("Method Not Allowed");
    });
});
// ----- Orders -----
exports.orders = (0, https_1.onRequest)((req, res) => {
    cors(req, res, async () => {
        if (req.method === "POST")
            return (0, orders_1.createOrder)(req, res);
        if (req.method === "GET")
            return (0, orders_1.getOrderStatus)(req, res);
        res.status(405).send("Method Not Allowed");
    });
});
