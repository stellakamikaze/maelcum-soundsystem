---
name: Maelcum Soundsystem
description: Il mixer dub di Filippo suonato di notte in un cortile di mattoni, su uno stack a trombe.
colors:
  fuliggine: "#0e0c0a"
  fuliggine-2: "#1a1612"
  sodio: "#ffa24a"
  sodio-scuro: "#c26a1e"
  mattone: "#8a3b22"
  osso: "#f1ece2"
  osso-2: "#c9bfb0"
  linea: "rgba(241, 236, 226, 0.14)"
typography:
  display:
    fontFamily: "Big Shoulders Stencil Display, Helvetica Neue, sans-serif"
    fontSize: "clamp(64px, 11vw, 150px)"
    fontWeight: 900
    lineHeight: 0.82
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Big Shoulders Stencil Display, Helvetica Neue, sans-serif"
    fontSize: "clamp(26px, 3.6vw, 48px)"
    fontWeight: 600
    letterSpacing: "0.04em"
  title:
    fontFamily: "Big Shoulders Stencil Display, Helvetica Neue, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    letterSpacing: "0.03em"
  label:
    fontFamily: "Big Shoulders Stencil Display, Helvetica Neue, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "0.04em"
  body:
    fontFamily: "Big Shoulders Text, Helvetica Neue, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "Big Shoulders Text, Helvetica Neue, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0px"
spacing:
  xs: "3px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "26px"
components:
  button-accendi:
    backgroundColor: "{colors.sodio}"
    textColor: "{colors.fuliggine}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "16px 28px 14px"
  button-trasporto:
    backgroundColor: "transparent"
    textColor: "{colors.osso}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "9px 12px"
  button-trasporto-attivo:
    backgroundColor: "{colors.osso}"
    textColor: "{colors.fuliggine}"
  scelta-selettore:
    backgroundColor: "{colors.fuliggine-2}"
    textColor: "{colors.osso}"
    rounded: "{rounded.none}"
    padding: "5px 9px"
  scelta-selettore-attiva:
    backgroundColor: "{colors.sodio}"
    textColor: "{colors.fuliggine}"
  deck:
    backgroundColor: "{colors.fuliggine-2}"
    textColor: "{colors.osso}"
    rounded: "{rounded.none}"
    padding: "7px 9px 9px"
  suggerimento:
    backgroundColor: "{colors.osso}"
    textColor: "{colors.fuliggine}"
    rounded: "{rounded.none}"
    padding: "6px 10px 5px"
---

# Design System: Maelcum Soundsystem

## Overview

**Creative North Star: "Il cortile di notte"**

La pagina è un luogo prima che un'interfaccia. Un cortile di mattoni, una lampada al sodio, uno stack a trombe e un mixer su un flight case riempiono tutto lo schermo. L'interfaccia HTML sta sopra la scena come il nastro adesivo su un flight case: poca, scritta a stencil, pensata per chi lavora al buio.

Il lavoro vero avviene sul mixer 3D, con i comandi di Filippo. L'HTML serve solo a ciò che il mixer non fa: accendere, suonare e scegliere la traccia, caricare i deck, cambiare inquadratura, scegliere le varianti del prototipo. Il primo sguardo è il cortile con una sola azione. La densità sale solo nella barra dei deck e nel pannello Prototipo.

**Key Characteristics:**
- Scena three.js a tutto schermo, con la pagina che non scorre mai;
- Una sola luce calda, il sodio, sia nella scena sia nell'interfaccia;
- Spigoli vivi ovunque, come metallo e legno da trasporto;
- Stencil per ciò che si legge da lontano, testo condensato per il resto;
- Solo tema scuro.

## Colors

La palette viene dalla scena: fuliggine per il buio, sodio per la lampada, osso per la carta e la vernice, mattone per il muro.

### Primary
- **Luce al sodio** (sodio): l'unico accento. Pulsante Accendi, tasto Play da fermo, numeri dei deck, barre di livello e di corsa, sottotitolo, focus, scelta attiva nei selettori. La stessa tinta illumina la scena (`PointLight` 0xffa24a).
- **Sodio bruciato** (sodio-scuro): il bordo inferiore del pulsante Accendi e la barra di scorrimento del Prototipo.

### Secondary
- **Mattone** (mattone): vive nella scena e nelle texture. Il token esiste, ma nessuna regola CSS lo usa: non serve come colore d'interfaccia.

### Neutral
- **Fuliggine** (fuliggine): sfondo della pagina e testo sopra il sodio e l'osso. Con alfa tra 0,4 e 0,94 fa da velo sopra la scena.
- **Fuliggine calda** (fuliggine-2): fondo dei deck e delle scelte dei selettori.
- **Osso** (osso): testo principale e stato attivo dei pulsanti di barra e inquadrature.
- **Osso sporco** (osso-2): testo secondario, tempi, note.
- **Filo** (linea): tutti i bordi a riposo.

### Colori del pannello
I pannelli, le manopole e i LED del mixer usano i colori standard di Filippo (`src/panel/layout.ts`). Stanno fuori da questa palette e non si cambiano per ragioni estetiche.

### Named Rules
**The Una Lampada Rule.** Il cortile ha una sola sorgente calda. Un secondo accento nell'interfaccia non ha una luce che lo giustifichi. La luna fredda (0x7f8cff) resta nella scena.

**The Stato Rule.** Il sodio segna ciò che è vivo o scelto nel lavoro al mixer, l'osso pieno segna il pulsante premuto di barra e inquadrature.

## Typography

**Display Font:** Big Shoulders Stencil Display (con Helvetica Neue, sans-serif)
**Body Font:** Big Shoulders Text (con Helvetica Neue, sans-serif)

**Character:** Lo stencil è la scritta spruzzata sul flight case. Il Text è della stessa famiglia e regge le righe piccole al buio. I due pesi per famiglia bastano: 600 e 900 lo stencil, 400 e 600 il testo.

### Hierarchy
- **Display** (900, maiuscolo): il nome "maelcum" all'avvio, e solo lì.
- **Headline** (600, maiuscolo, sodio): "soundsystem" sotto il nome.
- **Title** (900, maiuscolo): il pulsante Accendi e il titolo del Prototipo.
- **Label** (600, maiuscolo): inquadrature e trasporto.
- **Body** (400): testo d'avvio, a 19px e al massimo 44ch. Titoli dei deck a 15px in peso 600.
- **Small** (400): note, tempi e spiegazioni dei selettori. I tempi usano cifre tabellari.

### Named Rules
**The Stencil Rule.** Lo stencil va solo in maiuscolo e solo su parole brevi. Una frase intera si scrive in Big Shoulders Text.

## Layout

La tela è la finestra intera: `html` e `body` non scorrono, e il canvas occupa tutto. Gli elementi HTML sono fissati ai bordi e lasciano libero il centro, dove sta il mixer.

- Avvio: in basso a sinistra, con margini `clamp` (da 20 a 96px di lato, da 28 a 120px dal fondo);
- Marchio in alto a sinistra, inquadrature in alto a destra, entrambi a circa 18px dal bordo;
- Barra in fondo: quattro deck in griglia a colonne uguali, trasporto a destra;
- Prototipo e Traccia: colonna a destra, larga al massimo 340px, con scorrimento interno; se ne apre una alla volta.

Sotto i 860px la barra va in colonna, i deck passano a due colonne e il marchio sparisce. L'uso previsto resta il Mac con mouse o trackpad.

## Elevation & Depth

La profondità viene dalla scena 3D e dalla luce. L'interfaccia è piatta e separa i livelli con veli di fuliggine semitrasparenti. Le ombre servono a due scopi: staccare il testo dai mattoni e dare calore al pulsante Accendi.

### Shadow Vocabulary
- **Stacco del testo** (`text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8)`): ogni testo posato sulla scena senza fondo.
- **Alone al sodio** (`box-shadow: 0 10px 36px rgba(255, 140, 40, 0.28), 0 2px 0 var(--sodio-scuro)`): solo il pulsante Accendi, come se la lampada lo colpisse.
- **Suggerimento** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)`): l'etichetta del valore accanto al comando.

### Named Rules
**The Velo Rule.** Un pannello sopra la scena è fuliggine con alfa almeno 0,72 e un filo di bordo. Niente sfocatura dello sfondo: la scena è già pesante da disegnare.

## Shapes

Tutto ha spigoli vivi: il raggio è zero in ogni elemento HTML. I bordi sono di 1px col colore del filo. Le forme curve stanno solo nella scena: manopole, trombe, coni.

## Components

### Buttons
Secchi e meccanici, come i tasti di un rack.
- **Forma:** spigoli vivi.
- **Play:** nel trasporto, pieno di sodio quando il suono è fermo, perché è l'azione che manca; premuto diventa Pausa, pieno di osso come gli altri tasti di barra.
- **Accendi:** il pulsante pieno al sodio della schermata d'avvio, con la scritta stencil a 26px. All'hover sale di 2px e l'alone cresce. Da disabilitato scende a opacità 0,6. Porta anche il testo di avanzamento del caricamento.
- **Trasporto e deck:** trasparenti con filo di bordo, che all'hover passa a osso sporco. Premuti o aperti, si riempiono di osso.
- **Focus:** contorno al sodio di 2px, staccato di 3px.

### Selettori del prototipo
- **Stile:** gruppi di scelte su fuliggine calda, con filo di bordo.
- **Stato:** la scelta attiva si riempie di sodio con testo in peso 600.

### Deck
La cella di lavoro della barra.
- **Struttura:** numero stencil al sodio, titolo e tempo, azioni a destra.
- **Misure vive:** una barra di 3px a sinistra sale col livello, una di 3px in fondo segue la corsa, entrambe al sodio.
- **Bersaglio del trascinamento:** bordo al sodio e fondo #2a1d10.

### Navigation
Le quattro inquadrature (Mixer, Sessione, Impianto, Stack) sono una fascia compatta su velo di fuliggine, con la voce attiva piena di osso. Esistono solo nel cortile. L'ultima voce, al sodio, cambia scena: "Dall'alto" dal cortile, "Cortile" dalla vista dall'alto.

### Suggerimento
L'etichetta che mostra nome e valore del comando toccato: osso pieno, testo fuliggine, cifre tabellari. È l'unico elemento chiaro in piena sessione, perché si legge mentre l'occhio è sul comando.

### Mixer 3D
Il componente che definisce il progetto. La disposizione e i nomi dei comandi vengono dai documenti di Filippo e restano i suoi: GAIN, LOW-MID, KILL FISSO, GROWL, NASTRO. Una vista dell'interfaccia non sostituisce mai il pannello con controlli HTML.

### Qualità del cortile
Il cortile è la scena di default e ha quattro gradini. L'atmosfera è la stessa in tutti: cambiano risoluzione, bloom, fumo e disegni al secondo. La pagina parte da "media", misura i frame e scende da sola; ricorda il gradino per la visita dopo.

| | alta | media | bassa | essenziale |
|---|---|---|---|---|
| Risoluzione (pixelRatio) | fino a 2 | fino a 1,5 | 1 | 0,75 |
| Bloom | pieno | a metà risoluzione | spento | spento |
| Ombre | morbide | morbide | nette | nette, senza quella del faretto |
| Materiali | con riflessi | con riflessi | con riflessi | opachi |
| Fumo | 420 particelle | 220 | 120 | 60 |
| Col suono | ogni frame | 30 al secondo | 30 al secondo | 20 al secondo |

- **Ombre ferme:** si calcolano una volta e si rifanno solo quando un comando si sposta.
- **Disegno su richiesta:** a riposo la scena non disegna. I movimenti della camera sono sempre a pieno ritmo.
- **Telefono:** si parte da "bassa" e i tetti di risoluzione raddoppiano: i pixel sono pochi e sotto 1,5 il pannello non si legge. In verticale la vista Mixer riempie la larghezza dello schermo.
- **Indirizzo:** `?qualita=alta|media|bassa|essenziale|minima` sceglie e ricorda il gradino.

### Vista dall'alto
L'ultimo gradino ("minima"), per i computer che non reggono il cortile. Mostra solo il mixer e i quattro pedali dall'alto, coi loro colori, sotto una luce calda al sodio, su fondo fuliggine. Niente ombre, bloom, nebbia, immagini. Non parte mai da sola: la apre la voce "Dall'alto" della fascia in alto a destra, che si accende al sodio quando anche il gradino essenziale va a scatti. Prima dell'accensione il pannello resta in penombra dietro il titolo.

## Do's and Don'ts

### Do:
- **Do** tieni il sodio come unico accento dell'interfaccia e fai combaciare ogni nuova luce calda con la sua tinta;
- **Do** dai `text-shadow` a ogni testo posato sulla scena senza fondo;
- **Do** usa veli di fuliggine con alfa almeno 0,72 per i pannelli sopra la scena;
- **Do** lascia libero il centro dello schermo: lì sta il mixer;
- **Do** rispetta `prefers-reduced-motion`: niente voli di camera, niente fumo e legno fermo; i coni respirano col livello a un terzo della corsa, i VU restano perché sono misure.

### Don't:
- **Don't** arrotondare gli angoli degli elementi HTML;
- **Don't** introdurre un tema chiaro: il contesto d'uso è la notte;
- **Don't** usare `backdrop-filter`: la scena three.js consuma già la GPU;
- **Don't** ricolorare pannelli, manopole o LED di Filippo;
- **Don't** rinominare o tradurre i comandi del mixer;
- **Don't** far scorrere la pagina: scorre solo il pannello Prototipo.
