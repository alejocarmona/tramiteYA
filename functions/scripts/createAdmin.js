// Crea o resetea el usuario admin de Firebase Auth usado por web/admin.html.
// Uso: GOOGLE_APPLICATION_CREDENTIALS=... GCLOUD_PROJECT=apptramiteya node scripts/createAdmin.js [email]

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';

if (!getApps().length) initializeApp({ credential: applicationDefault() });

const email = process.argv[2] || 'the.piece.maker@gmail.com';
const password = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);

async function main() {
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log('Usuario existente actualizado con nueva contraseña.');
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      user = await auth.createUser({ email, password, emailVerified: true });
      console.log('Usuario admin creado.');
    } else {
      throw e;
    }
  }
  console.log('UID:', user.uid);
  console.log('Email:', email);
  console.log('Password temporal:', password);
  console.log('\nRecuerda: el proveedor "Email/Password" debe estar habilitado en');
  console.log('Firebase Console > Authentication > Sign-in method.');
}
main().catch(e => { console.error(e); process.exit(1); });
