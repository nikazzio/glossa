# Design

## Context

Vedi proposal.md per il perché e specs/ per i requisiti.

Stato attuale rilevante:

- Un'opera nasce solo da un manifesto IIIF remoto (`addSourceFromDiscovery` in
  `libraryService.ts`): riga `sources` + copia `source_versions` di tipo
  `iiif_manifest`, primaria.
- La copia PDF (`version_kind = 'pdf'`, al massimo una per opera per
  `idx_source_versions_single_pdf`) nasce solo dal `rendering` del manifesto e
  si scarica con `download::pdf::PdfDownloadJob`: staging, validazione
  `integrity::FileKind::Pdf`, spostamento atomico, `document.json` accanto a
  `document.pdf`, pagine contate con `lopdf`. Il visore PDF (`DocumentViewer`,
  pdf.js) e la scelta immagini/PDF nella scheda esistono già.
- Il deposito è `providers/<chiave biblioteca>/<versione>/` con `manifest.json`,
  `document.pdf`, `pages/<misura>/NNNN.jpg` + `pages.jsonl`, `thumbnails/`.
  La misura è la larghezza in pixel o `max`.
- Il visore a immagini e l'OCR partono dal manifesto della copia
  (`iiif_viewer_manifest`, che con `version_id` legge prima il manifesto
  conservato nel deposito) e leggono le pagine dal deposito, poi cache, poi rete.
  L'OCR accetta solo copie `iiif_manifest` con `sourceUrl`.
- Correzioni dei campi: `source_field_overrides` sopra i valori di base nel blob
  `metadata` della copia (`effectiveFieldValues`/`baseFieldValue`).
- Lavori persistenti: `JobHandler` con `ResourceClass` e `Recovery`
  (`Resumable` torna in pausa e riparte dal punto noto).

Prova del 25 novembre 2026 su un PDF di Internet Archive (308 pagine, due
strati JPEG2000 con maschera per pagina): `hayro` 0.9 disegna le pagine
correttamente a 2623 × 3873 px, 0,6–1,2 s a pagina, circa 330 MB di memoria
di picco. La copia diretta delle immagini incorporate non darebbe la pagina
(sfondo e inchiostro sono separati).

## Goals / Non-Goals

**Goals:**

- Un'opera importata diventa, dopo l'estrazione, indistinguibile a valle da una
  copia scaricata: stesso layout del deposito, stesso manifesto conservato,
  stessi consumatori (visore, miniature, ottimizzazione, OCR) senza rami
  speciali oltre al divieto di rete.
- Nessuna migrazione dello schema.

**Non-Goals:**

- Disegno nella finestra (pdf.js) come percorso di estrazione.
- Rilevamento delle pagine di servizio, copia diretta delle immagini, testo
  nascosto del PDF.

## Decisions

### D1 — Disegno delle pagine nel backend con `hayro`

Lavoro `pdf_page_extraction` nella coda, `ResourceClass::Cpu`,
`Recovery::Resumable`, identificativo `extract:<versione pdf>`. Per ogni pagina:
disegno con `hayro::render` a una scala che porta la larghezza della pagina
alla larghezza dell'immagine incorporata più grande (ripiego: 300 dpi dalla
dimensione della pagina), sfondo bianco, codifica JPEG con il crate `image` già
presente, scrittura in staging e promozione atomica nella cartella di misura,
riga in `pages.jsonl` con impronta e dimensioni, miniatura. La ripresa salta le
pagine già presenti in `pages.jsonl`. Pausa e annullamento si controllano fra
una pagina e l'altra. Il disegno gira fuori dal filo del runtime
(`spawn_blocking`).

Alternative scartate: pdf.js nella finestra (lavoro legato alla finestra aperta,
primo lavoro eseguito dal frontend, coordinamento nuovo con la coda); Pdfium
(binario nativo per sistema da distribuire); MuPDF (AGPL e libreria C da
compilare).

### D2 — Copia a immagini con manifesto generato in locale

A fine estrazione il lavoro scrive nella cartella della copia a immagini un
manifesto IIIF Presentation 3 con un canvas per pagina (dimensioni reali,
etichetta) e registra `expected_asset_count`. La copia è di tipo
`iiif_manifest`, così visore, inventario, ottimizzazione e OCR la trattano come
un libro tutto sul disco. Il suo `source_url` usa uno schema non di rete
(`glossa-import:<versione>`): è unico (serve all'idempotenza) e non può essere
scambiato per un indirizzo.

La copia a immagini si crea all'avvio dell'estrazione con identificativo
derivato `<versione pdf>-img` e non è mai primaria: in un'opera importata la
primaria è la copia PDF, che porta i dati dell'opera nel suo blob `metadata`;
in un'opera esistente resta quella di sempre. Il conteggio atteso si scrive a
fine estrazione.

Alternativa scartata: tipo `copy` o nuovo tipo di copia, che richiederebbe di
insegnarlo a ogni consumatore e, per un tipo nuovo, una migrazione del vincolo.

### D3 — Nessuna rete decisa dalla copia, non dalla biblioteca

Il divieto di rete si decide sullo schema `glossa-import:` della copia (e sulla
copia PDF importata, che non ha indirizzo remoto), nei punti che oggi
ripiegano sulla rete: risoluzione dei byte di pagina (`resolve` /
`bytes_and_source_of`), miniature, rilettura del manifesto, riallineamento dei
metadati, verifica di disponibilità. Una pagina assente risponde con un errore
`page_not_local` che finestra e OCR traducono nel messaggio della specifica.

### D4 — Cartella del deposito

Senza manifesto: chiave riservata `local_import`, **non** registrata fra le
biblioteche (registrarla la farebbe comparire fra le fonti della Ricerca);
cartella `providers/local_import/<versione>/`. Con manifesto: la chiave è quella
riconosciuta dall'indirizzo del manifesto (es. `gallica`), come per un'opera
aggiunta dalla Ricerca; il divieto di rete resta garantito da D3.

### D5 — Importazione del file

Comando backend `import_pdf_document(source_id?, path)`: copia il file in
staging, valida con `FileKind::Pdf`, conta le pagine, promuove in
`document.pdf` e scrive `document.json` con `sourceUrl` = nome del file
d'origine e campo `importedFrom: "local_file"`. Stessa catena e stessi limiti
dello scaricamento (512 MB per il conteggio). La finestra sceglie i file con
`@tauri-apps/plugin-dialog`, già in uso.

Opera nuova: prima il comando backend (file nel deposito), poi una transazione
unica che crea `sources` (stato `active`, `external_ref` dalla biblioteca del
manifesto o `local_import`) e la copia PDF primaria con `source_url =
glossa-import:<versione>`. Un PDF non valido non crea righe; un errore dopo i
file lascia solo una cartella orfana, che lo spazzino del deposito toglie. Opera
esistente: se esiste già una riga PDF senza file (dichiarata dalla biblioteca
ma non scaricata) si riempie quella, altrimenti se ne crea una; con il file già
presente il comando non è offerto.

### D6 — Manifesto caricato dal file e campi

Il manifesto scelto si legge con il parser esistente (`download::manifest`) da
byte locali, senza rete. I suoi dati vanno nel blob `metadata` della copia come
oggi per l'aggiunta dalla Ricerca (valori di base); il file originale si
conserva come `source-manifest.json` nella cartella della copia PDF, per
rileggerlo. I campi modificati nella finestra rispetto al manifesto, o scritti
senza manifesto, si salvano in `source_field_overrides`. Il caricamento
successivo del manifesto usa lo stesso percorso e non tocca le correzioni.
Le etichette dei canvas passano al manifesto generato (D2) solo se il numero
di canvas coincide con le pagine del PDF.

### D7 — Interfaccia approvata (25 novembre 2026)

- Biblioteca: `IconButton` nella riga di `AreaHeading`, prima di
  `CatalogViewSwitch`, suggerimento «Importa un PDF dal computer». Apre la
  finestra di importazione, che crea solo opere nuove.
- Finestra (`Dialog` compatto, righe `SettingRow`): PDF con pagine e dimensione
  dopo la scelta (o avviso se illeggibile, «Importa» spento); manifesto
  facoltativo; Titolo obbligatorio, Autore, Data, Lingua (selettore delle lingue
  dell'opera esistente), Pagina della biblioteca. I campi venuti dal manifesto
  hanno un segno con suggerimento «dal manifesto», che sparisce se il valore
  cambia (diventa correzione). Casella «Estrai subito le pagine», accesa
  all'inizio: a importazione riuscita mette in coda l'estrazione. Annulla /
  Importa.
- Riga PDF della scheda: icona «Estrai le pagine» quando il PDF è sul computer,
  con tre stati (da fare, in corso con «estrazione N di M» nel testo di stato,
  fatta nel colore di stato «già in casa»); pagine non riuscite elencate nel
  suggerimento. Icona «Importa il PDF dal computer» quando il PDF non è sul
  computer: apre solo la scelta del file, senza finestra.
- Opere importate senza manifesto: icona «Carica il manifesto» fra i comandi in
  cima alla scheda. Per le opere importate la scheda non offre il
  riallineamento con la biblioteca.

## Risks / Trade-offs

- [`hayro` è giovane (0.9)] → la prova su Internet Archive è positiva; un
  errore su una pagina la segnala senza fermare il lavoro; il motore resta
  sostituibile dietro una sola funzione di disegno.
- [Memoria con PDF grandi] → il file è tenuto in memoria intero (tetto 512 MB
  come per il conteggio); una pagina alla volta; `RenderCache` riusata.
- [Divieto di rete dimenticato in un punto] → test per ogni punto elencato in
  D3 con una copia `glossa-import:` e nessun server raggiungibile.
- [Pagine di servizio iniziali (Gallica)] → numerazione sfasata rispetto al
  manifesto: le etichette non si applicano se i conteggi differiscono; il salto
  delle pagine resta fuori perimetro finché non c'è un PDF reale.
- [Dimensione su disco] → JPEG a piena risoluzione (circa 0,5–1,5 MB a
  pagina); l'ottimizzazione esistente e «libera spazio» restano disponibili.

## Migration Plan

Nessuna migrazione. Nuova dipendenza `hayro` in `src-tauri/Cargo.toml`
(Rust 1.92 richiesto, presente 1.95). Rimozione: le opere importate restano
opere normali; senza il comando di estrazione le copie già estratte continuano
a funzionare.

## Open Questions

- Qualità JPEG di uscita (proposta 90) e ripiego a 300 dpi: da tarare sui primi
  PDF reali, senza effetti sulla specifica.
