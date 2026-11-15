#!/usr/bin/env bash
# Entra a un Meet como invitado "Notas IA", graba el audio (vía BlackHole) y lo transcribe con whisper.
# Uso: ./record.sh "https://meet.google.com/xxx-xxxx-xxx" 120
# Requiere: BlackHole 2ch instalado + salida del sistema apuntando a BlackHole (o un Multi-Output Device).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="${1:?Pasa el link del Meet}"
SECS="${2:-120}"
WAV="/tmp/meet-audio.wav"
TXT="/tmp/meet-transcript"
MODEL="$HERE/models/ggml-small.bin"

# 1) detectar el índice del dispositivo de entrada BlackHole para avfoundation
IDX="$(ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | awk -F'[][]' '/BlackHole/ && /input/ {print $4; exit} /BlackHole/ {print $4; exit}')"
if [ -z "${IDX:-}" ]; then
  echo "❌ No encuentro BlackHole en los dispositivos de audio. ¿Instalaste 'brew install --cask blackhole-2ch'?"
  ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -i audio -A20 || true
  exit 1
fi
echo "🎧 BlackHole = dispositivo de audio #$IDX"

# 2) lanzar el bot al Meet (queda en sala de espera hasta que el host lo admita)
echo "🤖 Uniendo 'Notas IA' al Meet…"
( cd "$HERE" && nohup node join.js "$URL" >/tmp/join.log 2>&1 & )
sleep 12

# 3) grabar SECS segundos de lo que oye el bot
echo "⏺  Grabando ${SECS}s desde BlackHole…"
ffmpeg -y -f avfoundation -i ":$IDX" -t "$SECS" -ar 16000 -ac 1 "$WAV" -loglevel error

# 4) transcribir en español
echo "📝 Transcribiendo con whisper…"
whisper-cli -m "$MODEL" -f "$WAV" -l es -otxt -of "$TXT" >/dev/null 2>&1
echo "================= TRANSCRIPCIÓN ================="
cat "$TXT.txt"
echo "================================================"
echo "✅ Texto en $TXT.txt  ·  audio en $WAV"
