# Palm Kiosk — Android App con Veinshine SDK

**Fecha:** 2026-08-15  
**Device:** Telpo POS Android con sensor de palma Veinshine  
**SDK:** palm-android-sdk-veinshine-v1.3.14-P  

---

## Objetivo

Reemplazar Fully Kiosk Browser con una app Android custom que:
1. Muestra el kiosk web en un WebView a pantalla completa
2. Corre el SDK de palma en background de forma continua
3. Cuando reconoce una palma registrada, muestra un saludo personalizado en el kiosk
4. Permite registrar/eliminar usuarios desde una pantalla de admin oculta

---

## Arquitectura

```
Telpo POS
├── KioskActivity (fullscreen, no status bar)
│   ├── WebView → https://display-kiosk.ssantacruz90-75c.workers.dev
│   ├── PalmScanner (background thread, loop continuo)
│   │     capturePalmOnce() → extractFeatures() → compareFeatureScore()
│   │     match → PalmBridge.onPalmRecognized(name) → JS
│   └── 4 taps esquina inferior izquierda → EnrollActivity
│
├── EnrollActivity (admin, acceso oculto)
│   ├── Lista de usuarios registrados
│   ├── Agregar: captura palma → pide nombre → guarda
│   └── Eliminar usuario
│
└── PalmRepository
    └── users.json (storage interno) → [{ name, rgbFeatures, irFeatures }]
```

**Bridge JS:**
```kotlin
@JavascriptInterface
fun onPalmRecognized(name: String) {
    webView.post {
        webView.evaluateJavascript("window.onPalmRecognized('$name')", null)
    }
}
```

**Kiosk web:**
```js
window.onPalmRecognized = (name) => showGreeting(name)
// overlay fullscreen 4s → fade out automático
```

---

## Componentes Android

### KioskActivity
- `WebView` con JavaScript habilitado, `addJavascriptInterface(PalmBridge, "PalmSDK")`
- Fullscreen: `WindowInsetsController.hide(statusBars | navigationBars)`
- Inicia `PalmScanner` en `onResume`, lo para en `onPause`
- Detector de 4 taps en esquina inferior izquierda (área 80dp × 80dp, dentro de 2s) → lanza `EnrollActivity`
- Cooldown 10s entre reconocimientos para no spamear el saludo

### PalmScanner
- Corre en `Executors.newSingleThreadExecutor()`
- Loop: `SDK.initialize() → device.open() → stream.start() → enableDimPalm(modelPath) → loop { capturePalmOnce(timeout=5s) }`
- En `onCaptureFrame`: `extractPalmFeaturesFromImg()` → itera usuarios → `compareFeatureScore()` → si score ≥ threshold: dispara callback con nombre
- Si no hay usuarios registrados: loop sin comparar (no falla)

### EnrollActivity
- `RecyclerView` con lista de usuarios (nombre + fecha de registro)
- FAB "+" → `EnrollDialog`: instrucciones → captura palma → campo nombre → guardar
- Swipe-to-delete en la lista
- Botón Back vuelve a `KioskActivity`

### PalmRepository
- Archivo `users.json` en `context.filesDir`
- Operaciones: `getAll()`, `add(name, rgbFeatures, irFeatures)`, `delete(name)`
- Features almacenados como Base64 strings

### PalmBridge
- `@JavascriptInterface fun onPalmRecognized(name: String)`
- Llama a `webView.evaluateJavascript` en el UI thread

---

## Kiosk Web — Greeting Overlay

**Nuevo componente React:** `GreetingOverlay`
- Div fixed, fullscreen, `z-index: 100`
- Fondo: `rgba(0,0,0,0.85)` con blur
- Contenido: "¡Hola, {nombre}!" en tipografía grande (Inter, weight 100, ~15vmin)
- Animación: fade-in 0.5s → visible 3.5s → fade-out 0.5s → unmount
- Se activa via `window.onPalmRecognized = (name) => setGreeting(name)`
- Registrado en `useEffect` en `App.tsx`

---

## Estructura de archivos Android

```
palm-kiosk-android/
├── app/src/main/
│   ├── java/com/meli/palmkiosk/
│   │   ├── KioskActivity.kt
│   │   ├── EnrollActivity.kt
│   │   ├── PalmScanner.kt
│   │   ├── PalmBridge.kt
│   │   ├── PalmRepository.kt
│   │   └── User.kt
│   ├── res/layout/
│   │   ├── activity_kiosk.xml
│   │   ├── activity_enroll.xml
│   │   └── dialog_enroll.xml
│   └── AndroidManifest.xml
├── app/libs/          ← .aar del SDK de Veinshine
└── build.gradle
```

---

## Proyecto base

Usar `CobraApp` (en el repo de Fury) como template — ya tiene la configuración de Gradle para el Telpo y el SDK2 general. Copiar la estructura y reemplazar la lógica de voz por la de palma.

---

## Variables de umbral

- `MATCH_THRESHOLD = 0.75` (ajustable según pruebas)
- `RECOGNITION_COOLDOWN_MS = 10_000`
- `CAPTURE_TIMEOUT_MS = 5_000`

---

## Fuera de scope

- Multi-tenancy / múltiples kiosks
- Sincronización de usuarios entre devices
- Autenticación del admin (la pantalla de enroll es accesible con el gesto secreto)
- Cámara remota (se configura en Fully Kiosk aparte)
