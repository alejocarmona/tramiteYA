# 🚨 SOLUCIÓN AL ERROR 403 DE WOMPI

## ✅ Cambios Aplicados

He aplicado los siguientes cambios al código:

### 1. **Logs de Debug en Backend** ([functions/src/payments.ts](functions/src/payments.ts))
- Agregué logs detallados que muestran:
  - Si `integritySecret` está configurado
  - Los valores usados para generar la firma
  - La firma generada
  - La URL completa de checkout
  - Validación de que la firma se agregó correctamente

### 2. **Validación en Backend** ([functions/src/payments.ts](functions/src/payments.ts))
- Ahora valida que la firma se agregó a la URL antes de retornarla
- Si falta la firma, retorna un error claro indicando el problema

### 3. **Validación en Frontend** ([web/main.js](web/main.js))
- Valida la URL de checkout antes de redirigir
- Muestra error claro si falta la firma

### 4. **Script de Configuración Automática**
- Creé `functions/scripts/setupFirebase.js` para configurar Firebase automáticamente

---

## 📋 PASOS PARA SOLUCIONAR EL ERROR 403

### Paso 1: Configurar Firebase (5 minutos)

```powershell
# En la terminal, ejecuta:
cd functions
node scripts/setupFirebase.js
```

Esto creará automáticamente:
- ✅ `config/public` con configuración de Wompi
- ✅ `flags/global` con modo de pago
- ⚠️ `flags/secure` con PLACEHOLDERS (debes reemplazarlos)

### Paso 2: Obtener tus claves de Wompi (3 minutos)

1. Ve a: https://comercios.wompi.co/
2. Inicia sesión
3. Ve a **Configuración** → **API Keys**
4. Copia estas 3 claves:
   - **Public Key** (empieza con `pub_test_...`)
   - **Secret Key** (empieza con `prv_test_...`)
   - **Integrity Secret** (empieza con `test_integrity_...`)

### Paso 3: Configurar las claves en Firebase (2 minutos)

1. Ve a Firebase Console (la imagen que compartiste)
2. Navega a: `flags` → `secure` → `wompi`
3. Edita cada campo y pega tus claves reales:
   ```
   secretKey: "prv_test_TU_CLAVE_REAL_AQUI"
   integritySecret: "test_integrity_TU_CLAVE_REAL_AQUI"
   eventsSecret: "TU_CLAVE_REAL_AQUI"
   ```
4. Guarda los cambios

### Paso 4: Poblar servicios (1 minuto)

```powershell
# En la terminal:
cd functions
node lib/scripts/seedServices.js
```

Esto creará los 6 servicios/trámites en la colección `services`.

### Paso 5: Reiniciar el emulador y probar (1 minuto)

```powershell
# Detén el emulador (Ctrl+C) y reinícialo:
firebase emulators:start --import "./emulator-data" --export-on-exit
```

Ahora intenta crear un pedido. Verás en los logs:
- 🔐 Generación de firma con todos los detalles
- ✅ Validación exitosa de la URL
- 🔗 URL completa con la firma

---

## 🔍 Diagnóstico del Problema

El error 403 de CloudFront ocurre porque **Wompi rechaza peticiones sin firma de integridad válida**.

### Causa raíz identificada:
1. `flags/secure` no existe o tiene valores placeholder
2. Sin `integritySecret`, no se genera la firma
3. Sin firma, Wompi (protegido por CloudFront) rechaza la petición con 403

### Cómo los cambios lo solucionan:
- ✅ Logs muestran exactamente qué está pasando
- ✅ Validaciones previenen redirigir con URLs inválidas
- ✅ Mensajes claros indican el problema
- ✅ Script automatiza la configuración inicial

---

## 🧪 Usar el Simulador (Alternativa mientras configuras)

Si quieres probar el flujo sin Wompi mientras configuras las claves:

1. Ve a Firebase Console → `flags/global`
2. Cambia `payments.useMock` a `true`
3. Recarga la aplicación
4. Ahora usará el simulador interno en lugar de Wompi

Para volver a Wompi:
1. Cambia `payments.useMock` a `false`
2. Asegúrate de tener las claves correctas en `flags/secure`

---

## 📊 Verificación Post-Configuración

Después de configurar todo, al crear un pedido verás en los logs:

```
🔐 [payments_init] Generando firma de integridad:
  - reference: ABC123-1234567890-xyz
  - amount: 1728000
  - currency: COP
  - integritySecret presente: SÍ (test_integ...)
  - toSign: ABC123-1234567890-xyz1728000COPtest_integrity_...
  - hash generado: 045aef329deae3826fc603af8030ecc0c8163ea9...
✅ [payments_init] URL completa generada: https://checkout.wompi.co/p/?...
```

Si ves "❌ integritySecret NO está configurado", el problema persiste.

---

## 🆘 Solución de Problemas

### Problema: "integritySecret NO está configurado"
**Solución:** Ve a Firebase Console → `flags/secure` y reemplaza los placeholders con tus claves reales.

### Problema: Sigue mostrando 403
**Soluciones:**
1. Verifica que copiaste las claves correctamente (sin espacios extra)
2. Asegúrate de usar claves de **test/sandbox**, no producción
3. Verifica que tu cuenta de Wompi esté activa
4. Intenta generar nuevas claves en el dashboard de Wompi

### Problema: No aparecen los servicios
**Solución:** Ejecuta `node lib/scripts/seedServices.js` desde `functions/`

---

## 📞 Contacto

Si después de seguir estos pasos el problema persiste, comparte:
1. Los logs de la terminal cuando creas un pedido
2. Captura de `flags/secure` en Firebase (ocultando las claves completas)
3. El mensaje de error exacto que aparece

---

**Tiempo total estimado:** ~15 minutos
**Estado:** ✅ Cambios aplicados al código, esperando configuración de claves
