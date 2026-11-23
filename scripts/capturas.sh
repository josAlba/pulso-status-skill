#!/usr/bin/env bash
# Regenera las capturas de docs/screenshots con Chrome sin interfaz y el servidor de demo.
#   ./scripts/capturas.sh
# Requiere Node 18+ y Google Chrome (o CHROME=/ruta/al/binario).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/screenshots"
PORT="${PORT:-4174}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"

node "$ROOT/skills/pulso/scripts/demo-server.mjs" --port "$PORT" >/dev/null &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 1
mkdir -p "$OUT"

shot() { # nombre ancho alto ruta
  local name="$1" width="$2" height="$3" path="$4" url="http://localhost:$PORT$4" window="$2"
  # Chrome sin interfaz no baja de ~500 px de ancho: los anchos de móvil se capturan en un iframe centrado y se recortan (sips recorta desde el centro).
  if (( width < 600 )); then
    printf '<body style="margin:0"><iframe src="%s" width="%s" height="%s" style="border:0;display:block;margin:0 auto"></iframe>' \
      "$url" "$width" "$height" > "$PROFILE/frame.html"
    url="file://$PROFILE/frame.html"; window=600
  fi
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --window-size="$window,$height" --force-device-scale-factor=2 --virtual-time-budget=4000 \
    --screenshot="$OUT/$name.png" "$url" >/dev/null 2>&1
  if (( window != width )); then
    sips --cropToHeightWidth $((height * 2)) $((width * 2)) "$OUT/$name.png" >/dev/null
  fi
  if command -v sips >/dev/null; then
    sips -s format jpeg -s formatOptions 82 "$OUT/$name.png" --out "$OUT/$name.jpg" >/dev/null && rm "$OUT/$name.png"
  fi
  echo "✓ $name"
}

shot procesos         1440 900 "/?scenario=ok&theme=light"
shot procesos-averia  1440 900 "/?scenario=ko&theme=light"
shot infraestructura  1440 900 "/?scenario=ko&theme=light#infra"
shot eventos          1440 900 "/?scenario=ko&theme=light#eventos"
shot detalle          1440 900 "/?scenario=ko&theme=light#procesos/stock"
shot detalle-infra    1440 900 "/?scenario=ko&theme=light#infra/gateway"
shot oscuro           1440 900 "/?scenario=ok&theme=dark"
shot movil             390 844 "/?scenario=ko&theme=light"
