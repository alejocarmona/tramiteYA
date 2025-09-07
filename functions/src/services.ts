import { Request, Response } from 'express';
import { ensureFirebase } from './utils';
import { Service } from './types';

const col = 'services';

// GET /services  → lista servicios habilitados
export async function listServices(_req: Request, res: Response) {
  const db = ensureFirebase();
  const snap = await db.collection(col).where('enabled', '==', true).get();

  const items: Service[] = snap.docs.map((d) => {
    const data = (d.data() as Partial<Service>) ?? {};
    // Evita sobrescribir el id si existiera en data
    const { id: _ignore, ...rest } = data as Record<string, unknown>;
    return { ...(rest as Omit<Service, 'id'>), id: d.id };
  });

  return res.json({ items });
}

// GET /services?id=...  → detalle de un servicio
export async function getService(req: Request, res: Response) {
  const db = ensureFirebase();
  const id = String(req.query.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const doc = await db.collection(col).doc(id).get();
  if (!doc.exists) return res.status(404).json({ error: 'Service not found' });

  const data = (doc.data() as Partial<Service>) ?? {};
  const { id: _ignore, ...rest } = data as Record<string, unknown>;
  const item: Service = { ...(rest as Omit<Service, 'id'>), id: doc.id };

  return res.json({ item });
}
