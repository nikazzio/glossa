# Proposal

## Why

Alcune biblioteche (oggi Gallica) bloccano ricerca, manifesto e immagini alle
richieste automatiche: da Glossa non si può più aggiungere l'opera né leggerne
le pagine. Lo studioso riesce però a procurarsi il PDF dal browser. Serve un
modo per portare quel PDF in Biblioteca e lavorarci come su ogni altra opera,
OCR compreso. È il primo passo del percorso di Trascrizione verso il tag 2.0
(roadmap, punto 1); copre anche la voce «OCR delle pagine PDF» di #502.

## What Changes

- Nuovo comando in Biblioteca per **importare un PDF** dal computer: crea
  un'opera nuova. Insieme al PDF si può caricare, facoltativo, il **manifesto**
  della biblioteca salvato dal browser.
- Finestra di importazione con: file PDF, manifesto facoltativo, titolo
  (obbligatorio), autore, data, lingua, indirizzo della pagina della biblioteca
  (facoltativo).
- I campi letti dal manifesto valgono come dati della biblioteca; i campi
  scritti a mano valgono come correzioni, come già oggi nella scheda dell'opera.
  Caricare il manifesto in seguito riempie i dati della biblioteca e lascia
  intatte le correzioni.
- Un PDF si può importare anche in un'opera già presente in Biblioteca, come sua
  copia PDF, quando l'opera non ne ha già una sul computer.
- Nuovo **lavoro in coda «Estrai le pagine»**: disegna ogni pagina del PDF come
  immagine alla risoluzione dell'originale, in sottofondo, con avanzamento,
  pausa, annullamento e ripresa dalla prima pagina mancante.
- A estrazione completata l'opera ha una **copia a immagini** come quelle
  scaricate dalle biblioteche: visore a immagini, miniature, ottimizzazione e
  **OCR** funzionano allo stesso modo. Il PDF resta finché l'utente non lo
  toglie.
- Le opere importate senza biblioteca dietro **non contattano mai la rete** per
  pagine o dati: una pagina mancante si dichiara mancante.

Fuori dal perimetro:

- salto automatico delle pagine di servizio aggiunte da alcune biblioteche
  all'inizio del PDF (da valutare su un PDF Gallica reale);
- copia diretta delle immagini contenute nel PDF senza ridisegno;
- lettura di schede di catalogo in altri formati (UNIMARC, Dublin Core, …);
- uso del testo nascosto già presente in alcuni PDF;
- importazione di cartelle di immagini;
- estrazione delle pagine mentre il visore le mostra.

Scelte aperte, da proporre con uno schema e approvare prima di implementarle:

- posizione, icona e suggerimento del comando di importazione in Biblioteca;
- disposizione e testi della finestra di importazione;
- posizione del comando «Estrai le pagine» nella scheda dell'opera e testi
  degli stati (in corso, completata, errore);
- come si sceglie di importare in un'opera esistente invece che in una nuova.

## Capabilities

### New Capabilities

- `library`: comportamento della Biblioteca. In questo change: importazione di
  un PDF, metadati dell'opera importata, estrazione delle pagine come lavoro in
  coda, assenza di rete per le opere importate.

### Modified Capabilities

- `transcription`: la lettura automatica funziona sulle pagine estratte da un
  PDF importato, solo dal computer, e dichiara le pagine mancanti.

## Impact

- Parte interna dell'app: nuovo motore di disegno dei PDF (libreria Rust
  `hayro`, licenza MIT/Apache, nessun file esterno da distribuire); nuovo tipo
  di lavoro in coda; cartella propria del deposito per le opere importate;
  comando di importazione con copia e verifica del file.
- Interfaccia: comando e finestra di importazione in Biblioteca, comando di
  estrazione nella scheda dell'opera, voce del nuovo lavoro nei Lavori.
- Database: nessuna migrazione prevista (si usano i tipi di copia esistenti).
- Documentazione: guida in-app, documentazione pubblica IT/EN, architettura.
