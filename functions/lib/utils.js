"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureFirebase = ensureFirebase;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// Inicializa Admin SDK una única vez
// En emulador y en triggers de Firestore, applicationDefault() no está disponible.
// initializeApp() sin args funciona tanto en emulador como en producción (GCF provee credenciales por defecto).
function ensureFirebase() {
    if (!(0, app_1.getApps)().length) {
        (0, app_1.initializeApp)();
    }
    return (0, firestore_1.getFirestore)();
}
