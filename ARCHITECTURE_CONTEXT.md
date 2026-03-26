1. Resumen Ejecutivo
TrámiteYA es una plataforma web progresiva (PWA) diseñada para digitalizar y agilizar la obtención de trámites y certificados oficiales en Colombia. El sistema permite a los usuarios solicitar documentos como certificados judiciales, RUT, antecedentes disciplinarios y afiliaciones EPS a través de una interfaz simplificada, gestionando pagos con integración a Wompi (pasarela de pagos colombiana) y entregando los documentos vía email o WhatsApp.

La solución está construida sobre Firebase como backend-as-a-service, utilizando Firestore para persistencia, Cloud Functions para lógica de negocio serverless, y Firebase Hosting para servir el frontend. El MVP se enfoca en automatizar el flujo completo: catálogo de servicios → formulario dinámico → pago → procesamiento → entrega, con un sistema de seguimiento en tiempo real y modo simulador para testing sin integración real de pagos.

2. Stack Tecnológico
Frontend
Lenguaje: JavaScript vanilla (ES6+)
Estructura: Single Page Application (SPA) sin frameworks
UI: HTML5 + CSS3 con variables CSS para theming
PWA: Service Worker implícito vía Firebase Hosting, manifest.json configurado
Gestión de Estado: LocalStorage para historial de órdenes del cliente
Backend
Runtime: Node.js 20 (Firebase Functions v2)
Lenguaje: TypeScript 5.3.3 compilado a CommonJS
Framework: Express implícito en Firebase Functions con CORS habilitado
Base de Datos: Firebase Firestore (NoSQL)
Autenticación: Sin auth de usuario final (API pública con reglas de seguridad)
Integraciones Externas:
Wompi Sandbox API para procesamiento de pagos
Zapier webhook para notificaciones al equipo operativo
DevOps & Tooling
Build: TypeScript Compiler (tsc)
Emulación Local: Firebase Emulators (Functions port 5001, Firestore port 8080, Hosting port 5000)
Scripts: Node.js para seed de datos y configuración inicial
Control de Versiones: Git con estructura de ramas (ux-premium)
Dependencias Clave
// Backend (functions/package.json)
"firebase-admin": "^12.5.0"      // SDK Admin para acceso a Firestore/Storage
"firebase-functions": "^5.0.0"   // Framework para Cloud Functions v2
"cors": "^2.8.5"                 // Middleware CORS para endpoints HTTP

// Frontend (sin package.json, CDN-less)
// Sin dependencias externas - vanilla JS puro
3. Arquitectura y Patrones
Estilo Arquitectónico
Serverless Microservices con backend desacoplado en Firebase Functions y frontend estático en Hosting.

Estructura de Alto Nivel
tramiteYA/
├── web/                    # Frontend SPA (estático)
│   ├── index.html         # Shell único con routing client-side
│   ├── main.js            # Lógica de UI, API calls, state management
│   └── img/               # Assets visuales
├── functions/             # Backend serverless
│   ├── src/               # TypeScript sources
│   │   ├── index.ts      # Entry point - exporta endpoints HTTP
│   │   ├── orders.ts     # Lógica de órdenes (CRUD)
│   │   ├── payments.ts   # Integración Wompi
│   │   ├── services.ts   # Catálogo de trámites
│   │   ├── config.ts     # Config pública (WhatsApp, etc.)
│   │   ├── types.ts      # Interfaces TypeScript compartidas
│   │   └── utils.ts      # Firebase Admin SDK init
│   ├── scripts/          # Herramientas de desarrollo
│   │   ├── setupFirebase.js   # Seed inicial de config
│   │   └── seedServices.ts    # Poblado de catálogo
│   └── lib/              # TypeScript compilado (gitignored)
├── emulator-data/        # Snapshot local de Firestore
├── firestore.rules       # Reglas de seguridad
├── firebase.json         # Configuración de hosting/rewrites
└── .firebaserc           # ID del proyecto (`apptramiteya`)
Patrones Implementados
1. Repository Pattern (Backend)
Cada módulo de dominio (orders, services, payments) encapsula acceso a Firestore:
// functions/src/orders.ts - Ejemplo de repository implícito
export async function createOrder(req: Request, res: Response) {
  const db = ensureFirebase(); // Singleton Firestore client
  const ref = db.collection("orders").doc();
  await ref.set(orderData);
  // ...
}

2. API Gateway Pattern (Firebase Hosting Rewrites)
firebase.json configura rewrites para rutear paths a funciones específicas:
{
  "rewrites": [
    { "source": "/services", "function": "services" },
    { "source": "/orders", "function": "orders" },
    { "source": "/payments_init", "function": "payments_init" }
  ]
}

3. Strategy Pattern (Pagos)
payments.ts implementa dos estrategias de pago:

Mock Strategy: Simulador interno para desarrollo (payments.useMock: true)
Wompi Strategy: Integración real con pasarela externa
4. Observer Pattern (Frontend)
main.js usa polling y LocalStorage events para sincronizar estado:
// Polling para actualizar estado de orden
setInterval(() => refreshHistoryStatus(orderId), 15000);

5. Factory Pattern (Generación de Formularios)
web/main.js:openForm() construye dinámicamente inputs según configuración del servicio:
svc.fields.forEach(f => {
  const input = document.createElement(f.type === 'select' ? 'select' : 'input');
  // ...
});

4. Mapa de Funcionalidades
Core Features
Funcionalidad	Módulos Involucrados	Archivos Clave
Catálogo de Servicios	Frontend: listado<br>Backend: lectura Firestore	web/main.js:loadServices()<br>functions/src/services.ts:listServices()
Formulario Dinámico	Frontend: renderizado condicional	web/main.js:openForm()<br>web/index.html:625-675 (template HTML)
Creación de Orden	Backend: validación + Firestore write	functions/src/orders.ts:createOrder()
Integración Wompi	Backend: generación de firma HMAC + redirect	functions/src/payments.ts:payments_init() (líneas 137-239)
Confirmación de Pago	Backend: consulta API Wompi + actualización estado	functions/src/payments.ts:payments_confirm() (líneas 252-350)
Simulador de Pagos	Frontend: mock de transacciones	web/main.js:confirmPayment() (líneas 726-758)
Tracking de Estado	Frontend: polling + LocalStorage<br>Backend: endpoint de consulta	web/main.js:refreshHistoryStatus()<br>functions/src/orders.ts:getOrderStatus()
Notificaciones Zapier	Backend: webhook HTTP	functions/src/index.ts:notify (líneas 11-31)
Historial Local	Frontend: persistencia client-side	web/main.js:loadHistory() (líneas 353-425)
Animación Confetti	Frontend: CSS animations + deduplicación	web/main.js:triggerConfetti() (líneas 801-854)
Módulos de Soporte
Configuración Pública: functions/src/config.ts:config_public - Expone número de WhatsApp
Seed de Datos: seedServices.ts - Puebla 6 servicios en Firestore
Setup Inicial: setupFirebase.js - Crea colecciones config y flags
5. Flujo de Datos y Entry Points
Entry Points
Frontend
Archivo: index.html
Carga Inicial:

HTML estático con 3 secciones (#screen-list, #screen-form, #screen-status)
Script main.js ejecuta en DOMContentLoaded
loadServices() fetch a /services (reescrito a función serverless)
Renderiza cards de trámites en #services
Backend
Archivo: index.ts
Exports Principales:
export const services = onRequest(...)  // GET /services
export const orders = onRequest(...)    // POST /orders, GET /orders?id=...
export const payments_init = onRequest(...)    // POST /payments_init
export const payments_confirm = onRequest(...) // POST /payments_confirm
export const notify = onRequest(...)           // POST /notify
export const config_public = onRequest(...)    // GET /config_public

Flujo de Solicitud de Trámite (Happy Path)
sequenceDiagram
    participant U as Usuario (Browser)
    participant F as Frontend (main.js)
    participant H as Firebase Hosting
    participant CF as Cloud Functions
    participant FS as Firestore
    participant W as Wompi API
    participant Z as Zapier Webhook

    U->>F: Click en "Solicitar" trámite
    F->>H: GET /services?id=eps_certificado
    H->>CF: Rewrite a services(req,res)
    CF->>FS: db.collection('services').doc(id).get()
    FS-->>CF: Service data
    CF-->>F: { item: { name, price, fields } }
    F->>F: openForm() - renderiza campos dinámicos
    
    U->>F: Completa formulario + Click "Crear orden"
    F->>H: POST /orders { service_id, form_data, contact }
    H->>CF: Rewrite a orders(req,res)
    CF->>FS: Valida service_id existe
    CF->>FS: Crea doc en orders/ con status='queued'
    FS-->>CF: orderId
    CF-->>F: { orderId, status: 'queued' }
    F->>F: addHistory(orderId) - guarda en LocalStorage
    
    F->>H: POST /payments_init { orderId }
    H->>CF: Rewrite a payments_init(req,res)
    CF->>FS: Lee flags/global.payments.useMock
    alt useMock = false (Wompi real)
        CF->>FS: Lee config/public.wompi.publicKey
        CF->>FS: Lee flags/secure.wompi.integritySecret
        CF->>CF: Genera HMAC signature (reference+amount+currency+secret)
        CF-->>F: { mode: 'wompi', checkoutUrl: 'https://checkout.wompi.co/p/?...' }
        F->>W: window.location.href = checkoutUrl (redirect)
        U->>W: Completa pago en Wompi
        W->>H: Redirect a returnUrl?ref=ABC123&status=APPROVED
        F->>H: POST /payments_confirm { reference }
        H->>CF: Rewrite a payments_confirm(req,res)
        CF->>W: GET /v1/transactions?reference=ABC123
        W-->>CF: { status: 'APPROVED', id: 'tx-123' }
        CF->>FS: Actualiza order payment.status = 'paid'
        CF-->>F: { payment: 'paid', status: 'queued' }
    else useMock = true (Simulador)
        CF-->>F: { mode: 'mock', status: 'pending' }
        F->>F: Muestra #pay-sim con 4 botones
        U->>F: Click "Pago exitoso"
        F->>H: POST /payments_confirm { orderId, mock: 'success' }
        CF->>FS: Actualiza order payment.status = 'paid'
    end
    
    F->>F: renderStatus(order) - Actualiza UI con hero y confetti
    F->>Z: POST notifyTeam({ orderId, status, payment })
    Z-->>Z: Dispara Zap (notificación a equipo)
    
    Note over CF,FS: Backend procesa orden (no implementado en MVP)
    CF->>FS: Cambia order.status a 'delivered'
    CF->>FS: Agrega order.delivery.fileUrl
    
    U->>F: Click "Revisar estado" en historial
    F->>H: GET /orders?id=orderId
    CF->>FS: db.collection('orders').doc(id).get()
    FS-->>CF: Order con status='delivered', fileUrl
    CF-->>F: { order: { status: 'delivered', delivery: {...} } }
    F->>F: Muestra botones "Descargar" + "Compartir WhatsApp"
Persistencia de Datos (Firestore Schema)
firestore/
├── config/
│   ├── public              # API keys públicas, returnUrl
│   └── secure (opcional)   # Fallback para claves privadas
├── flags/
│   ├── global              # { payments: { useMock: bool } }
│   └── secure              # { wompi: { secretKey, integritySecret } }
├── services/
│   └── [serviceId]         # { name, price, fields[], enabled }
└── orders/
    └── [orderId]           # { service_id, contact, payment, status, delivery }
Reglas de Seguridad (firestore.rules):

config/public: Lectura pública
services/*: Lectura pública, escritura solo backend
orders/*, flags/*: Acceso bloqueado desde cliente
6. Guía de Navegación para Desarrolladores
web - Frontend (Cliente)
Propósito: Single Page Application vanilla JS que interactúa con Firebase Functions vía HTTP.

Archivo	Responsabilidad
index.html	Shell HTML con 3 pantallas ocultas/visibles vía .hidden class. Contiene todo el CSS inline y estructura del DOM.
main.js	Core lógico: Maneja routing client-side, llamadas a API con fetch(), renderizado dinámico de formularios, manejo de LocalStorage para historial, animaciones de confetti. ~1400 líneas.
mockpay.html	Página standalone para simular checkout de Wompi (testing sin API real).
return.html	Landing page después de pago con Wompi. Extrae query params y llama a /payments_confirm.
manifest.json	Configuración PWA (nombre, íconos, theme color).
Puntos de Entrada:

Usuario accede a https://apptramiteya.web.app → index.html carga
Script main.js ejecuta loadServices() en DOMContentLoaded
Eventos de botones manejados con addEventListener en main.js
functions - Backend Serverless
Propósito: Lógica de negocio, integraciones externas y acceso seguro a Firestore.

src (TypeScript Sources)
Archivo	Exports	Responsabilidad
index.ts	services, orders, notify	Entry point principal. Define endpoints HTTP y re-exporta funciones de otros módulos.
services.ts	listServices(), getService()	Lectura de catálogo desde Firestore. Sin validación de auth (público).
orders.ts	createOrder(), getOrderStatus()	Creación y consulta de órdenes. Valida existencia del servicio antes de crear.
payments.ts	payments_init, payments_confirm	Integración Wompi: Genera firma HMAC SHA-256 para checkout, consulta transacciones por reference. Soporta modo mock.
config.ts	config_public	Endpoint GET que retorna whatsappNumber desde Firestore.
types.ts	Interfaces TS	Define Service, Order, Payment, Flags para type safety.
utils.ts	ensureFirebase()	Singleton del Admin SDK. Inicializa Firebase App una única vez.
Compilación: npm run build transpila src/*.ts → lib/*.js (CommonJS).

scripts (Tooling)
Script	Uso
setupFirebase.js	Primera ejecución: Crea colecciones config/public, flags/global, flags/secure con valores por defecto.
seedServices.ts	Puebla 6 servicios en Firestore (Certificados judiciales, RUT, RUES, etc.). Ejecutar: node lib/scripts/seedServices.js
emulator-data - Snapshot Local
Propósito: Exportación automática de Firestore cuando el emulador se cierra.

Configuración: firebase.json:21-23 define --import y --export-on-exit
Contenido: Metadata JSON y carpeta firestore_export/ con datos binarios
Uso: Permite persistir cambios entre sesiones de desarrollo local sin tocar producción
Archivos de Configuración (Raíz)
Archivo	Propósito
.firebaserc	ID del proyecto (apptramiteya). Usado por Firebase CLI para deployments.
firebase.json	Configuración de hosting rewrites, emuladores y reglas de Firestore. Crítico para routing de /services → función services.
firestore.rules	Reglas de seguridad: Solo backend puede escribir en orders/, flags/ es privado, services/ y config/public son legibles públicamente.
firestore.indexes.json	Índices compuestos (actualmente vacío - no hay queries complejas).
ComandosConsola.txt	Cheatsheet del equipo: Comandos para arrancar emulador, seed, commits Git.
SETUP_FIREBASE.md	Guía paso a paso para configurar Firestore desde cero. Incluye estructura de colecciones y troubleshooting.
SOLUCION_ERROR_403.md	Troubleshooting específico para errores de Wompi (faltan claves de integridad, validación de firma).
Workflows Comunes
Desarrollo Local
# Iniciar emulador con datos persistidos
cmd /c firebase emulators:start --import ./emulator-data --export-on-exit

# En otra terminal: poblar servicios iniciales
cd functions && npm run build && node lib/scripts/seedServices.js
Cambios en UI
Modificar main.js o index.html
Refrescar navegador en http://localhost:5000
Cambios en Backend
cd functions
npm run build           # Compila TS → JS
# Reiniciar emulador (Ctrl+C y volver a arrancar)
Deploy a Producción
npm run build
firebase deploy --only functions  # Solo backend
firebase deploy --only hosting    # Solo frontend
firebase deploy                   # Full deploy
Dependencias Críticas
Backend
"firebase-admin": "^12.5.0"      // Firestore, Storage, Auth (Admin SDK)
"firebase-functions": "^5.0.0"   // Cloud Functions v2 runtime
"cors": "^2.8.5"                 // CORS middleware para endpoints HTTP
Build Tools:
"typescript": "^5.3.3"
"ts-node": "^10.9.2"    // Para ejecutar scripts .ts directamente
"rimraf": "^5.0.5"      // Limpieza de build folder

Frontend
Sin dependencias externas - Vanilla JS + CSS variables. No usa npm/webpack.

Patrones de Nomenclatura
Funciones Exportadas: camelCase (ej: createOrder)
Endpoints HTTP: snake_case (ej: payments_init)
Colecciones Firestore: snake_case (ej: config/public)
IDs de Documentos: Generados por Firestore o slugs (ej: eps_certificado)
Variables Frontend: camelCase (ej: currentService)
Constantes: UPPER_SNAKE_CASE (ej: LS_KEY)
Debugging y Monitoreo
Logs Backend
// En functions/src/*.ts
console.log("[payments_init] Generando firma de integridad:", { reference, amount });
Ver logs en emulador: Terminal donde corre firebase emulators:start

Logs Frontend
// En web/main.js
console.info('API base (override):', base); // Línea 203
Ver logs: DevTools → Console del navegador

Modo Debug
Agregar ?debug=1 a la URL activa logs adicionales y muestra card con JSON crudo del estado de orden.

Integraciones Externas
Wompi (Pasarela de Pagos)
Sandbox API Base: https://sandbox.wompi.co
Checkout Widget: https://checkout.wompi.co/p/
Auth: Firma HMAC con integritySecret (código)
Docs: https://docs.wompi.co/
Zapier (Notificaciones)
Webhook URL: Hardcoded en web/main.js:23 y functions/src/index.ts:13
Payload: { orderId, status, payment, serviceName }
Trigger: Llamado desde frontend después de pago exitoso
Áreas sin Implementar (MVP)
Procesamiento Real de Trámites: Backend marca órdenes como delivered pero no genera PDFs reales
Autenticación de Usuarios: Sistema 100% público, sin login
Panel Admin: No existe interfaz para operadores
Webhooks Wompi: No escucha eventos de Wompi (solo polling manual)
Tests Automatizados: Sin suite de tests unitarios/integración
CI/CD: Deploy manual desde CLI
Seguridad y Compliance
Claves Sensibles
NUNCA commitear:

flags/secure.wompi.secretKey
flags/secure.wompi.integritySecret
Gestión: Almacenadas en Firestore (acceso solo desde backend con Admin SDK).

CORS
Configurado para aceptar cualquier origen (*) en desarrollo. Revisar antes de producción.

Validación de Inputs
Backend valida existencia de service_id antes de crear órdenes (orders.ts:88-91)
Frontend usa pattern regex en inputs de documento (index.html:634)
Performance Considerations
Frontend: Usa LocalStorage para cacheo de historial (evita fetches repetidos)
Backend: Firestore queries usan índices simples (no hay compound queries complejas)
Polling: Interval de 15s para actualizar estado de órdenes (main.js:1146)
Esta documentación proporciona un mapa completo para navegar, extender y mantener TrámiteYA. Para troubleshooting específico, consultar SOLUCION_ERROR_403.md (pagos Wompi) y ComandosConsola.txt (workflows G