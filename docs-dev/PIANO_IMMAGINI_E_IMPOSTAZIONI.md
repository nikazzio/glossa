# Piano — miniature in locale, libreria immagini, e tutto ciò che si può configurare

Scritto il 2026-08-16, dopo aver misurato lo scaricamento su archive.org.

Tre lavori distinti, che conviene fare in quest'ordine: la libreria immagini apre
la strada alle miniature in locale, e la dimensione delle miniature diventa una
delle cose da mettere in Impostazioni, quindi farle insieme evita di toccare due
volte la stessa schermata.

---

## 1. La libreria per le immagini

### Cosa scegliere

**`image`**, la libreria di riferimento di Rust per decodifica, codifica e
manipolazione. Motivi:

- **è puro Rust**: nessuna libreria di sistema da installare, nessuna
  complicazione nelle build per Windows, macOS e Linux. Le alternative più
  veloci (`turbojpeg`, `libvips`) portano dipendenze C e romperebbero la
  semplicità delle build;
- copre tutto quello che serve **adesso e dopo**: decodifica JPEG e PNG,
  ridimensionamento con filtri di qualità, ritaglio, rotazione, scala di grigi,
  regolazione di luminosità e contrasto, ricodifica con qualità scelta;
- si compila con le sole funzioni che servono
  (`default-features = false, features = ["jpeg", "png"]`), così non ci si porta
  dietro i formati che non useremo mai.

### Cosa apre, oltre alle miniature

Sono tutte cose già in coda nelle issue:

| Servirà a | Issue |
|---|---|
| ritaglio di frammenti dal visualizzatore, con coordinate | #222 |
| filtri visuali per la lettura di manoscritti — contrasto, grigi, inversione | #221 |
| preparazione delle immagini per il riconoscimento testo | #220 |
| immagini derivate e PDF di esportazione | #188 |

### Cosa costa

Tempo di compilazione in più (una volta), qualche megabyte sull'eseguibile, e
`cargo-audit` da tenere d'occhio come per il resto. Nessuna dipendenza di
sistema.

### Dove vive

Un modulo `src-tauri/src/images.rs`, con funzioni pure e provabili senza rete:
ridimensiona, ritaglia, converti. Non conosce il deposito né i lavori: gli si
passano dei byte e restituisce dei byte.

---

## 2. Le miniature si ricavano dalla pagina scaricata

### Perché

Oggi ogni libro costa **due richieste per pagina**: una per la pagina, una per la
miniatura. Su un libro di 924 carte sono 1848 richieste a una biblioteca che
risponde in modo irregolare — misurato: la stessa richiesta va da 1 a 19 secondi
senza un motivo che possiamo prevedere.

La pagina però la scarichiamo già, a 1282 pixel. La miniatura si ricava da lì in
qualche decina di millisecondi, senza chiedere niente a nessuno. È quello che fa
Scriptoria (`thumbnail_utils.py`), ed è coerente con D6 come l'abbiamo corretta
oggi: le miniature vanno con il libro.

### Cosa cambia nel codice

- in `images.rs`: `thumbnail(bytes, lato_lungo) -> Result<Vec<u8>, …>`,
  decodifica, ridimensiona con un filtro decente e ricodifica in JPEG;
- nel gestore dello scaricamento, subito dopo aver validato i byte della pagina:
  si ricava la miniatura, si promuove in `thumbnails/` con la stessa area di
  transito, e si scrive la sua riga con `kind = 'thumbnail'`;
- il lavoro pesa sul processore, non sulla rete: va eseguito fuori dal filo
  principale, altrimenti tiene fermo il runtime mentre lavora.

### Cosa sparisce

- il tipo di lavoro `source_thumbnails` e la sua variante nel gestore;
- la messa in coda del secondo lavoro, e la sua riga nel pannello;
- le voci di traduzione e i test che lo riguardano.

Il pannello torna a **una riga per libro**.

### Cosa mettere in conto

Le miniature esisteranno solo per le pagine scaricate. Oggi non cambia niente,
perché si scarica il libro intero; quando arriverà lo scaricamento della singola
pagina (D4), quel libro avrà le miniature solo di quelle. Per il resto si leggono
online, che è il comportamento normale.

Va aggiornata D6: dice «si scaricano», e diventeranno «si ricavano».

---

## 3. Impostazioni: tutto ciò che si può configurare

Oggi il database contiene dieci impostazioni. Metà non ha nessuna schermata, e
una non ha nemmeno un lettore. Questo è l'inventario verificato il 2026-08-16.

| Impostazione | Valore | Chi la legge | Chi la scrive |
|---|---|---|---|
| `vault_root` | vuoto | deposito, lavori | Impostazioni → Archiviazione |
| `verify_vault_on_startup` | `0` | avvio della coda | Impostazioni → Archiviazione |
| `auto_resume_downloads` | `0` | ripresa dei lavori | Impostazioni → Lavori |
| `jobs_limit_*` (cinque) | vari | limiti della coda | Impostazioni → Lavori |
| `download_size_cap` | `2000` | messa in coda dello scaricamento | **nessuno** |
| `source_read_mode` | `auto` | **nessuno** | **nessuno** |

### 3a. Politica di scaricamento (#422)

Una sezione nuova, **Impostazioni → Scaricamento**:

- **tetto di risoluzione**: la misura verso cui puntare sul lato lungo. Si sceglie
  fra alcuni valori sensati (1000, 1500, 2000, 3000) e «massima». La misura
  chiesta resterà quella dichiarata dalla biblioteca più vicina al tetto, sopra o
  sotto;
- **lato lungo delle miniature**: adesso che le ricaviamo noi, è un numero che
  decidiamo davvero;
- **per biblioteca**: lo stesso tetto, sovrascrivibile per una singola
  biblioteca;
- **per fonte**: l'ultima parola, sulla scheda della fonte in Biblioteca, come
  prescrive D4 («scelta alla fonte, non globale»).

Precedenza: fonte → biblioteca → globale.

### 3b. Profili di rete per biblioteca (#421)

Sezione **Impostazioni → Biblioteche**: l'elenco delle biblioteche del registro,
ognuna apribile sui suoi valori, con il pulsante per riportarla a quelli
compilati nell'applicazione.

Campi, che sono quelli che il profilo già dichiara: pausa minima e massima fra
richieste, limite a raffica (quante richieste in quanti secondi), richieste
insieme per host, tentativi, base e tetto dell'attesa fra un tentativo e l'altro,
raffreddamento dopo un 403 e dopo un 429, timeout di connessione e di lettura,
preriscaldamento del visualizzatore.

Due vincoli da rispettare:

- il **tetto non superabile** sulle richieste insieme (D11) va applicato anche
  nel backend, non solo nel menu: oggi vive solo nel frontend;
- si può aggiungere una voce per un **host** che non è nel registro, come dice
  D18: «modifica dell'utente, salvata nel database per chiave provider o per
  host».

### 3c. Modalità di lettura (D8, D9)

`source_read_mode` esiste nel database e non la legge nessuno. Va messa in
Impostazioni — automatica, solo locale, solo remota — ma **ha senso solo con il
visualizzatore** (#221), perché è lì che si vede la differenza. Da fare insieme a
quello, non prima.

### 3d. Cose già previste altrove, che non vanno perse

Cercate nelle decisioni e in tutte le issue del repository, non solo qui.

| Cosa | Dove era previsto | Stato |
|---|---|---|
| `remote_image_cache_mb` (512) — tetto della cache delle immagini lette online | appendice tecnica di questo documento, D8 | **mai creata**: né colonna, né lettore, né schermata. Va con il visualizzatore (#221), che è chi riempie quella cache |
| Cartella di destinazione delle esportazioni | **#375** | issue aperta a sé, non la tocchiamo qui |
| Impostazioni del visualizzatore: filtri, preset visuali | **#221** | con il visualizzatore |
| Motore locale: modello, privacy, dimensione dello scaricamento | **#391** | area Ollama, separata |
| Limite dei frammenti in parallelo verso i provider | **#167** | area traduzione, separata |
| Variabili personalizzate del progetto | **#16** | area progetto, separata |

### 3e. Cose che nessuno ha ancora previsto

Da decidere, non da fare per forza:

- **quanto tenere i lavori finiti** prima di toglierli dall'elenco: oggi 24 ore,
  fisse nel codice;
- **qualità della ricodifica** delle miniature che generiamo noi: la terrei
  interna, ma è una scelta.

---

## Ordine consigliato

0. *(prima di tutto)* **unire la #420**, che è già molto grande: questi tre
   lavori toccano gli stessi file e diventerebbero illeggibili sopra a quella;
1. **libreria immagini** — piccola, sblocca il resto;
2. **miniature in locale** — media, toglie metà delle richieste e un tipo di
   lavoro;
3. **politica di scaricamento in Impostazioni** (#422) — media, e include la
   dimensione delle miniature che il punto 2 rende una scelta vera;
4. **profili di rete** (#421) — la più grande delle quattro, e l'unica che può
   aspettare senza che nessuno se ne accorga;
5. **modalità di lettura** — con il visualizzatore, non prima.

I punti 1 e 2 stanno in una PR sola. I punti 3 e 4 in una seconda, perché toccano
le stesse schermate.
