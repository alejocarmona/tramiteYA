# Guía para correr TrámiteYA en local

## Paso 1: Instalar Firebase CLI *(una sola vez)*

```bash
npm install -g firebase-tools
```

---

## Paso 2: Login en Firebase *(una sola vez)*

```bash
firebase login
```

> Se abrirá el navegador para autenticar con tu cuenta Google.

---

## Paso 3: Compilar las Cloud Functions

```bash
cd functions
npm install
npm run build
```

---

## Paso 4: Levantar los emuladores

Desde la raíz del proyecto:

```bash
cd "c:\Users\alejandro.carmona\Documents\Vibe Coding\tramiteYA"
firebase emulators:start --import ./emulator-data --export-on-exit
```

---

## Paso 5: Abrir en el navegador

| Qué | URL |
|-----|-----|
| La app | http://localhost:5000 |
| Panel de emuladores (Firestore, Functions logs) | http://localhost:4000 |
| Modo debug (muestra simulador de pago) | http://localhost:5000?debug=1 |

