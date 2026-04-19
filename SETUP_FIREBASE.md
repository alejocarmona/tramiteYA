# Configuración de Firebase Firestore para TrámiteYA

## Estructura de Base de Datos Requerida

### 1. Colección: `config`

#### Documento: `public`
```json
{
  "whatsappNumber": "3014379544",
  "payments": {
    "useMock": false
  },
  "wompi": {
    "publicKey": "pub_test_4XFzba6OCyX859Ed1dPFqPQsL4Rg38Dc",
    "apiUrl": "https://sandbox.wompi.co",
  }
}
```

#### Documento: `secure` (Opcional - Alternativa a flags/secure)
```json
{
  "wompi": {
    "secretKey": "prv_test_5tIRjuylSGEcO8IUN1jieKw7LwVndWsZ",
    "integritySecret": "test_integrity_grW3e9XLu4VZJiEYCsFh9wMNaC0HLpda",
    "eventsSecret": "REEMPLAZA_CON_TU_EVENTS_SECRET"
  }
}
```

---

### 2. Colección: `flags`

#### Documento: `global`
```json
{
  "payments": {
    "useMock": false
  }
}
```

#### Documento: `secure` (Claves privadas de Wompi - RECOMENDADO)
```json
{
  "wompi": {
    "secretKey": "prv_test_5tIRjuylSGEcO8IUN1jieKw7LwVndWsZ",
    "integritySecret": "test_integrity_grW3e9XLu4VZJiEYCsFh9wMNaC0HLpda",
    "eventsSecret": "REEMPLAZA_CON_TU_EVENTS_SECRET"
  }
}
```

**NOTA:** Obtén estos valores desde tu panel de Wompi:
- **secretKey**: Dashboard → Configuración → API Keys → Secret Key
- **integritySecret**: Dashboard → Configuración → API Keys → Integrity Secret
- **eventsSecret**: Dashboard → Configuración → Webhooks → Events Secret

---

### 3. Colección: `services`
Se crea automáticamente con el script seed (ver abajo).

---

### 4. Colección: `orders`
Se crea automáticamente cuando los usuarios realizan pedidos. No requiere configuración manual.

---

## Pasos de Configuración

### Opción A: Configuración Manual en Firebase Console

1. Ve a Firebase Console → Firestore Database
2. Crea las colecciones y documentos como se muestra arriba
3. **IMPORTANTE:** Reemplaza los valores de `secretKey`, `integritySecret` y `eventsSecret` con tus claves reales de Wompi

### Opción B: Usar Script de Seed (RECOMENDADO)

1. Asegúrate de estar en el directorio `functions`:
   ```bash
   cd functions
   ```

2. Ejecuta el script de seed:
   ```bash
   npm run build
   node lib/scripts/seedServices.js
   ```

   Esto creará:
   - `flags/global` con `payments.useMock: true`
   - Todos los servicios en la colección `services`

3. **Después del seed**, ve a Firebase Console y crea manualmente:
   - `config/public` (con la estructura de arriba)
   - `flags/secure` (con tus claves de Wompi)

---

## Configuración del Emulador Local

Si usas el emulador de Firebase, la estructura se importará/exportará automáticamente:

```bash
firebase emulators:start --import "./emulator-data" --export-on-exit
```

Para usar el emulador con datos vacíos:
```bash
firebase emulators:start
```

Luego ejecuta el seed:
```bash
cd functions
npm run build
node lib/scripts/seedServices.js
```

---

## Checklist de Verificación

- [ ] Colección `config/public` existe con whatsappNumber y configuración de Wompi
- [ ] Colección `flags/global` existe con payments.useMock
- [ ] Colección `flags/secure` existe con claves privadas de Wompi (secretKey, integritySecret)
- [ ] Colección `services` tiene al menos 6 servicios (ejecutar seed)
- [ ] Las claves de Wompi son reales (no placeholders)

---

## Solución al Error 403 de Wompi

El error 403 que estás viendo en Wompi NO es causado por Firebase vacío. Las causas más comunes son:

1. **Firma de integridad incorrecta o faltante:**
   - Verifica que `integritySecret` en `flags/secure` sea correcto
   - La firma se genera con: `reference + amount + currency + integritySecret`

2. **Clave pública inválida:**
   - Verifica que `publicKey` en `config/public` sea válida y activa

3. **URL de retorno bloqueada:**
   - Wompi puede bloquear URLs de localhost en producción
   - Usa ngrok o similar para testing: `ngrok http 5000`

4. **Límites de rate-limiting:**
   - Espera unos minutos e intenta nuevamente

---

## Testing

Para probar con pagos simulados:

1. Configura `payments.useMock: true` en `flags/global`
2. Recarga la aplicación
3. El simulador de pagos aparecerá en lugar de Wompi

Para probar con Wompi real:

1. Configura `payments.useMock: false` en `flags/global`
2. Asegúrate de tener las claves correctas en `flags/secure`
3. Usa tarjetas de prueba de Wompi: https://docs.wompi.co/docs/tarjetas-de-prueba
