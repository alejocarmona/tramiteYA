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

    // ─── 2. config/payments (TODO lo de pagos, un solo lugar) ───
    console.log('📝 config/payments...');
    await db.collection('config').doc('payments').set({
        activeEnv: "mock",   // ← CAMBIAR ESTO para alternar: "mock", "test", "prod"
        environments: {
            mock: {},
            test: {
                publicKey: "pub_test_REEMPLAZA",
                secretKey: "prv_test_REEMPLAZA",
                integritySecret: "test_integrity_REEMPLAZA",
                eventsSecret: "",
                apiUrl: "https://api-sandbox.wompi.co",
                checkoutUrlBase: "https://checkout.wompi.co/p/",
                returnUrl: "http://localhost:5000/return.html"
            },
            prod: {
                publicKey: "pub_prod_REEMPLAZA",
                secretKey: "prv_prod_REEMPLAZA",
                integritySecret: "prod_integrity_REEMPLAZA",
                eventsSecret: "",
                apiUrl: "https://api.wompi.co",
                checkoutUrlBase: "https://checkout.wompi.co/p/",
                returnUrl: "https://apptramiteya.web.app/return.html"
            }
        }
    }, { merge: true });
    console.log('   ✅ Listo (activeEnv: "mock")\n');

    // ─── 3. Catálogo de servicios ───
    console.log('📝 Servicios...');
    const services = [
        {
            id: 'eps_certificado',
            name: 'Certificado de Afiliación EPS',
            description: 'Documento que certifica tu afiliación al sistema de salud.',
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
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
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
                { id: 'tipo_doc', label: 'Tipo de Documento', type: 'select', required: true, options: ['CC', 'CE'] },
                { id: 'numero_doc', label: 'Número de Documento', type: 'text', required: true, pattern: '^[0-9]{6,12}$' }
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
    console.log('  🔄 Cambiar modo de pagos:');
    console.log('     Firestore > config > payments > activeEnv');
    console.log('     Valores: "mock" (simulador), "test" (sandbox), "prod" (real)\n');
    console.log('  💳 Agregar claves Wompi:');
    console.log('     Firestore > config > payments > environments > test (o prod)');
    console.log('     Obtén tus claves en: https://comercios.wompi.co/\n');
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
