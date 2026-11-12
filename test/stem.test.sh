#!/bin/sh
# Prova scripts/stem.sh con un Demucs finto: due brani di fila non devono mescolare i loro stem.
# Il finto copia il file d'ingresso in ogni stem, con la stessa disposizione delle cartelle del vero.
# Uso: sh test/stem.test.sh (esce 1 se un caso fallisce)
set -eu
QUI=$(cd "$(dirname "$0")/.." && pwd)
PROVA=$(mktemp -d)
trap 'rm -rf "$PROVA"' EXIT
mkdir -p "$PROVA/scripts" "$PROVA/.venv-stem/bin"
cp "$QUI/scripts/stem.sh" "$PROVA/scripts/"
cat > "$PROVA/.venv-stem/bin/python" <<'FINTO'
#!/bin/sh
USCITA=separated
while [ $# -gt 1 ]; do
  case "$1" in
    -o) USCITA=$2; shift 2 ;;
    -n) MODELLO=$2; shift 2 ;;
    *) shift ;;
  esac
done
NOME=$(basename "${1%.*}")
mkdir -p "$USCITA/$MODELLO/$NOME"
case "$MODELLO" in
  htdemucs_ft) STEM="drums bass vocals other" ;;
  *) STEM="drums bass vocals other guitar piano" ;;
esac
for s in $STEM; do ffmpeg -y -loglevel error -i "$1" "$USCITA/$MODELLO/$NOME/$s.wav"; done
FINTO
chmod +x "$PROVA/.venv-stem/bin/python"
cd "$PROVA"
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=1" "brano uno.wav"
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=1000:duration=1" "brano due.wav"

sh scripts/stem.sh "brano uno.wav" >/dev/null
cp public/audio/skank.mp3 skank-uno.mp3
sh scripts/stem.sh "brano due.wav" >/dev/null

if cmp -s skank-uno.mp3 public/audio/skank.mp3; then
  echo "FAIL  il secondo brano riusa chitarra e piano del primo"
  exit 1
fi
echo "PASS  il secondo brano ha chitarra e piano suoi"
