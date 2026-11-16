# 🎙️ Notas IA — bot notetaker de reuniones ($0, self-hosted)

Un bot que **entra a tus reuniones por el link**, **graba el audio** y lo **transcribe localmente** — sin pagar servicios de terceros (nada de Otter/Fireflies). Pensado para Google Meet; corre en una Mac con Chrome.

> Estado: **funciona la entrada + la transcripción local.** La captura de audio usa un dispositivo de audio virtual (BlackHole). Ver "Arquitectura" y "Pendiente".

---

## Cómo funciona (en 1 minuto)

1. **Entra como invitado** (`join.js`): abre Chrome con Puppeteer, va al link del Meet, se pone el nombre **"Notas IA"** y pide unirse. El host lo admite con un clic.
2. **Graba el audio** (`record.sh`): el audio que "oye" el bot se enruta a un **cable de audio virtual (BlackHole)** y se graba con `ffmpeg`.
3. **Transcribe local** (`whisper.cpp`): el `.wav` se pasa por `whisper-cli` con el modelo `ggml-small` en español. Cero nube, cero costo por minuto.

```
  Link del Meet
       │
       ▼
  join.js  ──►  Chrome (invitado "Notas IA")  ──►  [host admite]
                         │ audio que oye el bot
                         ▼
                   BlackHole (cable virtual)
                         │
                         ▼
                   ffmpeg  ──►  meet-audio.wav  ──►  whisper-cli  ──►  transcripción.txt
```

## Por qué así (decisiones de diseño)

- **Entra como INVITADO, no logueado.** Google bloquea con fuerza el *login automatizado* (2FA, "navegador no seguro", cookies cifradas por Keychain que no sobreviven a la automatización). El join como invitado **esquiva todo eso**: el host simplemente lo admite. Es más simple y más robusto.
- **El audio NO se puede capturar desde la página.** Google Meet no expone el audio remoto como elementos `<audio>`/`<video>` con `srcObject` accesibles (lo enruta por Web Audio interno). Verificado: 0 pistas visibles desde el DOM. Por eso se usa un **cable de audio virtual del sistema** (BlackHole en Mac; en Linux sería un *null-sink* de PulseAudio): captura exactamente lo que el bot reproduce, pase lo que pase dentro de Meet.
- **Transcripción 100% local** con whisper.cpp → $0 y privado (el audio no sale de la máquina).

## Requisitos

- macOS con **Google Chrome**.
- **Node** (para Puppeteer) — deps en `package.json` (`puppeteer-core`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`).
- **ffmpeg** y **whisper.cpp** (`whisper-cli` en el PATH) + el modelo en `models/ggml-small.bin`.
- **BlackHole 2ch** (cable de audio virtual, gratis).

## Setup

```bash
# 1) dependencias de Node
npm install

# 2) modelo de whisper (small, ~487MB) → models/ggml-small.bin
#    (descargar de huggingface ggerganov/whisper.cpp)

# 3) cable de audio virtual
brew install --cask blackhole-2ch     # pide contraseña; puede requerir reinicio
```

Para **oír y grabar a la vez**: en *Configuración de Audio MIDI* creá un **"Dispositivo de salida múltiple"** con BlackHole + tus parlantes, y ponelo como salida del sistema. Así vos seguís escuchando y el bot graba en paralelo.

## Uso

**Recomendado — flujo automático completo** (`bot.js`):
```bash
node bot.js "https://meet.google.com/xxx-xxxx-xxx"
# une "Notas IA" → vos lo admitís → arranca a grabar SOLO →
# detecta cuando termina la reunión → transcribe → resume → guarda todo en recordings/<fecha>-<id>/
```
El bot **cambia la salida de audio a BlackHole mientras graba y la restaura al terminar** (aunque falle). Resultado: `recordings/<fecha>-<id>/transcript.txt` + `summary.md` + `audio.wav`.

**Manual / para probar:**
```bash
./record.sh "<link>" 120   # graba 120s fijos y transcribe (sin esperar admisión ni resumir)
node join.js "<link>"      # solo unir el bot, sin grabar
node summarize.js transcript.txt   # resumir una transcripción cualquiera
```

### Resumen con IA (opcional, configurable)

El resumen usa un **endpoint compatible con OpenAI** definido en `.env` (copiá `.env.example`):
```
SUMMARY_URL=https://tu-endpoint/v1
SUMMARY_KEY=tu_api_key
SUMMARY_MODEL=tu-modelo
```
Serví cualquiera: **Groq (free tier, muy rápido)**, **Gemini (free)**, Ollama propio, OpenAI… Si el endpoint falla o es lento, **la transcripción igual queda guardada** (el resumen es un extra). Un LLM 7B en CPU es demasiado lento para esto → usá uno rápido.

## Archivos

| Archivo | Qué hace |
|---|---|
| `bot.js` | **Orquestador completo**: une → espera admisión → graba → detecta fin → transcribe → resume. |
| `join.js` | Une el bot como invitado "Notas IA" (sin grabar). |
| `record.sh` | Grabación manual de N segundos + transcripción. |
| `summarize.js` | Resume una transcripción con el LLM de `.env`. |
| `models/` | Modelo de whisper (no versionado). |

## Pendiente / roadmap

- [x] Captura de audio por BlackHole de punta a punta (probado en vivo).
- [x] Auto-grabar al ser admitido + auto-parar al terminar la reunión (`bot.js`).
- [x] Resumen automático con LLM configurable (requiere endpoint rápido).
- [ ] Multi-Output permanente (oír y grabar a la vez sin cambiar salida) — hoy el bot conmuta y restaura solo.
- [ ] Soporte Zoom / Teams (misma idea: unir por link + cable de audio).
- [ ] Versión headless en servidor Linux (Xvfb + PulseAudio null-sink) para correr 24/7.

## Licencia

Privado por ahora. Se planea liberar como **open source (MIT)** más adelante.
