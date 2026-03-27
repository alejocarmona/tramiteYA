import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa Admin SDK una única vez
// En emulador y en triggers de Firestore, applicationDefault() no está disponible.
// initializeApp() sin args funciona tanto en emulador como en producción (GCF provee credenciales por defecto).
export function ensureFirebase() {
  if (!getApps().length) {
    initializeApp();
  }
  return getFirestore();
}
