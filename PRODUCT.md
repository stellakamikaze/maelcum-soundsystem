# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + three.js + TypeScript (scelta di Claude nel piano approvato da Federico il 27/10/2026). Il DSP è il codice gen~ di `maelcum_mixer/proto-max`, tradotto in automatico da `scripts/gen2worklet.mjs`.

## Users

Federico, per giocare: suona e mostra agli amici un soundsystem dub a trombe con il mixer di Filippo (dj-filippo241/maelcum_mixer). Uso personale, in locale sul Mac, mouse e trackpad.

## Product Purpose

Suonare il mixer maelcum "esattamente": i comandi del pannello di Filippo pilotano il suo codice DSP vero (canale, mandate, filtro, 5-way, ritorni FX, master), e lo stack reagisce alle 5 vie. Successo: carichi quattro tracce, giochi di kill, filtro ed eco come in una sessione dub, e senti il carattere del mixer.

## Positioning

Non è un mixer generico in Web Audio: il suono nasce dal prototipo gen~ di Filippo, verificato contro LTspice, con la disposizione dei pannelli del suo progetto (`docs/pannelli/genera_pannelli.py`).

## Operating Context

Notte, volume alto, una persona al mixer. Quattro deck: Accendi carica i quattro stem di Midnight Stars (Mighty Massa), separati con Demucs, e il suono parte col tasto Play. Il tasto Traccia sceglie fra il brano, il riddim sintetico e un file; un file si trascina anche su un singolo deck. Pedali FX esterni al mixer (eco dub, eco puntata, molla, riverbero), come nel montaggio in Live.

## Capabilities and Constraints

- Il repo di Filippo si legge e basta: nessuna modifica.
- Comandi senza dispositivo nel prototipo (CUE, cuffie, BOOTH, LINE/PHONO, moduli MONO): visibili, inerti.
- CPU: il 5-way completo pesa un tempo reale; il motore gira su più Worker con SharedArrayBuffer, 5-way nella versione `-S` di default.
- Riferimento "Horns & Bricks" non trovato: interpretazione approvata da Federico (muri di trombe impilate come mattoni, cortile di mattoni, notte e luce al sodio). Da rifinire con una foto se arriva.

## Brand Commitments

Nomi e terminologia dei comandi come nei documenti di Filippo (GAIN, LOW-MID, KILL FISSO/MOLLA, GROWL, NASTRO, SELF, > FX1...). Colori standard dei pannelli di Filippo come punto di partenza.

## Evidence on Hand

- Render di riferimento e texture generate con Codex: `public/img/*.jpg`, prompt accanto.
- Banco DSP: `test/dsp.test.mjs` (37 casi, valori dei documenti di Filippo).

## Product Principles

1. Il suono è quello del prototipo: nessuna imitazione al posto del codice di Filippo.
2. Il pannello è quello del progetto: misure e ordine dei comandi non si inventano.
3. Lo stack mostra il suono: ogni via si muove con la sua banda, misurata da un AnalyserNode sull'uscita vera. Niente oscillazioni inventate.
4. Si suona subito: la traccia base è pronta senza file e parte col tasto Play, mai da sola.
