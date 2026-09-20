// Script unificado de seed: config + servicios
// Uso: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/setupFirebase.js

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Si hay emulador, no necesita credenciales reales
const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!getApps().length) {
  if (isEmulator) {
    initializeApp({ projectId: 'apptramiteya' });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}
const db = getFirestore();

async function setup() {
    console.log('🔧 Configurando TrámiteYA en Firestore...\n');

    // ─── 1. config/public (datos NO sensibles, visibles al frontend) ───
    console.log('📝 config/public...');
    await db.collection('config').doc('public').set({
        whatsappNumber: "3014379544",
        supportEmail: "soporte@tramiteya.co",
        appName: "TrámiteYA"
    }, { merge: true });
    console.log('   ✅ Listo\n');

    // ─── 1b. config/admin (solo si NO existe) ───
    console.log('📝 config/admin...');
    const adminSnap = await db.collection('config').doc('admin').get();
    if (adminSnap.exists) {
        console.log('   ⏭️  Ya existe — no se sobreescribe\n');
    } else {
        await db.collection('config').doc('admin').set({
            uploadSecret: "CAMBIA_ESTE_SECRET_" + Math.random().toString(36).slice(2, 10),
            notifyEmail: "tu-email@gmail.com",
            gmailUser: "tu-email@gmail.com",
            gmailAppPassword: "REEMPLAZA_CON_APP_PASSWORD"
        });
        console.log('   ✅ Creado con placeholders (configura email y uploadSecret en Firestore)\n');
    }

    // ─── 2. Catálogo de servicios ───
    console.log('📝 Servicios...');
    const services = [
        {
            id: 'eps_certificado',
            name: 'Certificado de Afiliación EPS',
            description: 'Documento que certifica tu afiliación al sistema de salud.',
            enabled: true,
            price: { base: 10000, fee: 2500, iva: 1900, total: 14400 },
            fields: [
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'libertad_tradicion',
            name: 'Certificado Libertad y Tradición',
            description: 'Certificado de tradición y libertad asociado a matrícula inmobiliaria.',
            enabled: true,
            price: { base: 18000, fee: 3500, iva: 4085, total: 25585 },
            fields: [
                { id: 'matricula_inmobiliaria', label: 'Matrícula Inmobiliaria', type: 'text', required: true },
                { id: 'ciudad', label: 'Ciudad', type: 'text', required: true }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'antecedentes_policia',
            name: 'Antecedentes Policía',
            description: 'Consulta de antecedentes en Policía Nacional.',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'certificado_judicial',
            name: 'Certificado de Antecedentes Judiciales',
            description: 'Certificado de la Policía Nacional sobre antecedentes judiciales.',
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
            description: 'Registro Único Tributario de la DIAN.',
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
            description: 'Certificado de existencia y representación legal.',
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
            description: 'Certificado de antecedentes disciplinarios de la Procuraduría General.',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'contraloria_antecedentes',
            name: 'Antecedentes Fiscales (Contraloría)',
            description: 'Certificado de antecedentes fiscales de la Contraloría General.',
            enabled: true,
            price: { base: 12000, fee: 3000, iva: 2280, total: 17280 },
            fields: [
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'pasaporte',
            name: 'Pasaporte',
            description: 'Gestión y acompañamiento para trámite de pasaporte.',
            enabled: true,
            price: { base: 22000, fee: 4000, iva: 4940, total: 30940 },
            fields: [
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' },
                { id: 'nombre_completo', label: 'Nombre completo', type: 'text', required: true },
                { id: 'correo', label: 'Correo', type: 'email', required: true },
                { id: 'celular', label: 'Celular', type: 'tel', required: true, pattern: '^[0-9]{7,15}$' }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        },
        {
            id: 'pension_certificado',
            name: 'Certificado de afiliación (PENSIÓN)',
            description: 'Certificado de afiliación a fondo de pensión.',
            enabled: true,
            price: { base: 14000, fee: 3000, iva: 3230, total: 20230 },
            fields: [
                { id: 'entidad', label: 'Entidad', type: 'select', required: true, options: ['Colpensiones', 'Colfondos', 'Porvenir', 'Protección', 'Skandia'] },
                { id: 'cedula', label: 'Cédula', type: 'text', required: true, pattern: '^[0-9]{6,12}$' },
                { id: 'correo', label: 'Correo', type: 'email', required: true },
                { id: 'anio_nacimiento', label: 'Año de nacimiento', type: 'number', required: true }
            ],
            sla_hours: 24,
            deliver_channels: ['email', 'whatsapp']
        }
    ];

    const batch = db.batch();
    for (const s of services) {
        batch.set(db.collection('services').doc(s.id), s, { merge: true });
    }
    await batch.commit();
    console.log(`   ✅ ${services.length} servicios creados\n`);

    // ─── Instrucciones ───
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Seed completado.\n');
    console.log('📋 CÓMO ADMINISTRAR TU APP:\n');
    console.log('  📦 Editar servicios y precios:');
    console.log('     Firestore > services > [nombre del servicio]');
    console.log('     enabled: true/false para mostrar/ocultar\n');
    console.log('  📞 Cambiar datos de contacto:');
    console.log('     Firestore > config > public > whatsappNumber / supportEmail\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
}

setup().catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
});
