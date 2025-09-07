// functions/src/index.ts
import corsLib from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { listServices, getService } from "./services";
import { createOrder, getOrderStatus } from "./orders";

// Re-exporta tal cual, usando los nombres definidos en payments.ts
export { payments_init, payments_confirm } from "./payments";

const cors = corsLib({ origin: true });

// ----- Services -----
export const services = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === "GET") {
      if (req.query.id) return getService(req, res);
      return listServices(req, res);
    }
    res.status(405).send("Method Not Allowed");
  });
});

// ----- Orders -----
export const orders = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === "POST") return createOrder(req, res);
    if (req.method === "GET")  return getOrderStatus(req, res);
    res.status(405).send("Method Not Allowed");
  });
});
