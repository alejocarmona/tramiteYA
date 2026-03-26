import { onRequest } from "firebase-functions/v2/https";

/**
 * Health check básico
 * - Sirve para probar deploy
 * - Fuerza la creación del Service Account
 */
export const health = onRequest((req, res) => {
  res.status(200).send("ok");
});
