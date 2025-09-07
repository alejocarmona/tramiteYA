import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
async function main() {
    // Flags globales
    await db.collection('flags').doc('global').set({ payments: { useMock: true } }, { merge: true });
    const services = [
        {
            id: 'eps_certificado',
            name: 'Certificado de Afiliación EPS',
            enabled: true,
            price: { base: 10000, fee: 2500, iva: 1900, total: 14400 },
            fields: [
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' },
                { id: 'fecha_nac', label: 'Fecha de Nacimiento', type: 'date', required: true }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'certificado_judicial',
            name: 'Certificado de Antecedentes Judiciales',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'rut',
            name: 'RUT (DIAN) – Consulta/Descarga',
            enabled: true,
            price: { base: 13000, fee: 3500, iva: 2624, total: 19124 },
            fields: [
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'rues',
            name: 'RUES – Certificado Cámara de Comercio',
            enabled: true,
            price: { base: 14000, fee: 3500, iva: 2850, total: 20350 },
            fields: [
                { id: 'nit', label: 'NIT (sin dígito de verificación)', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'procuraduria_antecedentes',
            name: 'Antecedentes Disciplinarios (Procuraduría)',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'contraloria_antecedentes',
            name: 'Antecedentes Fiscales (Contraloría)',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        }
    ];
    const batch = db.batch();
    for (const s of services) {
        const ref = db.collection('services').doc(s.id);
        batch.set(ref, s, { merge: true });
    }
    await batch.commit();
    console.log('Seed OK');
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
