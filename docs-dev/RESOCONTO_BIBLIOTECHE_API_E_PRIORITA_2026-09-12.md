# Biblioteche: API, alternative e priorità di integrazione

Data: 12 settembre 2026.

## Ambito della verifica

Questo resoconto prende per affidabili gli esiti delle prove forniti dal maintainer. Verifica invece, attraverso documentazione ufficiale, le conclusioni sulle interfacce disponibili e propone nuove integrazioni.

Non è un nuovo collaudo delle connessioni: un servizio documentato può essere temporaneamente irraggiungibile o bloccato dalla rete usata. Le priorità sono raccomandazioni, non garanzie di funzionamento.

## Situazione riportata dalle prove

- Ricerca funzionante: Internet Archive, Vaticana, Gallica, e-codices, Institut de France, Bodleian, Estense. Per Estense restano problemi con le copertine.
- Apertura per segnatura o indirizzo: Cambridge e Heidelberg. La ricerca libera Cambridge è stata disabilitata dopo blocchi anti-bot osservati.
- Nessuna risposta utilizzabile: Library of Congress e Harvard.
- I messaggi di errore della ricerca sono stati migliorati per distinguere rifiuto automatico, limiti e indisponibilità del servizio.

## Conclusioni da correggere o qualificare

### Library of Congress

**Esiste un'API pubblica di ricerca documentata.** Supporta ricerca, filtri, paginazione e dettagli delle opere. Il blocco osservato può essere reale, ma non dimostra l'assenza di un'interfaccia pubblica.

Prima di rinunciare all'integrazione, confrontare il percorso usato da Glossa con quello ufficiale. La ricerca generale include anche contenuti diversi dalle collezioni digitali: restringere opportunamente l'ambito. La presenza di un risultato non garantisce una digitalizzazione IIIF utilizzabile.

Fonte: [Library of Congress — API endpoints](https://www.loc.gov/apis/json-and-yaml/requests/endpoints/).

### Harvard

LibraryCloud offre un'API documentata con ricerca per campi e faccette. Un blocco dell'indirizzo di provenienza è una possibile spiegazione del messaggio «troppe richieste», non una causa dimostrata da quel messaggio da solo.

Registrare separatamente errore osservato e causa ipotizzata; verificare accesso al catalogo e disponibilità della digitalizzazione come capacità distinte.

Fonti: [Harvard — APIs and datasets](https://library.harvard.edu/services-tools/harvard-library-apis-datasets), [LibraryCloud — documentazione API](https://harvardwiki.atlassian.net/wiki/spaces/LibraryStaffDoc/pages/43287734/LibraryCloud%2BAPIs).

### Heidelberg

Pubblica interfacce aperte, comprese IIIF e raccolta dei metadati. Questo non dimostra che esista una ricerca libera pronta da integrare, ma lascia alternative alla lettura delle pagine del sito.

Occorre verificare quale interfaccia copra effettivamente i fondi digitalizzati interessanti per Glossa. L'esistenza di interfacce per altri servizi dell'università non garantisce copertura del catalogo storico.

Fonti: [Heidelberg — interfacce aperte](https://www.ub.uni-heidelberg.de/helios/kataloge/datenschnittstellen.html), [heiOPENsearch — ambito e ricerca](https://www.ub.uni-heidelberg.de/Englisch/service/heiopensearch/hilfe.html).

### Cambridge

Mantenere per ora l'apertura diretta funzionante. In questa verifica non è emersa una ricerca pubblica documentata che risolva il problema segnalato. Non è una prova che nessuna alternativa esista.

L'accesso IIIF e la ricerca del catalogo sono capacità separate.

Fonte sul supporto IIIF: [Cambridge University Library — progetto IIIF](https://www.lib.cam.ac.uk/research/digital-humanities/case-studies/dynamic-digital-library-iiif-scoping-project).

## Nuove integrazioni consigliate

| Priorità fra le nuove integrazioni | Biblioteca o servizio | Motivo | Limite da chiarire |
| --- | --- | --- | --- |
| 1 | Wellcome Collection | API di ricerca documentata, senza registrazione, con date, lingue, tipologie, disponibilità e accesso IIIF | Distinguere opere catalogate e materiali digitalizzati effettivamente leggibili |
| 2 | e-rara | Pertinente agli stampati antichi; documenta metadati, PDF e IIIF | La documentazione consultata descrive raccolta metadati, non una ricerca libera pronta |
| 3 | e-manuscripta | Complementare a e-codices per materiali manoscritti; offre metadati e IIIF | Verificare separatamente la ricerca automatizzabile |
| 4 | Bayerische Staatsbibliothek / MDZ | Amplia il materiale storico; documenta manifesti, immagini e metadati | Accesso IIIF documentato; percorso di ricerca da valutare |
| 5 | Europeana | Amplia la scoperta trasversale fra istituzioni | Misurare copertura e qualità dei collegamenti alle scansioni |

L'ordine di realizzazione può differire dalla pertinenza dei contenuti: Europeana può precedere e-rara/e-manuscripta se l'obiettivo immediato è ampliare la ricerca attraverso un servizio documentato.

### Wellcome Collection

Prima aggiunta consigliata per rapporto fra utilità e prevedibilità tecnica. Ricerca e accesso alle digitalizzazioni sono servizi esplicitamente destinati agli sviluppatori. La ricerca è accessibile senza autenticazione o registrazione.

L'API documenta filtri per date di produzione, lingua, tipo, disponibilità e altri attributi. Controllare i parametri: quelli non riconosciuti possono essere ignorati, restituendo risultati non filtrati.

Fonti: [Catalogue API e filtri](https://developers.wellcomecollection.org/api/catalogue), [accesso senza autenticazione ed esempi](https://github.com/wellcomecollection/catalogue-api), [panoramica API e IIIF](https://api.wellcomecollection.org/).

### e-rara ed e-manuscripta

Aggiungerle inizialmente tramite collegamento può già essere utile. L'interfaccia OAI-PMH per raccogliere metadati non equivale a un motore interrogabile in tempo reale per titolo e autore: potrebbe richiedere un indice locale, cioè un lavoro distinto.

Non presentare il supporto alla raccolta dei metadati come prova di una ricerca libera già integrabile.

Fonti: [e-rara — interfacce e dati](https://www.e-rara.ch/wiki/apiinfo), [e-manuscripta — funzionalità e interoperabilità](https://www.e-manuscripta.ch/wiki/aboutEmanuscripta).

### Bayerische Staatsbibliothek / MDZ

Accesso a manifesti e pagine ben documentato. Immagini e OCR hanno limiti da rispettare. La documentazione espone anche raccolte IIIF e un deposito di metadati OAI-PMH.

Non promettere la ricerca libera prima di averne verificato il canale specifico.

Fonte: [MDZ — interfacce ufficiali](https://www.digitale-sammlungen.de/de/schnittstellen).

## Europeana: utile, ma non una soluzione unica

Europeana è una buona aggiunta come aggregatore. Nella presentazione dei risultati distinguere:

- **Trovato tramite Europeana:** servizio che ha restituito il risultato.
- **Conservato presso una biblioteca:** istituzione responsabile del materiale.
- **Immagini servite da un sito:** origine effettiva delle pagine da leggere o scaricare.

Europeana può risolvere la scoperta di un libro senza risolvere un blocco sullo scaricamento delle sue immagini. La presenza di un'istituzione non garantisce che tutte le sue collezioni siano indicizzate. La copertura specifica di Bodleian, Heidelberg, Estense o altri fondi va misurata con esempi, non assunta.

Non scartare automaticamente ogni risultato senza IIIF. Proposta: filtro **«Solo fonti leggibili in Glossa»**. Gli altri risultati possono restare schede bibliografiche con collegamento esterno, senza offrire lettura o download impossibili. Questa è una proposta di prodotto, non una capacità già implementata.

Le API Europeana distinguono ricerca, record e accesso IIIF. Anche un manifesto disponibile va verificato per capire quali immagini e quale copertura dell'opera rappresenti.

Fonti: [Europeana — panoramica API](https://api.europeana.eu/en), [Search API](https://europeana.atlassian.net/wiki/spaces/EF/pages/2385739812).

### Chiave di accesso

Europeana distingue chiavi personali per sperimentazione e chiavi di progetto per servizi operativi. Per la sperimentazione della beta si può partire dal percorso personale; non promettere genericamente che una chiave di progetto sia «immediata».

Fonte: [Registrazione e gestione delle chiavi Europeana](https://www.europeana.eu/en/how-to-register-for-and-manage-an-api-key).

## Ulteriore riferimento: Biblissima+

Particolarmente pertinente per manoscritti e stampe antiche. Documenta raccolte che collegano diverse digitalizzazioni dello stesso manoscritto o diversi esemplari di un'edizione.

È interessante sia come possibile fonte sia come riferimento per presentare le relazioni bibliografiche in Glossa. Non considerarlo un sostituto pronto della ricerca federata: verificare il servizio specifico e i relativi contratti prima di pianificare l'integrazione.

Fonti: [Biblissima+ — API Presentation](https://doc.biblissima.fr/api/api-presentation/), [modalità di condivisione dei dati](https://doc.biblissima.fr/vademecum-biblissima/).

## Ordine operativo suggerito

1. Verificare Library of Congress attraverso il percorso ufficiale, distinguendo API esistente e blocco osservato.
2. Aggiungere Wellcome come nuova integrazione singola.
3. Valutare Europeana come aggregatore, misurando su un campione quanti risultati conducono a fonti leggibili.
4. Sviluppare e-rara, e-manuscripta e MDZ secondo i materiali realmente usati, iniziando dall'apertura diretta dove necessario.
5. Studiare Biblissima+ per copertura specialistica e relazioni fra copie ed edizioni.

Per ogni biblioteca verificare separatamente tre passaggi: **trovo l'opera, apro il libro corretto, leggo le pagine**. Una ricerca con molte schede e poche fonti utilizzabili non è necessariamente un'integrazione riuscita.

## Aggiornamento 12 settembre 2026 (dopo l'implementazione)

Le raccomandazioni di questo resoconto sono state seguite. Stato reale al
termine del lavoro, verificato interrogando i servizi:

- **Wellcome Collection** aggiunta, come suggeriva la priorità 1. La sua
  interfaccia risponde senza registrazione, e il filtro
  `items.locations.locationType=iiif-presentation` toglie alla fonte i libri
  mai digitalizzati: su una ricerca di prova erano quattro su cinque.
- **Europeana** aggiunta, con chiave nel portachiavi del sistema. Si tengono
  solo i risultati che dichiarano una riproduzione; l'istituzione che conserva
  l'originale è mostrata a parte da chi ha risposto alla ricerca.
- **e-rara, e-manuscripta, Bayerische Staatsbibliothek** aggiunte per apertura
  diretta. Come il resoconto prevedeva, nessuna delle tre offre una ricerca
  interrogabile: le prime due rispondono con un controllo anti-robot, Monaco
  pubblica manifesti e raccolta dei metadati.
- **Library of Congress**: l'API esiste ed è documentata, come qui si diceva.
  Dalla rete di sviluppo ogni percorso risponde con un controllo anti-robot,
  compreso il JSON di un singolo elemento noto: è un blocco dell'indirizzo di
  provenienza, non l'assenza di un'interfaccia.
- **Harvard**: l'interfaccia esiste e i parametri usati sono quelli
  documentati. Risponde «troppe richieste» a ogni tentativo, da due reti
  diverse e senza indicare quando riprovare: la ricerca è stata disattivata e
  resta il riconoscimento del gettone.
- **Cambridge**: confermato che non emerge una ricerca pubblica utilizzabile.
  Il filtro del sito blocca dopo poche richieste, quindi la ricerca libera è
  stata disattivata e resta l'apertura per segnatura.
- **Biblissima+** non è stato affrontato: resta da studiare, come qui si
  raccomandava, prima di pianificarne l'integrazione.

Il filtro «Solo fonti leggibili in Glossa» non è stato costruito: per ora si
scartano alla fonte i risultati senza riproduzione, che è la stessa promessa
mantenuta con meno interfaccia. Resta una proposta valida per quando si vorrà
mostrare anche le schede bibliografiche.

## Punti da sottoporre alla prossima analisi

- Quale endpoint usa oggi ciascun provider e quale capacità documentata copre?
- Quali filtri sono realmente applicati al catalogo remoto?
- Quali errori sono stati osservati e quali cause sono soltanto ipotesi?
- Il risultato identifica una scheda, un'edizione, un esemplare o una digitalizzazione?
- Manifesto e immagini sono raggiungibili indipendentemente dalla ricerca?
- Un aggregatore introduce doppioni rispetto ai provider diretti?
- Quanto costa mantenere l'integrazione rispetto al valore dei fondi effettivamente usati?
