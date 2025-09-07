"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureFirebase = ensureFirebase;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// Inicializa Admin SDK una única vez
function ensureFirebase() {
    if (!(0, app_1.getApps)().length) {
        (0, app_1.initializeApp)({ credential: (0, app_1.applicationDefault)() });
    }
    return (0, firestore_1.getFirestore)();
}
