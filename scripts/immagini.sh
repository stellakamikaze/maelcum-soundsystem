#!/bin/bash
# Genera le immagini con Codex (ChatGPT, abbonamento flat), una per prompt.
# Uso: scripts/immagini.sh mattoni legno ...   (prompt in immagini/prompt/<nome>.txt)
# Il PNG resta in ~/.codex/generated_images/<sessione>/; il log dice il percorso.
cd "$(dirname "$0")/.." || exit 1
mkdir -p immagini/log
for n in "$@"; do
  nohup codex exec --skip-git-repo-check "$(cat immagini/prompt/$n.txt)" > immagini/log/$n.log 2>&1 &
done
wait
