# Attuazione — scaricamento, cache e spazio su disco

Documento gemello di `PIANO_SCARICAMENTO_E_CACHE.md`. Quel documento è la specifica:
dice cosa deve succedere e perché, senza nominare il codice. Questo dice **come si
attua**, e nomina moduli, tipi, firme, comandi, tabelle e test.

Regola di lettura: ogni capitolo qui dichiara il paragrafo del piano che attua. Se un
paragrafo del piano non compare in nessun capitolo, manca qualcosa; se qui c'è qualcosa
che il piano non chiede, va tolto o promosso a decisione nel piano.

Stato: scritto il 2026-08-18, contro la revisione `ee648c1` di `fix/scaricamento-robustezza`
e la base `blocco-1`. Tutte le righe citate sono state verificate leggendo il codice.

---

## 1. Stato di partenza, misurato

Serve per il capitolo 9 del piano: questi sono i numeri "oggi".

| Misura | Valore | Dove si legge |
|---|---|---|
| righe di produzione del gestore | 1424 | `src-tauri/src/download/handler.rs`, `#[cfg(test)]` a `:1425` |
| funzione più lunga | `run()` 271 righe | `handler.rs:141-411` |
| seconde per lunghezza | `fetch_page()` 124, `negotiate_size()` 91 | `handler.rs:467`, `:776` |
| deroghe al limite di argomenti | 5 | `handler.rs:419,466,733,775,1054` |
| argomenti della peggiore | 14 | `fetch_page_declaring_long_waits` `:419` |
| tipi dichiarati nel modulo | 23 | `rg -c '^(pub )?(struct\|enum\|type) ' src-tauri/src/download/` |
| unico scrittore di `assets` | `record_asset` | `handler.rs:1363-1390` |

Comandi per rimisurare a fine lavoro:

```bash
rg -n '#\[cfg\(test\)\]' src-tauri/src/download/*.rs      # confine produzione/test
rg -c '^(pub )?(struct|enum|type) ' src-tauri/src/download/
rg -n 'too_many_arguments' src-tauri/src/download/
```

### Cosa resta intatto (capitolo 8 del piano)

`courtesy.rs` (228), `manifest.rs` (197), `fetch.rs` (226, tranne la classificazione del
§3.3), `vault/integrity.rs` (408), `vault/layout.rs` (327, tranne l'estensione ammessa del
§3.4), `jobs/` intero.

---

## 2. Ramo 1 — la cache (attua §5.5, §5.0, e la riga del §5.5 sulla politica di sicurezza)

Primo perché è il più piccolo, non tocca lo scaricamento, e da solo ripara le copertine
invisibili nell'installato.

### 2.1 Nuovo modulo `src-tauri/src/httpcache/`

```
httpcache/
  mod.rs        — HttpCache, chiave, lettura/scrittura, scarto
  request.rs    — CacheRequest e la sua forma stabile
  commands.rs   — i comandi Tauri
```

**Disposizione su disco.** Radice sotto la cartella dati, **mai** sotto il deposito
(D8): `storage_config::resolve_data_dir(app)` (`storage_config.rs:84`) più `cache/`.

Un file per richiesta, nome = impronta della forma stabile, in sottocartelle di due
caratteri per non fare una directory da centomila voci:

```
cache/<primi 2 caratteri>/<impronta>          i byte
cache/<primi 2 caratteri>/<impronta>.meta     tipo di contenuto, scadenza, richiesta in chiaro
```

L'impronta riusa `provenance::fnv1a_hex(&str)` (`provenance.rs:127`), che è già l'hash
del progetto — lo stesso di `vault/integrity.rs:134`. La richiesta in chiaro dentro il
`.meta` serve solo a diagnosticare: nessuno la interroga.

**Niente indice.** Il disco è la verità qui come nel deposito (§5.5):

| Domanda | Risposta |
|---|---|
| c'è? | il file esiste |
| quando è stata usata l'ultima volta? | `mtime` del file, toccato alla lettura con `filetime::set_file_mtime` o una riscrittura del `.meta` |
| quanto occupa? | si somma camminando la cartella, e solo quando serve: allo scarto e in Impostazioni |
| cosa si butta? | si ordina per `mtime` crescente e si butta finché non si scende sotto il tetto |

**Firme:**

```rust
pub struct HttpCache { root: PathBuf }

impl HttpCache {
    pub fn new(root: PathBuf) -> Self;
    pub fn get(&self, key: &CacheKey) -> Option<CachedBytes>;      // tocca mtime
    pub fn put(&self, key: &CacheKey, bytes: &[u8], meta: CacheMeta) -> io::Result<()>;
    pub fn usage(&self) -> CacheUsage;                              // { bytes, files }
    pub fn evict_to(&self, cap_bytes: u64) -> io::Result<u64>;      // ritorna i byte liberati
    pub fn clear(&self) -> io::Result<()>;
}

pub struct CachedBytes { pub bytes: Vec<u8>, pub content_type: Option<String> }
pub struct CacheMeta { pub content_type: Option<String>, pub expires_at: Option<i64> }
```

`get` restituisce `None` anche quando il `.meta` dichiara una scadenza passata: è così che
le ricerche scadono e le immagini no (tabella del §5.5).

### 2.2 `CacheRequest` — la domanda, non l'indirizzo

```rust
pub enum CacheRequest {
    Remote { url: String },                                   // copertine, miniature remote
    Page { version_id: String, index: u32, size: SizeSpec },   // il visore futuro (§5.5)
    Search { provider: String, query: String, page: u32, filters: BTreeMap<String, String> },
}

impl CacheRequest { pub fn key(&self) -> CacheKey; }
```

La forma stabile è testo canonico prima dell'hash: `remote|<url>`,
`page|<version>|<index>|<size>`, `search|<provider>|<query normalizzata>|<page>|<k=v ordinati>`.
`BTreeMap` e non `HashMap` perché l'ordine deve essere lo stesso a ogni giro.

Il ramo `Page` si dichiara adesso anche se nessuno lo chiama: è il motivo per cui la cache
non andrà rifatta quando arriva il visore (§5.5), e costa tre righe.

### 2.3 Catena di risoluzione di un'immagine (§5.5)

Vive in `httpcache/commands.rs`, non dentro `HttpCache`, perché conosce il deposito:

1. deposito alla misura chiesta → `vault::layout::page_path(...)`, si restituisce il file;
2. deposito a misura maggiore → si rimpicciolisce sul momento con `images::resize_jpeg`
   (§4.1) **e si mette in cache** con la chiave della misura chiesta;
3. cache → `HttpCache::get`;
4. rete → `download::fetch::fetch` con il profilo di `iiif::settings::effective_profile`,
   poi `put`.

Il passo 2 in cache è esplicito nel piano: rifarlo a ogni voltata di pagina significa
decodificare un JPEG grande ogni volta.

### 2.4 La cortesia diventa condivisa

Oggi `Courtesy::new()` nasce dentro la coda e non esce di lì
(`src-tauri/src/jobs/commands.rs:149`), avvolta in `Arc` e passata al solo
`SourceDownloadJob`. La cache deve passare dalle stesse pause, altrimenti quaranta
copertine sono quaranta richieste sparate (§5.5).

Modifica: `Arc<Courtesy>` diventa stato gestito dell'applicazione, creato in `lib.rs`
prima di `jobs::commands::start(app)` (`lib.rs:96`) e passato sia alla coda sia a
`HttpCache`. `courtesy.rs` non cambia di una riga.

Effetto collaterale voluto: i contatori restano per host, quindi una copertina e una
pagina della stessa biblioteca condividono la fila.

### 2.5 Comandi Tauri nuovi

Registrati nel blocco unico `src-tauri/src/lib.rs:131-201`:

| Comando | Firma | Note |
|---|---|---|
| `cached_image` | `(request: CacheRequest) -> Result<Vec<u8>, String>` | la finestra ne fa un indirizzo temporaneo |
| `cache_usage` | `() -> Result<CacheUsage, String>` | per la scheda Dati |
| `clear_cache` | `() -> Result<(), String>` | svuota |

`discover_iiif` (`lib.rs:197`, `iiif/discovery.rs`) non cambia firma: guadagna il
passaggio dalla cache con `CacheRequest::Search` e scadenza dal valore configurato.

### 2.6 La politica di sicurezza

`src-tauri/tauri.release.conf.json:5` — aggiungere `blob:` a `img-src`:

```
img-src 'self' data: blob:;
```

Le politiche sono due (`tauri.conf.json:25` per lo sviluppo, quella di rilascio applicata
da `package.json:24` e `.github/workflows/release.yml:56,88,120`) e differiscono proprio
qui. La guardia della CI (`.github/workflows/ci.yml:136-149`) controlla solo `script-src`:
questa modifica passa senza toccarla.

Nessun host remoto entra nell'elenco, e non deve: i byte arrivano dal motore.

### 2.7 Finestra

Le uniche immagini remote del prodotto sono due:

- `src/components/dashboard/SourceDiscoveryPanel.tsx:175` (`card.thumbnailUrl`)
- `src/components/workspace/LibraryCatalogArea.tsx:432` (`entry.thumbnailUrl`)

Nuovo hook `src/hooks/useCachedImage.ts`:

```ts
export function useCachedImage(request: CacheRequest | null): string | null
```

Invoca `cached_image`, costruisce un `Blob` e un indirizzo temporaneo, lo revoca allo
smontaggio e al cambio di richiesta. Nessuna libreria nuova: oggi nel progetto non esiste
nessun `URL.createObjectURL`, quindi non c'è niente da riconciliare.

Servizio: `src/services/cacheService.ts` con `cachedImage`, `cacheUsage`, `clearCache`,
sullo stesso stampo di `src/services/vaultService.ts`.

### 2.8 Impostazioni (scheda Dati)

Modello a SQL diretta su `app_settings`, quello già usato da
`src/services/downloadSettingsService.ts:75-85` — nessuna migrazione:

| Chiave | Predefinito | Dove |
|---|---|---|
| `cache_max_bytes` | `536870912` (512 MB) | `src/components/settings/StorageSettingsTab.tsx` |
| `search_cache_ttl_hours` | `24` | idem |

Nella scheda: occupazione attuale da `cache_usage`, un `IconButton` per svuotare, e la
frase del §5.5 sul perché alzarlo. Stringhe nuove in `src/i18n/it.json` e `en.json` sotto
`settings.storage.*`, che sono paralleli riga per riga.

Il lato Rust legge le stesse chiavi dove servono, come fa già
`download/mod.rs:26` per il lato lungo delle miniature.

### 2.9 Prove del ramo 1

- unitari `httpcache`: stessa richiesta stessa chiave; l'ordine dei filtri non cambia la
  chiave; una voce scaduta non si restituisce; lo scarto butta la più vecchia e si ferma
  sotto il tetto; svuotare non lascia niente;
- integrazione con `wiremock` (già in uso in `download/handler_it.rs`): due richieste
  uguali toccano la rete una volta sola; una richiesta passa dalla cortesia — si verifica
  che due richieste di fila non partano più vicine della pausa minima del profilo;
- finestra: `useCachedImage` revoca l'indirizzo allo smontaggio (Testing Library).

Prova a mano n. 3 del piano: quaranta risultati, i registri devono mostrare pause fra le
copertine, e la seconda ricerca uguale non tocca la rete.

---

## 3. Ramo 2 — scaricamento e disco (attua §5.1, §5.2, §5.3, §5.4, §5.6)

### 3.1 Nuova disposizione di `src-tauri/src/download/`

| File | Responsabilità | Sostituisce | Tetto |
|---|---|---|---|
| `handler.rs` | aggancio alla coda, il ciclo in sette passi (§5.2) | `handler.rs` intero | < 400 |
| `sizing.rs` | la regola della misura (§5.1) | `size.rs`, `negotiate_size`, `SizeCache`, `DeclaredSizes` | < 300 |
| `sidecar.rs` | file di lato: scrittura in coda, lettura, interpretazione (§5.4) | `record_asset`, `AssetRow` | < 300 |
| `inventory.rs` | le cartelle come inventario e i comandi che lo espongono (§5.4) | le interrogazioni su `assets` sparse fra backend e finestra | < 400 |

`fetch.rs`, `courtesy.rs`, `manifest.rs`, `mod.rs` restano dove sono.

### 3.2 `sizing.rs` — la misura si calcola (§5.1)

```rust
pub enum SizingRule {
    /// La biblioteca tiene pronti i dimezzamenti: si chiede il dimezzamento
    /// con il lato lungo più vicino al tetto.
    Halvings { steps: Vec<(u32, u32)> },
    /// Caso generale: larghezza esatta calcolata dal manifesto.
    ExactWidth,
    /// Tetto «massima», o pagina senza dimensioni dichiarate.
    Full,
}

/// Una sola lettura del descrittore per libro (decisione 5, §5.9).
/// Ripiega su ExactWidth se il descrittore non risponde: il silenzio è
/// passeggero (fatto 6) e non vale la pena inseguirlo.
pub async fn probe(client: &Client, courtesy: &Courtesy, profile: &NetworkProfile,
                   first_page: &Page, signals: &Signals) -> SizingRule;

/// Il token da chiedere per questa pagina. Nessuna richiesta, nessuna memoria.
pub fn token_for(rule: &SizingRule, page: &Page, cap: SizeCap, presentation2: bool) -> SizeToken;
```

Si tiene da `size.rs`: `SizeToken` (`:20`), `full_size(presentation2)` (`:29`, che è il
fatto «la dimensione piena ha due nomi»), `available_sizes` (`:66`), `info_url` (`:77`).
Si butta: `from_info`, `declared_sizes`, `closest_to_cap` e tutta la memoria per gruppo.

`probe` fa anche il secondo controllo del §5.1: se le dimensioni dichiarate dal
descrittore divergono da quelle del canvas, il calcolo si fa su quelle del descrittore.

**Test a tabella**: i 47 gruppi misurati del §4 del piano diventano casi in
`sizing.rs`, con dimensioni del canvas, tetto, regola attesa e token atteso.

### 3.3 La tabella dei rifiuti va attuata in `fetch.rs`

`classify` (`fetch.rs:157-206`) **oggi non rispetta la tabella del §5.1**, in due punti:

- `400` finisce in `ErrorKind::Internal` (`:186`) — indistinguibile da un guasto qualsiasi;
- `501` finisce in `ErrorKind::Transport` perché il ramo `500..=599` (`:180`) lo cattura
  prima, quindi verrebbe ritentato tre volte come se fosse un server che tossisce.

Modifica: un ramo dedicato **prima** di quello dei `5xx`

```rust
400 | 501 => ErrorKind::SizeRejected,   // «la misura chiesta non si può servire»
```

con `SizeRejected` aggiunto a `ErrorKind` (`jobs/mod.rs:146-162`) e trattato come non
ritentabile. `403`/`429` restano `Throttled`/`RateLimited` con il raffreddamento
dell'host, `404`/`410` restano `NotFound`. Senza questa modifica il ripiego del §5.1 non
è attuabile, e un solo `403` declasserebbe il libro.

Il caso ambiguo del §5.1 — `5xx` che insiste sulla stessa pagina — si tratta nel gestore,
non qui: esaurito il ritentativo, si prova `max` **per quella pagina sola**, e se fallisce
si salta senza declassare il libro.

### 3.4 `sidecar.rs` — il file di lato (§5.4)

Percorso: `providers/<biblioteca>/<digitalizzazione>/pages/<misura>/pages.jsonl`, cioè
dentro la cartella che descrive. Una riga per pagina, JSON su una riga sola.

```rust
pub struct PageRecord {
    pub index: u32,
    pub label: Option<String>,
    pub got: Option<(u32, u32)>,   // pixel effettivi; None se saltata
    pub bytes: Option<u64>,
    pub checksum: Option<String>,  // FNV-1a, lo stesso di integrity.rs:134
    pub at: i64,
    pub note: Option<Note>,
}

pub enum Note {
    /// Ridotta in casa dopo un rifiuto della misura (§5.1 regola 3): è una
    /// ricompressione, e la pagina non è come è arrivata.
    Downscaled { from: (u32, u32) },
    /// Non servita dalla biblioteca (fatto 7). Regge l'inventario onesto e
    /// la ripresa a scadenza (§5.3).
    NotServed { last_try: i64 },
}

pub fn append(dir: &Path, record: &PageRecord) -> io::Result<()>;   // dopo lo spostamento atomico
pub fn read(dir: &Path) -> Vec<PageRecord>;                          // scarta le righe illeggibili
```

**Regole non negoziabili**, dal §5.4:

- si scrive **in coda**, mai riscrivendo il file: il caso peggiore di un'interruzione è
  una riga troncata, che `read` scarta;
- si scrive **dopo** lo spostamento atomico della pagina, mai prima;
- un file **senza** la sua riga è una pagina presente di cui non si conosce l'impronta:
  si conta, la verifica rapida la vede, la completa la salta. Vale anche per i depositi
  che esistono già, quindi **nessuna migrazione dei file**;
- l'ultima riga per un indice vince, così l'ottimizzazione locale (§4) può riscrivere
  l'impronta senza riscrivere il file.

**Una modifica al validatore dei percorsi**: `vault/layout.rs:59` ammette solo `jpg`,
`json`, `pdf`. Va aggiunto `jsonl`, altrimenti `validate_vault_path` rifiuta il file di
lato e `absolute_path` (`vault/mod.rs:161`) non lo risolve.

### 3.5 `inventory.rs` — le cartelle sono l'inventario (§5.4)

```rust
pub struct SizeFolder { pub size_tag: String, pub pages: u32, pub bytes: u64 }
pub struct VersionInventory {
    pub version_id: String,
    pub provider_key: String,
    pub sizes: Vec<SizeFolder>,
    pub principal: Option<String>,   // la misura con cui il libro è stato scaricato
}
```

`principal` è la cartella con più pagine: è ciò che permette all'interfaccia di dire
«completo a 2000, più tre a piena risoluzione» invece di «incompleto» (§5.4, §5.6).

Comandi nuovi, registrati in `lib.rs`:

| Comando | Firma | Sostituisce |
|---|---|---|
| `version_inventory` | `(version_id) -> VersionInventory` | il `COUNT` su `assets` |
| `library_inventory` | `() -> Vec<VersionInventory>` | la stessa `JOIN` per tutta la scheda |
| `version_page_paths` | `(version_id) -> Vec<String>` | `libraryService.versionPagePaths` |

`version_folders` (`vault/commands.rs:673`), che cerca la cartella sotto **tutte** le
biblioteche, si riusa così com'è: è la parte buona della correzione `43e0b76`, e resta
necessaria perché la chiave della biblioteca si deduce da dati che possono essere già
stati cancellati.

### 3.6 Il ciclo, e cosa sparisce (§5.2, §5.3)

`run()` scende a sette passi. Spariscono:

| Cosa | Dove sta oggi |
|---|---|
| `Checkpoint` e tutto il suo seguito | `handler.rs:74`, `seed_sizes:928`, `refresh_sizes:943`, `save_point:974` |
| la scrittura di `jobs.checkpoint` da questo lavoro | `handler.rs:320,340` — la colonna resta per gli altri lavori |
| `SizeCache`, `DeclaredSizes` | `handler.rs:872,905` |
| `record_asset`, `AssetRow`, `is_recorded`, `recorded_bytes` | `handler.rs:1363,1349,1146,1127` |
| il recupero della pagina senza riga a 2,65 s | `handler.rs:502-531` |
| la fase «negoziazione» | `phase::NEGOTIATING` `handler.rs:105`, riportata `:787,:854`; etichette `src/i18n/it.json:2035`, `en.json:2035` |

`Recovery::Resumable` (`handler.rs:135`) **resta**: riprendere significa rileggere la
cartella e saltare quello che c'è. Il salto di una pagina già presente è il passo 2.1 del
ciclo.

La condizione di fallimento è sulla **cartella vuota**, non su questo avvio (§5.2).

Restano `stage_and_promote` (`handler.rs:1219`) e la coppia transito/validazione, che il
capitolo 8 del piano mette fra le cose da non toccare.

### 3.7 Il database

Si smette di scrivere righe per pagina e per miniatura. Restano:

- la riga del manifesto e `source_versions.expected_asset_count`, entrambe in
  `record_manifest` (`handler.rs:1265-1342`): il conteggio atteso è l'unica cosa che una
  cartella non sa (§5.4);
- la tabella `assets` in sé, **non si tocca adesso**: si svuota da sé, e la sua sorte si
  decide al collasso delle migrazioni prima della 1.5.

Da registrare per il collasso: `transcription_segments.asset_id`
(`migrations/0001_baseline_2_0.sql:331`) e `jobs.owner_asset_id` (`:380`) sono colonne che
**nessuna riga di codice scrive o legge** — verificato. Il collegamento futuro fra una
trascrizione e la sua pagina va su `(source_version_id, page_index)`.

### 3.8 I lettori da spostare su cartella

È la parte più diffusa del ramo, ed è quasi tutta nella finestra, che oggi interroga il
database direttamente via `db::execute_transaction`.

| Chi | Dove | Diventa |
|---|---|---|
| conteggio e byte nella scheda | `src/services/libraryService.ts:100-148` (`COUNT(DISTINCT a.page_index)`, `SUM(byte_size)`) | `library_inventory` |
| percorsi delle pagine | `libraryService.ts:241` | `version_page_paths` |
| «dimentica» le righe dopo «libera spazio» | `libraryService.ts:263` | **si cancella**: non ci sono righe da dimenticare |
| chiave della biblioteca dedotta dai percorsi | `libraryService.ts:226` | dall'inventario |
| elenco dello scaricato nel backup | `src/services/backupService.ts:133-158` | cartelle per misura dall'inventario |
| opere incomplete dopo un ripristino | `src/services/restoreFollowUp.ts:79-113` | file presenti contro conteggio atteso |
| «completo / parziale» | `src/services/vaultService.ts:264-273` | distingue la misura principale dalle pagine prese a parte |

`summarizeAvailability` cambia forma: prende l'inventario e il conteggio atteso, e sa
rispondere «completo a 2000, più tre a piena risoluzione» (§5.4, §5.6). È la funzione che
oggi produrrebbe un avviso di incompletezza dove non manca niente.

`assets` resta escluso dal backup (`src/schemas/externalData.ts`, già così), quindi il
ripristino non ha niente in più da preservare — anzi, il travaso in tabella temporanea di
`backupService.ts:234-280` si semplifica.

### 3.9 La verifica del deposito

`src-tauri/src/vault/verification.rs` è documentato «Il database è la verità (D5)»
(`:3`): il commento e il meccanismo si invertono.

| | Oggi | Dopo |
|---|---|---|
| elenco da controllare | `registered_paths` → `SELECT vault_path, checksum FROM assets` (`:236`) | le cartelle `pages/<misura>/` |
| rapida | il file esiste (`:160`) | quante pagine ci sono contro il conteggio atteso |
| completa | `integrity::scan_file` contro `assets.checksum` (`:150`) | contro il file di lato, **saltando** i file senza riga |
| miniature | verificate | non più: sono derivate e si rigenerano (§5.4) |
| orfani | file non registrati (`:290`) | cartelle di digitalizzazioni che il database non conosce più |

`integrity.rs` non cambia: continua a validare forma e impronta in un passaggio solo.

### 3.10 La pagina singola a piena risoluzione (§5.6)

Non è un lavoro della coda: è un comando.

```
download_single_page(version_id, index) -> Result<(), String>
```

Chiede la dimensione piena, passa dalla cortesia, scrive in `pages/max/<indice>.jpg` con
la sua riga nel file di lato di quella cartella. Vale identico su un libro sfogliato
online, dove diventa la prima cosa che quel libro ha nel deposito.

### 3.11 Prove del ramo 2

Si porta avanti l'impianto di `download/handler_it.rs` (452 righe, biblioteca finta con
`wiremock`): è infrastruttura, non codice vecchio. I tre casi già scritti restano validi
con il meccanismo nuovo — una pagina che la biblioteca non ha non porta via il libro, un
descrittore che non arriva non porta via il libro — mentre il terzo («una ripresa non
rinegozia la misura») si riscrive come «una ripresa non rilegge il descrittore».

Nuovi:

- tabella dei 47 gruppi in `sizing.rs`;
- `400` e `501` fanno ripiegare su `max` per il resto del libro; `403` **no**;
- una riga troncata in coda al file di lato non fa perdere le altre;
- un file senza riga si conta e la verifica completa lo salta;
- una pagina non servita lascia la sua riga, e la ripresa non la richiede prima della
  scadenza.

---

## 4. Ramo 3 — ottimizzazione locale (attua §5.7)

Viene dopo il ramo 2 perché riscrive il file di lato, che nel ramo 2 nasce.

### 4.1 Cosa serve a `images.rs`

Oggi c'è solo `thumbnail(bytes, long_edge)` (`images.rs:43`), con qualità fissa interna
(`THUMBNAIL_QUALITY = 80`, `:22`). Serve la stessa macchina con la qualità in ingresso:

```rust
pub fn resize_jpeg(bytes: &[u8], long_edge: u32, quality: u8) -> Result<Vec<u8>, ImageError>;
```

`thumbnail` diventa una chiamata a questa con `THUMBNAIL_QUALITY`. `fit_inside` (`:49`)
già non ingrandisce, che è la regola «non tocca chi è già più piccolo».

Serve anche a `httpcache` per il passo 2 della catena (§2.3), quindi in ordine di lavoro
questa funzione appartiene al **ramo 1** e qui si riusa.

### 4.2 Il lavoro della coda

Nuovo `src-tauri/src/optimize/`, registrato accanto agli altri due in
`jobs/commands.rs:149-157`, `JOB_TYPE = "image_optimization"`,
`ResourceClass::Cpu` (non rete: non chiede niente a nessuno).

Configurazione: digitalizzazione, **una cartella di misura**, lato lungo, qualità.

Per ogni pagina sopra il lato lungo scelto: decodifica, ridimensiona, ricomprime, scrive in
transito, sostituisce con lo spostamento atomico di `stage_and_promote`, **accoda al file
di lato** la riga nuova con l'impronta nuova e `Note::Downscaled { from }`, rifà la
miniatura. Riferisce byte liberati pagina per pagina.

Non tocca la cache (materiale di passaggio), non tocca le cartelle diverse da quella
scelta, non parte da sola.

### 4.3 Impostazioni e conferma

Scheda Scaricamento (`src/components/settings/DownloadSettingsTab.tsx`), stesso modello a
SQL diretta: `optimize_long_edge` (2000, estremi 512-12000) e `optimize_jpeg_quality`
(82, estremi 40-100). Scavalcabili al lancio.

La conferma dichiara quante pagine, da quale misura a quale e quanto si prevede di
liberare, ed è irreversibile: va detto.

---

## 5. Ordine, PR e verifica

### 5.1 Sequenza

| | Ramo | Contenuto | Dipende da |
|---|---|---|---|
| PR-A | `fix/jobs-tentativi-e-durata` | il commit `c95d8fa` estratto da #440 | — |
| PR-B | ramo 1 | cache, copertine, ricerche, politica di sicurezza, `resize_jpeg`, due impostazioni | PR-A no, indipendente |
| PR-C | ramo 2 | scaricamento, misura, disco come verità, file di lato, inventario | PR-B per `resize_jpeg` |
| PR-D | ramo 3 | ottimizzazione locale | PR-C per il file di lato |

Le rifiniture della fase 4 del piano si sciolgono dentro il ramo che tocca quel codice:
«carte» → «pagine» nei commenti del ramo 2, l'indirizzo mai chiesto sparisce con il
recupero, la stima del tempo a finestra mobile sta in `handler.rs::estimated_seconds`
(`:1411`), ramo 2.

### 5.2 Cosa si fa della PR #440

Cinque commit sopra la base `blocco-1`:

| Commit | | Esito |
|---|---|---|
| `c29c85d` | un descrittore che non arriva non porta via il libro | superato dal §5.1 |
| `c95d8fa` | **coda: tentativi e durata** | **si porta avanti in PR-A** |
| `43e0b76` | cancellazione guidata dalle righe | superato dal §5.4; la ricerca della cartella sotto tutte le biblioteche si riusa (§3.5) |
| `df65c5c` | documentazione | il contenuto vive nel capitolo 3 del piano |
| `ee648c1` | si chiede solo ciò che la biblioteca dichiara | superato, e introduce il difetto su Gallica |

#440 si chiude senza fondere; **il ramo non si cancella**, perché `handler_it.rs` è la
base delle prove del ramo 2. Chiudere riporta anche Gallica a funzionare come prima.

### 5.3 I numeri del capitolo 9, e chi li porta

| Misura | Oggi | Obiettivo | Ramo |
|---|---|---|---|
| righe del gestore | 1424 | quattro file sotto 500 | 2 |
| funzione più lunga | 271 | sotto 80 | 2 |
| argomenti della peggiore | 14 | 8 | 2 |
| deroghe al limite di argomenti | 5 | 0 | 2 |
| richieste di rete per pagina | 1,14 | 1,003 | 2 |
| tipi e strutture nel modulo | 23 | sotto 15 | 2 |
| copertine visibili nell'installato | 0 | tutte | 1 |

Le sette prove a mano del piano: la 3 al ramo 1; 1, 2, 4, 5, 7 al ramo 2; la 6 al ramo 3.

### 5.4 Documentazione da aggiornare a fine ramo

`docs-dev/ARCHITECTURE.md` (comandi Tauri nuovi, disposizione del deposito, cache),
`docs-dev/BLOCCO_1_DECISIONI.md` (D4 sostituita, D2/D5/D7 modificate, D6/D8 estese),
`STATO_SESSIONE_2.0.md`, l'aiuto in-app, e le guide pubbliche `docs/` e `docs/en/` —
`storage-and-jobs.md` in entrambe le lingue parla del deposito e dei lavori.
