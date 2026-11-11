#!/usr/bin/env bash
# Rebuilds the share image and PNG icons in public/ from the sources in scripts/
# and public/favicon.svg, using headless Google Chrome. Run from the repo root.
set -euo pipefail
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
shot() { # out width height url [transparent]
  local bg=(); [[ "${5:-}" == transparent ]] && bg=(--default-background-color=00000000)
  "$CHROME" --headless --virtual-time-budget=5000 --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files \
    "${bg[@]}" --window-size="$2,$3" --screenshot="$1" "$4" >/dev/null 2>&1
}
WRAP="$ROOT/scripts/.wrap.html"
trap 'rm -f "$WRAP"' EXIT
wrap() { # svg size -> url of a page that shows the svg at that size
  printf '<body style="margin:0"><img src="file://%s" width="%s" height="%s">' "$1" "$2" "$2" > "$WRAP"
  printf 'file://%s' "$WRAP"
}
full() { # svg size -> full-bleed icon (apple-touch, maskable): svg on paper, inside the 80% safe zone
  printf '<body style="margin:0;width:%spx;height:%spx;display:grid;place-items:center;background:#fffdf8"><img src="file://%s" style="width:62%%">' "$2" "$2" "$1" > "$WRAP"
  printf 'file://%s' "$WRAP"
}
shot "$ROOT/public/og-image.png" 1200 630 "file://$ROOT/scripts/og-image.html"
shot "$ROOT/public/apple-touch-icon.png" 180 180 "$(full "$ROOT/public/favicon.svg" 180)"
shot "$ROOT/public/icon-maskable-512.png" 512 512 "$(full "$ROOT/public/favicon.svg" 512)"
shot "$ROOT/public/icon-192.png" 192 192 "$(wrap "$ROOT/public/favicon.svg" 192)" transparent
shot "$ROOT/public/icon-512.png" 512 512 "$(wrap "$ROOT/public/favicon.svg" 512)" transparent
shot "$ROOT/scripts/.icon-32.png" 32 32 "$(wrap "$ROOT/public/favicon.svg" 32)" transparent
# favicon.ico: a single 32x32 PNG wrapped in an ICO header (for /favicon.ico requests)
python3 - "$ROOT/scripts/.icon-32.png" "$ROOT/public/favicon.ico" <<'PY'
import struct, sys
png = open(sys.argv[1], 'rb').read()
open(sys.argv[2], 'wb').write(struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png), 22) + png)
PY
rm "$ROOT/scripts/.icon-32.png"
ls -la "$ROOT"/public/*.png "$ROOT/public/favicon.ico"
