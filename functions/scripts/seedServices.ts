import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main(){
  // NOTA: usa setupFirebase.js para el seed completo (config + servicios).
  // Este script solo crea servicios.

  const services = [
    {
      id: 'eps_certificado',
      name: 'Certificado de Afiliación EPS',
      enabled: true,
      price: { base: 10000, fee: 2500, iva: 1900, total: 14400 },
      fields: [
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'libertad_tradicion',
      name: 'Certificado Libertad y Tradición',
      enabled: true,
      price: { base: 18000, fee: 3500, iva: 4085, total: 25585 },
      fields: [
        { id: 'matricula_inmobiliaria', label: 'Matrícula Inmobiliaria', type: 'text', required: true },
        { id: 'ciudad', label: 'Ciudad', type: 'text', required: true }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'antecedentes_policia',
      name: 'Antecedentes Policía',
      enabled: true,
      price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
      fields: [
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'certificado_judicial',
      name: 'Certificado de Antecedentes Judiciales',
      enabled: true,
      price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
      fields: [
        { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC','CE'] },
        { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
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
      deliver_channels: ['email','whatsapp']
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
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'procuraduria_antecedentes',
      name: 'Antecedentes Disciplinarios (Procuraduría)',
      enabled: true,
      price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
      fields: [
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'contraloria_antecedentes',
      name: 'Antecedentes Fiscales (Contraloría)',
      enabled: true,
      price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
      fields: [
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'pasaporte',
      name: 'Pasaporte',
      enabled: true,
      price: { base: 22000, fee: 4000, iva: 4940, total: 30940 },
      fields: [
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' },
        { id: 'nombre_completo', label: 'Nombre completo', type: 'text', required: true },
        { id: 'correo', label: 'Correo', type: 'email', required: true },
        { id: 'celular', label: 'Celular', type: 'tel', required: true, pattern: '^[0-9]{7,15}$' }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    },
    {
      id: 'pension_certificado',
      name: 'Certificado de afiliación (PENSIÓN)',
      enabled: true,
      price: { base: 14000, fee: 3000, iva: 3230, total: 20230 },
      fields: [
        { id: 'entidad', label: 'Entidad', type: 'select', required: true, options: ['Colpensiones','Colfondos','Porvenir','Protección','Skandia'] },
        { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' },
        { id: 'correo', label: 'Correo', type: 'email', required: true },
        { id: 'anio_nacimiento', label: 'Año de nacimiento', type: 'number', required: true }
      ],
      sla_hours: 24,
      deliver_channels: ['email','whatsapp']
    }
  ];

  const batch = db.batch();
  for (const s of services){
    const ref = db.collection('services').doc(s.id);
    batch.set(ref, s, { merge: true });
  }
  await batch.commit();
  console.log('Seed OK');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
