#!/bin/sh
# Traccia base del gioco: separa un brano in 4 stem con Demucs e li codifica in mp3 per i 4 deck.
# Uso: scripts/stem.sh "<file audio>"
#   1. htdemucs_ft sul brano: batteria, basso, voce, resto;
#   2. htdemucs_6s sul "resto": chitarra e piano (lo skank) contro tutto il rimanente.
# Deck: 1 batteria · 2 basso · 3 skank (chitarra + piano) · 4 melodie (fiati, synth, voce, residui).
# Il venv .venv-stem, stem/ e gli mp3 in public/audio/ restano fuori da git: il brano ha i suoi diritti.
#   python3.12 -m venv .venv-stem && .venv-stem/bin/pip install torch==2.5.1 torchaudio==2.5.1 demucs==4.0.1 soundfile
# Demucs gira su CPU: su MPS una convoluzione supera il limite di canali e il ripiego non scatta.
# --float32: senza, Demucs riscala ogni stem che passa 0 dBFS e il bilanciamento si sposta di ~2 dB;
# poi -3 dB uguali per tutti gli stem, così nessuno satura nell'mp3.
set -eu
cd "$(dirname "$0")/.."
SORGENTE="${1:?serve il file audio}"
NOME=$(basename "${SORGENTE%.*}")
DEMUCS=".venv-stem/bin/python -m demucs -d cpu -j 4 --shifts 2 --float32 -o stem"

A="stem/htdemucs_ft/$NOME"
[ -f "$A/other.wav" ] || $DEMUCS -n htdemucs_ft "$SORGENTE"
# Il file d'ingresso si chiama sempre other.wav: senza una cartella per brano, un brano nuovo
# troverebbe chitarra e piano di quello prima.
B="stem/6s/$NOME/htdemucs_6s/other"
[ -f "$B/guitar.wav" ] || $DEMUCS -o "stem/6s/$NOME" -n htdemucs_6s "$A/other.wav"

mkdir -p public/audio
# mp3 <uscita> <ingressi e filtri>: niente copertina né metadati del brano negli stem
mp3() { u=$1; shift; ffmpeg -y -loglevel error "$@" -vn -map_metadata -1 -codec:a libmp3lame -b:a 192k "$u"; }
mp3 public/audio/drums.mp3 -i "$A/drums.wav" -af volume=-3dB
mp3 public/audio/bass.mp3 -i "$A/bass.wav" -af volume=-3dB
mp3 public/audio/skank.mp3 -i "$B/guitar.wav" -i "$B/piano.wav" -filter_complex "amix=inputs=2:normalize=0,volume=-3dB"
# melodie = brano meno gli altri tre deck: la somma dei 4 deck a fader pari rifà il brano esatto
# (htdemucs_ft usa un modello per stem, e le sue uscite sommate lasciano un residuo a -12 dB)
mp3 public/audio/melodie.mp3 -i "$SORGENTE" -i "$A/drums.wav" -i "$A/bass.wav" -i "$B/guitar.wav" -i "$B/piano.wav" \
  -filter_complex "[1:a][2:a][3:a][4:a]amix=inputs=4:normalize=0,volume=-1[r];[0:a][r]amix=inputs=2:normalize=0,volume=-3dB"
rm -f public/audio/other.mp3 public/audio/vocals.mp3
ls -la public/audio
