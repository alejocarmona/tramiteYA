"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listServices = listServices;
exports.getService = getService;
const utils_1 = require("./utils");
const col = 'services';
// GET /services  → lista servicios habilitados
async function listServices(_req, res) {
    const db = (0, utils_1.ensureFirebase)();
    const snap = await db.collection(col).where('enabled', '==', true).get();
    const items = snap.docs.map((d) => {
        const data = d.data() ?? {};
        // Evita sobrescribir el id si existiera en data
        const { id: _ignore, ...rest } = data;
        return { ...rest, id: d.id };
    });
    return res.json({ items });
}
// GET /services?id=...  → detalle de un servicio
async function getService(req, res) {
    const db = (0, utils_1.ensureFirebase)();
    const id = String(req.query.id ?? '').trim();
    if (!id)
        return res.status(400).json({ error: 'Missing id' });
    const doc = await db.collection(col).doc(id).get();
    if (!doc.exists)
        return res.status(404).json({ error: 'Service not found' });
    const data = doc.data() ?? {};
    const { id: _ignore, ...rest } = data;
    const item = { ...rest, id: doc.id };
    return res.json({ item });
}
