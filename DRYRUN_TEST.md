# Prueba de Escritorio - TramiteYA

## Instruccion para Claude

```
MODO: dry-run — solo lectura, cero ejecucion.
NO abrir browser. NO escribir archivos. NO invocar builds ni deploys.
NO ejecutar comandos bash que modifiquen estado.

Simula exactamente lo que pasaria si un usuario ejecutara el ESCENARIO
indicado en la app TramiteYA (Capacitor Android + Firebase).

## Como simular

1. Lee los archivos fuente involucrados en el escenario.
   Archivos clave del sistema:
   - Frontend:        web/main.js, web/index.html, web/sw.js
   - Backend:         functions/src/payments.ts, functions/src/orders.ts,
                      functions/src/services.ts, functions/src/utils.ts
   - Android/Nativo:  android/app/src/main/java/com/tramiteya/app/MainActivity.java
   - Config:          capacitor.config.json, firebase.json
   - Tipos:           functions/src/types.ts

2. Para cada paso del escenario, traza la ejecucion siguiendo el codigo
   fuente real. Indica archivo:linea en cada paso.

3. Simula el estado de las siguientes capas en cada punto de decision:
   - DOM:          que pantalla (#screen-list, #screen-form, #screen-status) esta visible
   - JS Memory:    variables globales (_activePaymentRef, currentOrder, etc.)
   - localStorage: claves tya_orders, tya_pending_payment, tya_contact
   - Firestore:    documentos relevantes (orders/{id}, config/payments)
   - URL:          location.search params
   - Red:          peticiones HTTP (request + response simulada)
   - Android:      estado del WebView, shouldOverrideUrlLoading, appStateChange

4. Cuando el flujo dependa de un condicional (if/else, try/catch, switch),
   evalua AMBAS ramas y marca cual se toma dado el estado actual.
   Formato: [BRANCH] condicion → true|false → linea que ejecuta

5. Si en algun punto el sistema se detendria o fallaria, marcar:
   [BLOQUEO]  razon → lo que el usuario veria
   [ERROR]    excepcion → donde se captura → efecto en UI
   [RACE]     condicion de carrera potencial → impacto

6. Al final de la traza, generar:
   - VEREDICTO: PASA | FALLA | PARCIAL
   - HALLAZGOS: lista numerada de problemas o confirmaciones
   - ESTADO FINAL: snapshot de DOM, localStorage, Firestore

## Formato de traza

[CAPA] archivo:linea [ACCION] → [RESULTADO]

Capas validas: DOM, JS, LS (localStorage), FS (Firestore), NET (red),
               ANDROID, WIDGET (Wompi), SW (ServiceWorker), CAPACITOR

## Regla critica

NUNCA resumir como "se ejecuto el flujo completo". Trazar CADA paso,
CADA condicional, CADA llamada a API individualmente. La prueba de
escritorio solo tiene valor si es granular.

## Datos de prueba (usar estos para simular)

Firebase config/payments:
  activeEnv: "test"
  environments.test:
    publicKey: "pub_test_xxxx"
    secretKey: "prv_test_xxxx"
    integritySecret: "test_integrity_xxxx"
    apiUrl: "https://sandbox.wompi.co"
    returnUrl: "https://apptramiteya.web.app"

Servicio seleccionado:
  id: "certificado_judicial"
  name: "Certificado de Antecedentes Judiciales"
  price: { base: 12000, fee: 3000, iva: 2280, total: 17280 }
  enabled: true

Contacto del usuario:
  name: "Juan Perez"
  email: "juan@test.com"
  phone: "3001234567"

Form data:
  tipo_doc: "CC"
  numero_doc: "1234567890"

Order ID generado: "abc123def456"
Reference generado: "abc123def456-1713500000000-k7x2"
Wompi Transaction ID: "98765-txn-wompi"
```

---

## Escenarios disponibles

### ESCENARIO 1: Pago exitoso con tarjeta (happy path)
```
Simula: ESCENARIO 1
El usuario abre la app, ve el catalogo, selecciona "Certificado de
Antecedentes Judiciales", llena el formulario, paga con tarjeta de
credito via widget Wompi, el pago es APPROVED, y ve la pantalla de
estado con confeti.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 2: Pago PSE con redireccion exitosa
```
Simula: ESCENARIO 2
El usuario abre la app, crea una orden, selecciona PSE en el widget
Wompi. El widget redirige al banco (Bancolombia). El banco aprueba
y redirige a https://apptramiteya.web.app/?orderId=abc123def456.
MainActivity.java intercepta la URL. La app muestra el estado.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 3: Pago PSE + force-close + recuperacion
```
Simula: ESCENARIO 3
El usuario inicia pago PSE, el widget redirige al banco, el usuario
FUERZA EL CIERRE de la app (kill process) mientras esta en el sitio
del banco. El banco aprueba el pago. 5 minutos despues el usuario
reabre la app. No hay ?orderId= en la URL.
Verificar que el pago se recupera desde localStorage.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 4: Pago PSE + force-close + expiracion localStorage
```
Simula: ESCENARIO 4
Igual que ESCENARIO 3, pero el usuario reabre la app 45 minutos
despues (localStorage expiro los 30 min). No hay ?orderId= en URL.
Verificar que el pago pendiente NO se recupera (TTL expirado).
El usuario ve el catalogo normal y puede consultar historial.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 5: Catalogo no carga + auto-retry
```
Simula: ESCENARIO 5
El usuario abre la app. El endpoint /services responde con error 500
en los primeros 2 intentos (cold start de Firebase Functions).
El tercer intento responde exitosamente con la lista de servicios.
Verificar que el usuario ve spinner durante los reintentos y luego
el catalogo cargado, sin ver el mensaje de error.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 6: Catalogo no carga + todos los reintentos fallan
```
Simula: ESCENARIO 6
El usuario abre la app. El endpoint /services responde con error 500
en los 4 intentos (1 original + 3 reintentos). El usuario ve el
mensaje de error con boton "Reintentar". El usuario toca "Reintentar"
y esta vez el endpoint responde OK.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 7: Pago rechazado + reintento exitoso
```
Simula: ESCENARIO 7
El usuario crea una orden, paga con tarjeta, Wompi responde DECLINED.
El usuario ve la pantalla de estado con pago rechazado y boton
"Reintentar pago". El usuario toca reintentar, paga de nuevo con
otra tarjeta, Wompi responde APPROVED.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 8: Widget Wompi cerrado sin pagar
```
Simula: ESCENARIO 8
El usuario crea una orden, se abre el widget Wompi, el usuario cierra
el widget (X) sin completar el pago. Verificar que la app muestra
banner de error, la orden queda en "pendiente", y el historial
se actualiza correctamente.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 9: appStateChange con pago en curso
```
Simula: ESCENARIO 9
El usuario esta en medio de un pago PSE (widget abierto, PSE redirige
al banco). El usuario cambia a otra app (WhatsApp) y vuelve a TramiteYA
SIN cerrar la app (solo background/foreground). appStateChange se dispara.
_activePaymentRef todavia esta en memoria. Wompi ya proceso el pago
como APPROVED.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 10: Modo mock (simulador de pago)
```
Simula: ESCENARIO 10
config/payments.activeEnv = "mock". El usuario crea una orden.
payments_init responde mode:"mock". Se muestra el simulador de pago.
El usuario toca "Pago exitoso". Verificar confirmacion mock y
transicion a pantalla de estado.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 11: Deep link retorno desde navegador externo
```
Simula: ESCENARIO 11
El usuario completa pago PSE. El banco redirige a:
https://apptramiteya.web.app/?orderId=abc123def456
El AndroidManifest tiene intent-filter con autoVerify=true para ese host.
La Activity tiene launchMode="singleTask".
Verificar toda la cadena: intent-filter → MainActivity.onCreate →
shouldOverrideUrlLoading → WebView carga localhost → DOMContentLoaded
→ deteccion de ?orderId → reconfirmacion → renderStatus.
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

### ESCENARIO 12: Boton "atras" hardware Android en diferentes pantallas
```
Simula: ESCENARIO 12
Trazar el comportamiento del boton "atras" fisico/gesture de Android:
  A) Estando en #screen-status → debe navegar a #screen-list
  B) Estando en #screen-form  → debe navegar a #screen-list
  C) Estando en #screen-list  → debe minimizar la app
Verificar tanto el handler JS (CapApp backButton) como el handler
nativo (MainActivity.onBackPressed).
Plataforma: Capacitor Android (IS_CAPACITOR = true)
```

---

## Como ejecutar un escenario

Copia la instruccion base (el bloque de codigo del inicio) y pega
debajo el escenario que quieras simular. Ejemplo:

```
[pegar instruccion base aqui]

Simula: ESCENARIO 2
[pegar descripcion del escenario 2]
```

Claude trazara paso a paso el flujo completo sin ejecutar nada.
