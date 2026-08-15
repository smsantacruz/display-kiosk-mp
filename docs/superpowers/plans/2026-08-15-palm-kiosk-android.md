# Palm Kiosk Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una app Android que muestre el kiosk web en un WebView y salude al usuario por nombre cuando detecta su palma con el sensor Veinshine del Telpo POS.

**Architecture:** App Android en Kotlin con dos activities: `KioskActivity` (WebView fullscreen + SDK de palma en background) y `EnrollActivity` (admin oculta). El SDK de Veinshine corre en un thread separado en loop continuo; cuando hay match llama a `JavascriptInterface` que dispara `window.onPalmRecognized(name)` en el kiosk web. El kiosk web muestra un overlay fullscreen de saludo 4 segundos y vuelve al estado normal.

**Tech Stack:** Kotlin, Android SDK (minSdk 24), Veinshine SDK v1.3.14-P (.aar), Gson para JSON, React/Vite para el kiosk web.

**Spec:** `docs/superpowers/specs/2026-08-15-palm-kiosk-android-design.md`

## Global Constraints

- minSdk 24, targetSdk 34
- Kotlin, no Java
- Package: `com.meli.palmkiosk`
- SDK Veinshine: `.aar` en `/Users/ssantacruz/Downloads/palm-android-sdk-veinshine-v1.3.14-P/` — copiar a `app/libs/`
- Consultar PDFs del SDK para nombres exactos de clases/paquetes antes de implementar
- Base del proyecto: copiar estructura de `CobraApp` (mismo repo Fury, mismo device Telpo)
- `MATCH_THRESHOLD = 0.75f`
- `RECOGNITION_COOLDOWN_MS = 10_000L`
- `CAPTURE_TIMEOUT_MS = 5_000`
- Kiosk URL: `https://display-kiosk.ssantacruz90-75c.workers.dev`
- Commits frecuentes en el repo `fury_isp-hardware-general-pocs`, carpeta `palm-kiosk/`

---

## File Map

**Android app — nueva carpeta `palm-kiosk/` en el repo Fury:**
- `app/src/main/java/com/meli/palmkiosk/User.kt` — data class
- `app/src/main/java/com/meli/palmkiosk/PalmRepository.kt` — CRUD en JSON
- `app/src/main/java/com/meli/palmkiosk/PalmScanner.kt` — loop SDK + callbacks
- `app/src/main/java/com/meli/palmkiosk/PalmBridge.kt` — JavascriptInterface
- `app/src/main/java/com/meli/palmkiosk/KioskActivity.kt` — WebView + orquestación
- `app/src/main/java/com/meli/palmkiosk/EnrollActivity.kt` — pantalla admin
- `app/src/main/res/layout/activity_kiosk.xml`
- `app/src/main/res/layout/activity_enroll.xml`
- `app/src/main/res/layout/item_user.xml`
- `app/src/main/res/layout/dialog_enroll.xml`
- `app/src/main/AndroidManifest.xml`
- `app/build.gradle`
- `app/libs/` ← .aar del SDK Veinshine

**Kiosk web — repo `display-kiosk-mp`:**
- `src/components/GreetingOverlay.tsx` — nuevo componente
- `src/App.tsx` — modificar para registrar `window.onPalmRecognized` y montar overlay

---

## Task 1: Kiosk web — GreetingOverlay

**Repo:** `display-kiosk-mp`

**Files:**
- Create: `src/components/GreetingOverlay.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `window.onPalmRecognized(name: string)` — función global que el Android bridge llama

- [ ] **Step 1: Crear `GreetingOverlay.tsx`**

```tsx
import { useEffect, useState } from 'react'

interface Props {
  name: string | null
  onDone: () => void
}

export function GreetingOverlay({ name, onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in')

  useEffect(() => {
    if (!name) return
    setPhase('in')
    const t1 = setTimeout(() => setPhase('visible'), 500)
    const t2 = setTimeout(() => setPhase('out'), 4000)
    const t3 = setTimeout(() => onDone(), 4500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [name, onDone])

  if (!name) return null

  return (
    <div className={`greeting-overlay greeting-overlay--${phase}`}>
      <div className="greeting-overlay__content">
        <div className="greeting-overlay__hello">Hola,</div>
        <div className="greeting-overlay__name">{name}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Agregar CSS en `src/theme.css`**

```css
/* ---- Greeting overlay ---- */

.greeting-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.5s ease;
  backdrop-filter: blur(8px);
}

.greeting-overlay--in {
  opacity: 0;
}

.greeting-overlay--visible {
  opacity: 1;
}

.greeting-overlay--out {
  opacity: 0;
}

.greeting-overlay__content {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1vmin;
}

.greeting-overlay__hello {
  font-size: 5vmin;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.greeting-overlay__name {
  font-size: 18vmin;
  font-weight: 100;
  color: #ffffff;
  letter-spacing: -0.02em;
  line-height: 1;
}
```

- [ ] **Step 3: Modificar `src/App.tsx`**

Agregar `greetingName` state y registrar `window.onPalmRecognized`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { GreetingOverlay } from './components/GreetingOverlay'
import { registry } from './widgets/registry'

// ... (SHIFT_CYCLE y constantes existentes sin cambios)

function App() {
  const [shiftIndex, setShiftIndex] = useState(0)
  const [greetingName, setGreetingName] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      setShiftIndex((i) => (i + 1) % SHIFT_CYCLE.length)
    }, SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    (window as any).onPalmRecognized = (name: string) => {
      setGreetingName(name)
    }
    return () => { delete (window as any).onPalmRecognized }
  }, [])

  const handleGreetingDone = useCallback(() => setGreetingName(null), [])

  const [x, y] = SHIFT_CYCLE[shiftIndex]

  return (
    <>
      <main className="dashboard" style={{ translate: `${x}px ${y}px` }}>
        {registry.map(({ id, area, Component }) => (
          <div key={id} className={`cell cell--${area}`} style={{ gridArea: area }}>
            <Component />
          </div>
        ))}
      </main>
      <GreetingOverlay name={greetingName} onDone={handleGreetingDone} />
    </>
  )
}

export default App
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd /Users/ssantacruz/Documents/display-kiosk-mp
npx tsc --noEmit
```
Esperado: sin errores.

- [ ] **Step 5: Deploy**

```bash
npm run deploy
```

- [ ] **Step 6: Commit**

```bash
git add src/components/GreetingOverlay.tsx src/App.tsx src/theme.css
git commit -m "feat: add palm greeting overlay (window.onPalmRecognized)"
```

---

## Task 2: Android — Scaffold del proyecto

**Repo:** `fury_isp-hardware-general-pocs`, nueva carpeta `palm-kiosk/`

**Files:**
- Create: `palm-kiosk/` (proyecto Android Studio completo)
- Create: `palm-kiosk/app/build.gradle`
- Create: `palm-kiosk/app/libs/` ← copiar .aar del SDK

**Interfaces:**
- Produces: proyecto Android compilable con SDK Veinshine disponible como dependencia

- [ ] **Step 1: Copiar base de CobraApp**

```bash
cp -r /Users/ssantacruz/Documents/mercadopago/fury_isp-hardware-general-pocs/CobraApp \
      /Users/ssantacruz/Documents/mercadopago/fury_isp-hardware-general-pocs/palm-kiosk
```

- [ ] **Step 2: Renombrar package en todos los archivos**

En Android Studio: Right-click package `com.cobra.app` → Refactor → Rename → `com.meli.palmkiosk`. O con sed:
```bash
find palm-kiosk -name "*.kt" -o -name "*.xml" -o -name "*.gradle" | \
  xargs sed -i '' 's/com\.cobra\.app/com.meli.palmkiosk/g'
```

- [ ] **Step 3: Copiar .aar del SDK Veinshine**

```bash
mkdir -p palm-kiosk/app/libs
cp /Users/ssantacruz/Downloads/palm-android-sdk-veinshine-v1.3.14-P/*.aar \
   palm-kiosk/app/libs/
```

- [ ] **Step 4: Actualizar `app/build.gradle` para incluir el .aar**

Agregar en `dependencies`:
```groovy
implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
implementation 'com.google.code.gson:gson:2.10.1'
```

Verificar que `repositories` incluya:
```groovy
repositories {
    flatDir { dirs 'libs' }
}
```

- [ ] **Step 5: Eliminar código de CobraApp**

Borrar todas las clases de CobraApp (voice recognition, amount parser, etc.). Dejar solo: `AndroidManifest.xml` limpio, `build.gradle`, carpetas `res/`.

- [ ] **Step 6: Verificar que compila**

En Android Studio: Build → Make Project. Esperado: BUILD SUCCESSFUL sin errores de compilación (habrá warnings de clases faltantes que se crean en tasks siguientes — ignorar).

- [ ] **Step 7: Commit**

```bash
cd /Users/ssantacruz/Documents/mercadopago/fury_isp-hardware-general-pocs
git add palm-kiosk/
git commit -m "feat: scaffold palm-kiosk Android project with Veinshine SDK"
```

---

## Task 3: User model y PalmRepository

**Files:**
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/User.kt`
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmRepository.kt`
- Test: verificación manual — guardar y recuperar un usuario ficticio desde tests de Android o logs

**Interfaces:**
- Produces:
  - `data class User(val name: String, val rgbFeatures: String, val irFeatures: String, val enrolledAt: Long)`
  - `class PalmRepository(context: Context)` con métodos:
    - `fun getAll(): List<User>`
    - `fun add(user: User)`
    - `fun delete(name: String)`

- [ ] **Step 1: Crear `User.kt`**

```kotlin
package com.meli.palmkiosk

data class User(
    val name: String,
    val rgbFeatures: String,   // Base64
    val irFeatures: String,    // Base64
    val enrolledAt: Long = System.currentTimeMillis()
)
```

- [ ] **Step 2: Crear `PalmRepository.kt`**

```kotlin
package com.meli.palmkiosk

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

class PalmRepository(context: Context) {
    private val file = File(context.filesDir, "users.json")
    private val gson = Gson()
    private val type = object : TypeToken<MutableList<User>>() {}.type

    fun getAll(): List<User> {
        if (!file.exists()) return emptyList()
        return gson.fromJson(file.readText(), type) ?: emptyList()
    }

    fun add(user: User) {
        val users = getAll().toMutableList()
        users.removeAll { it.name == user.name }
        users.add(user)
        file.writeText(gson.toJson(users))
    }

    fun delete(name: String) {
        val users = getAll().toMutableList()
        users.removeAll { it.name == name }
        file.writeText(gson.toJson(users))
    }
}
```

- [ ] **Step 3: Verificar compilación**

Build → Make Project. Esperado: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add palm-kiosk/app/src/main/java/com/meli/palmkiosk/User.kt \
        palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmRepository.kt
git commit -m "feat: add User model and PalmRepository with JSON storage"
```

---

## Task 4: PalmScanner

**Files:**
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmScanner.kt`

**Interfaces:**
- Consumes: clases exactas del SDK Veinshine — verificar nombres en PDFs del SDK antes de implementar
- Produces:
  - `class PalmScanner(context: Context, repository: PalmRepository, onMatch: (name: String) -> Unit)`
  - `fun start()`
  - `fun stop()`

**IMPORTANTE:** Antes de implementar, leer el PDF de documentación del SDK en `/Users/ssantacruz/Downloads/palm-android-sdk-veinshine-v1.3.14-P/` para obtener los nombres exactos de clases, métodos y el path del modelo AI (`modelPath`).

- [ ] **Step 1: Leer documentación del SDK**

Abrir los PDFs del SDK. Identificar:
- Package name del SDK (ej: `com.veinshine.palm` o similar)
- Clase principal de inicialización
- Clase `Device` y métodos `open()`, `createStream()`
- Método `enableDimPalm(modelPath: String)`
- Método `capturePalmOnce(callback, timeoutMs: Int)`
- Clases de callback: `onCaptureFrame`, `onCapturePalmHint`
- Métodos `registerPalm()`, `extractPalmFeaturesFromImg()`, `compareFeatureScore()`
- Cómo obtener el `modelPath` (¿va en assets? ¿viene incluido en el .aar?)

- [ ] **Step 2: Crear `PalmScanner.kt`** (adaptar nombres de clases según PDFs)

```kotlin
package com.meli.palmkiosk

import android.content.Context
import android.util.Base64
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "PalmScanner"
private const val MATCH_THRESHOLD = 0.75f
private const val RECOGNITION_COOLDOWN_MS = 10_000L
private const val CAPTURE_TIMEOUT_MS = 5_000

class PalmScanner(
    private val context: Context,
    private val repository: PalmRepository,
    private val onMatch: (name: String) -> Unit,
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    private var future: Future<*>? = null
    private var lastMatchTime = 0L

    // TODO: reemplazar con clases reales del SDK según documentación
    // private var device: PalmDevice? = null
    // private var stream: PalmStream? = null

    fun start() {
        if (running.getAndSet(true)) return
        future = executor.submit { scanLoop() }
    }

    fun stop() {
        running.set(false)
        future?.cancel(true)
        // device?.close()
    }

    private fun scanLoop() {
        try {
            initSdk()
            while (running.get()) {
                captureAndMatch()
            }
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (e: Exception) {
            Log.e(TAG, "Scanner error", e)
        }
    }

    private fun initSdk() {
        // Implementar según documentación del SDK:
        // PalmSdk.initialize(context)
        // device = Device.create(context) -- esperar onDeviceCreatedSuccess
        // device.open() -- esperar onOpenSuccess
        // stream = device.createStream(...)
        // stream.allocateFrames(...)
        // stream.start()
        // enableDimPalm(getModelPath())
    }

    private fun captureAndMatch() {
        // Implementar según documentación:
        // val frame: CaptureFrame = capturePalmOnce(CAPTURE_TIMEOUT_MS) ?: return
        // val newRgb = extractPalmFeaturesFromImg(frame.rgbImage)
        // val newIr = extractPalmFeaturesFromImg(frame.irImage)
        //
        // val users = repository.getAll()
        // for (user in users) {
        //     val storedRgb = Base64.decode(user.rgbFeatures, Base64.DEFAULT)
        //     val storedIr = Base64.decode(user.irFeatures, Base64.DEFAULT)
        //     val score = compareFeatureScore(storedRgb, storedIr, newRgb, newIr)
        //     if (score >= MATCH_THRESHOLD) {
        //         val now = System.currentTimeMillis()
        //         if (now - lastMatchTime >= RECOGNITION_COOLDOWN_MS) {
        //             lastMatchTime = now
        //             onMatch(user.name)
        //         }
        //         return
        //     }
        // }
    }

    fun enrollPalm(name: String): Boolean {
        // Implementar según documentación:
        // val frame = capturePalmOnce(CAPTURE_TIMEOUT_MS) ?: return false
        // val output = registerPalm(frame.rgbImage, frame.irImage, name)
        // val user = User(
        //     name = name,
        //     rgbFeatures = Base64.encodeToString(output.rgbFeatures, Base64.DEFAULT),
        //     irFeatures = Base64.encodeToString(output.irFeatures, Base64.DEFAULT)
        // )
        // repository.add(user)
        // return true
        return false // placeholder hasta completar SDK integration
    }

    private fun getModelPath(): String {
        // El modelo AI va en assets/ — copiarlo al filesDir si hace falta
        return context.filesDir.absolutePath + "/palm_model"
    }
}
```

- [ ] **Step 3: Completar `initSdk()` y `captureAndMatch()` con clases reales del SDK**

Una vez leída la documentación, reemplazar los comentarios con el código real. Los nombres de clases son los que aparecen en el PDF.

- [ ] **Step 4: Compilar**

Build → Make Project. Resolver errores de imports del SDK.

- [ ] **Step 5: Commit**

```bash
git add palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmScanner.kt
git commit -m "feat: add PalmScanner with Veinshine SDK integration"
```

---

## Task 5: PalmBridge + KioskActivity

**Files:**
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmBridge.kt`
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/KioskActivity.kt`
- Create: `palm-kiosk/app/src/main/res/layout/activity_kiosk.xml`
- Modify: `palm-kiosk/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `PalmScanner(context, repository, onMatch)`, `PalmRepository(context)`
- Produces: Activity fullscreen con WebView cargando el kiosk + SDK en background + gesto 4 taps para admin

- [ ] **Step 1: Crear `PalmBridge.kt`**

```kotlin
package com.meli.palmkiosk

import android.webkit.JavascriptInterface
import android.webkit.WebView

class PalmBridge(private val webView: WebView) {

    @JavascriptInterface
    fun onPalmRecognized(name: String) {
        val safeName = name.replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript("window.onPalmRecognized('$safeName')", null)
        }
    }
}
```

- [ ] **Step 2: Crear `activity_kiosk.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</FrameLayout>
```

- [ ] **Step 3: Crear `KioskActivity.kt`**

```kotlin
package com.meli.palmkiosk

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.MotionEvent
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

private const val KIOSK_URL = "https://display-kiosk.ssantacruz90-75c.workers.dev"
private const val TAP_AREA_DP = 80
private const val TAP_COUNT_REQUIRED = 4
private const val TAP_WINDOW_MS = 2000L

class KioskActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var repository: PalmRepository
    private lateinit var scanner: PalmScanner

    private val tapTimestamps = ArrayDeque<Long>(TAP_COUNT_REQUIRED)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)
        hideSystemUI()

        repository = PalmRepository(this)
        webView = findViewById(R.id.webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(PalmBridge(webView), "PalmSDK")
        webView.loadUrl(KIOSK_URL)

        scanner = PalmScanner(this, repository) { name ->
            PalmBridge(webView).onPalmRecognized(name)
        }
    }

    override fun onResume() {
        super.onResume()
        scanner.start()
    }

    override fun onPause() {
        super.onPause()
        scanner.stop()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            val tapAreaPx = TAP_AREA_DP * resources.displayMetrics.density
            val inCorner = event.x < tapAreaPx && event.y > (window.decorView.height - tapAreaPx)
            if (inCorner) {
                val now = System.currentTimeMillis()
                tapTimestamps.addLast(now)
                while (tapTimestamps.isNotEmpty() && now - tapTimestamps.first() > TAP_WINDOW_MS) {
                    tapTimestamps.removeFirst()
                }
                if (tapTimestamps.size >= TAP_COUNT_REQUIRED) {
                    tapTimestamps.clear()
                    startActivity(Intent(this, EnrollActivity::class.java))
                }
            }
        }
        return super.onTouchEvent(event)
    }

    private fun hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
```

- [ ] **Step 4: Actualizar `AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.meli.palmkiosk">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />

    <application
        android:allowBackup="false"
        android:label="Palm Kiosk"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <activity
            android:name=".KioskActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity
            android:name=".EnrollActivity"
            android:exported="false" />

    </application>
</manifest>
```

- [ ] **Step 5: Build + instalar en device**

```
Build → Generate Signed APK (o Run en device conectado por ADB)
```

Verificar en el device: la app abre, carga el kiosk URL en WebView fullscreen.

- [ ] **Step 6: Commit**

```bash
git add palm-kiosk/app/src/main/java/com/meli/palmkiosk/PalmBridge.kt \
        palm-kiosk/app/src/main/java/com/meli/palmkiosk/KioskActivity.kt \
        palm-kiosk/app/src/main/res/layout/activity_kiosk.xml \
        palm-kiosk/app/src/main/AndroidManifest.xml
git commit -m "feat: add KioskActivity with WebView, PalmBridge and 4-tap admin gesture"
```

---

## Task 6: EnrollActivity

**Files:**
- Create: `palm-kiosk/app/src/main/java/com/meli/palmkiosk/EnrollActivity.kt`
- Create: `palm-kiosk/app/src/main/res/layout/activity_enroll.xml`
- Create: `palm-kiosk/app/src/main/res/layout/item_user.xml`
- Create: `palm-kiosk/app/src/main/res/layout/dialog_enroll.xml`

**Interfaces:**
- Consumes: `PalmRepository(context)`, `PalmScanner.enrollPalm(name): Boolean`
- Produces: pantalla de admin con lista, agregar y eliminar usuarios

- [ ] **Step 1: Crear `activity_enroll.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:background="#000000">

    <TextView
        android:text="Usuarios registrados"
        android:textColor="#FFFFFF"
        android:textSize="20sp"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginBottom="16dp" />

    <androidx.recyclerview.widget.RecyclerView
        android:id="@+id/recyclerView"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1" />

    <com.google.android.material.floatingactionbutton.FloatingActionButton
        android:id="@+id/fabAdd"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="end"
        android:layout_marginTop="16dp"
        android:contentDescription="Agregar usuario" />

</LinearLayout>
```

- [ ] **Step 2: Crear `item_user.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:padding="16dp">

    <TextView
        android:id="@+id/tvName"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:textColor="#FFFFFF"
        android:textSize="18sp" />

    <ImageButton
        android:id="@+id/btnDelete"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:contentDescription="Eliminar"
        android:src="@android:drawable/ic_menu_delete"
        android:background="?attr/selectableItemBackground" />

</LinearLayout>
```

- [ ] **Step 3: Crear `dialog_enroll.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:padding="24dp">

    <TextView
        android:id="@+id/tvStatus"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Pone tu palma frente al sensor..."
        android:textColor="#FFFFFF"
        android:textSize="16sp"
        android:layout_marginBottom="16dp" />

    <EditText
        android:id="@+id/etName"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Nombre"
        android:textColor="#FFFFFF"
        android:inputType="textPersonName"
        android:visibility="gone" />

</LinearLayout>
```

- [ ] **Step 4: Crear `EnrollActivity.kt`**

```kotlin
package com.meli.palmkiosk

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class EnrollActivity : AppCompatActivity() {

    private lateinit var repository: PalmRepository
    private lateinit var scanner: PalmScanner
    private lateinit var adapter: UserAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_enroll)

        repository = PalmRepository(this)
        scanner = PalmScanner(this, repository) { }

        val recycler = findViewById<RecyclerView>(R.id.recyclerView)
        adapter = UserAdapter(repository.getAll().toMutableList()) { name ->
            repository.delete(name)
            adapter.remove(name)
        }
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        findViewById<View>(R.id.fabAdd).setOnClickListener {
            showEnrollDialog()
        }
    }

    private fun showEnrollDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_enroll, null)
        val tvStatus = view.findViewById<TextView>(R.id.tvStatus)
        val etName = view.findViewById<EditText>(R.id.etName)

        val dialog = AlertDialog.Builder(this)
            .setTitle("Nuevo usuario")
            .setView(view)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Guardar") { _, _ ->
                val name = etName.text.toString().trim()
                if (name.isNotEmpty()) {
                    Thread {
                        val ok = scanner.enrollPalm(name)
                        runOnUiThread {
                            if (ok) {
                                adapter.refresh(repository.getAll())
                                Toast.makeText(this, "✓ $name registrado", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(this, "Error al capturar la palma", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }.start()
                }
            }
            .create()

        // Simular captura: mostrar campo nombre después de 2s (reemplazar con captura real)
        dialog.show()
        view.postDelayed({
            tvStatus.text = "Palma capturada. Ingresá el nombre:"
            etName.visibility = View.VISIBLE
        }, 2000)
    }
}

class UserAdapter(
    private val users: MutableList<User>,
    private val onDelete: (String) -> Unit
) : RecyclerView.Adapter<UserAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvName)
        val btnDelete: ImageButton = view.findViewById(R.id.btnDelete)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_user, parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val user = users[position]
        holder.tvName.text = user.name
        holder.btnDelete.setOnClickListener { onDelete(user.name) }
    }

    override fun getItemCount() = users.size

    fun remove(name: String) {
        val i = users.indexOfFirst { it.name == name }
        if (i >= 0) { users.removeAt(i); notifyItemRemoved(i) }
    }

    fun refresh(newUsers: List<User>) {
        users.clear(); users.addAll(newUsers); notifyDataSetChanged()
    }
}
```

- [ ] **Step 5: Build + probar en device**

Instalar APK → abrir kiosk → 4 taps en esquina inferior izquierda → debe abrir EnrollActivity.

- [ ] **Step 6: Commit**

```bash
git add palm-kiosk/app/src/main/java/com/meli/palmkiosk/EnrollActivity.kt \
        palm-kiosk/app/src/main/res/layout/
git commit -m "feat: add EnrollActivity for palm registration and user management"
```

---

## Task 7: Integración end-to-end + push final

**Objetivo:** Probar el flujo completo: registrar una palma → poner la palma → ver el saludo en el kiosk web.

- [ ] **Step 1: Enroll de Sergio y Soledad**

Abrir la app → 4 taps esquina → EnrollActivity → FAB + → registrar "Sergio" → repetir para "Soledad".

- [ ] **Step 2: Test de reconocimiento**

Poner la palma → esperar → el kiosk debe mostrar el overlay "Hola, Sergio" (o "Hola, Soledad").

- [ ] **Step 3: Verificar cooldown**

Poner la palma dos veces seguidas (< 10s) → debe saludar solo una vez.

- [ ] **Step 4: Ajustar `MATCH_THRESHOLD` si hace falta**

Si hay falsos negativos, bajar a `0.65f`. Si hay falsos positivos, subir a `0.80f`.

- [ ] **Step 5: Push final al repo de Fury**

```bash
cd /Users/ssantacruz/Documents/mercadopago/fury_isp-hardware-general-pocs
git push origin main
```

- [ ] **Step 6: Push kiosk web**

```bash
cd /Users/ssantacruz/Documents/display-kiosk-mp
git add -A
git commit -m "chore: finalize palm greeting integration"
npm run deploy
git push  # al repo propio si tiene remote
```
