// Script para configurar Firebase con datos mínimos necesarios
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function setup() {
    console.log('🔧 Configurando Firebase Firestore...\n');

    // 1. config/public
    console.log('📝 Creando config/public...');
    await db.collection('config').doc('public').set({
        whatsappNumber: "3014379544",
        payments: {
            useMock: false  // Cambiar a true para usar simulador
        },
        wompi: {
            publicKey: "pub_test_4XFzba6OCyX859Ed1dPFqPQsL4Rg38Dc",
            apiUrl: "https://sandbox.wompi.co",
            checkoutUrlBase: "https://checkout.wompi.co/p/"
        },
        app: {
            returnUrl: "http://localhost:5000/"
        }
    }, { merge: true });
    console.log('✅ config/public creado\n');

    // 2. flags/global
    console.log('📝 Creando flags/global...');
    await db.collection('flags').doc('global').set({
        payments: {
            useMock: true  // Cambiar a false para usar Wompi real
        }
    }, { merge: true });
    console.log('✅ flags/global creado\n');

    // 3. flags/secure (CON PLACEHOLDERS - DEBES REEMPLAZARLOS)
    console.log('📝 Creando flags/secure...');
    await db.collection('flags').doc('secure').set({
        wompi: {
            secretKey: "prv_test_REEMPLAZA_CON_TU_SECRET_KEY",
            integritySecret: "test_integrity_REEMPLAZA_CON_TU_INTEGRITY_SECRET",
            eventsSecret: "REEMPLAZA_CON_TU_EVENTS_SECRET"
        }
    }, { merge: true });
    console.log('⚠️  flags/secure creado con PLACEHOLDERS\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Configuración básica completada!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('⚠️  IMPORTANTE: Debes hacer estos cambios manualmente:\n');
    console.log('1. Ve a Firebase Console → Firestore');
    console.log('2. Edita flags/secure → wompi');
    console.log('3. Reemplaza los valores PLACEHOLDER con tus claves reales de Wompi:');
    console.log('   - secretKey: prv_test_...');
    console.log('   - integritySecret: test_integrity_...');
    console.log('   - eventsSecret: ...\n');
    console.log('4. Obtén tus claves en: https://comercios.wompi.co/\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Ejecuta ahora el seed de servicios:');
    console.log('  node lib/scripts/seedServices.js\n');

    process.exit(0);
}

setup().catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
});
