---
title: Biblioteca e fonti IIIF
---

# Biblioteca e fonti IIIF

La ricerca delle fonti parte dalla Dashboard. La Biblioteca è il catalogo personale delle fonti che hai scelto di aggiungere.

## Cercare una fonte

Nella Dashboard scegli l'archivio, scrivi una ricerca e avviala con l'icona di ricerca. Al momento Internet Archive offre la ricerca per parole; il provider IIIF generico apre invece un URL di manifest IIIF.

Ogni risultato mostra miniatura e dati essenziali. Selezionandolo, la scheda si apre e mostra titolo completo, descrizione e tutti i metadati disponibili. Puoi cambiare visualizzazione dall'icona accanto alla ricerca: tre o quattro schede per riga, oppure un elenco compatto — l'icona mostra sempre quella attiva.

La ricerca non scarica materiale.

## Aggiungere una fonte alla Biblioteca

Ogni risultato ha due comandi:

- **Aggiungi alla Biblioteca** — la salva nel catalogo personale, senza collegarla a nessun workspace.
- **Aggiungi a un workspace** — apre l'elenco dei tuoi workspace: scegline uno per collegare subito la fonte lì, oltre a salvarla in Biblioteca.

Una fonte è unica per manifesto: aggiungerla di nuovo non crea un duplicato, collega semplicemente il nuovo workspace scelto.

## Biblioteca personale

La Biblioteca mostra **sempre tutti i libri**: è un catalogo, non la vista di un workspace.

Su ogni scheda, accanto ai comandi, vedi **a quali workspace appartiene** quel libro: un'etichetta per ognuno. Cliccarne una lo scollega da lì; il comando accanto apre l'elenco dei workspace dove non è ancora, per collegarlo. **Un'opera può stare in più workspace insieme** e non viene mai duplicata: collegarla in due posti non fa due copie, né dei dati né dei file.

I comandi della scheda sono in due gruppi: prima cosa fai al libro — scarica, verifica, riduci le immagini, libera spazio, archivia, elimina — poi dove sta.

Sopra l'elenco c'è la **barra di ricerca**: scrivi titolo o autore, e accanto scegli tipo, lingua, biblioteca di provenienza, disponibilità, workspace e collezione. Il filtro workspace mostra le opere collegate a quello che scegli, oppure — con l'ultima voce — solo quelle che non stanno in nessun workspace. I filtri lavorano su quello che hai già davanti, senza ricaricare niente, e le tendine offrono solo i valori davvero presenti nel tuo catalogo. Il comando con la gomma azzera tutto.

**Ordinamento** — L'ultima tendina decide l'ordine: per titolo (come parte), per autore (le opere senza autore vanno in fondo) oppure per data di aggiunta, dalla più recente. L'ordine scelto entra anche nelle viste salvate.

**Viste salvate** — Il comando col segnalibro apre le viste salvate: dai un nome alla combinazione di filtri che stai usando e la ritrovi lì, con un clic. Ogni vista si può eliminare. Una vista salvata quando i filtri erano diversi continua a funzionare: quello che non si riconosce più torna semplicemente neutro.

**Collezioni** — Una collezione è un'etichetta che raccoglie opere. Si aggiunge dalla scheda dell'opera, e un'opera può stare in **più collezioni insieme**: non si fonde e non si duplica niente, e togliere un'etichetta non tocca né l'opera né le altre collezioni. Dalla barra di ricerca puoi mostrare solo le opere di una collezione.

Cliccando il titolo si apre la **scheda dell'opera**, a tutta pagina: dati (titolo, tipo, autore, data, lingua, provenienza, disponibilità, spazio occupato, stato), le copie digitali registrate con il loro limite di qualità, i workspace dove puoi collegarla o scollegarla, e i comandi dell'opera raccolti in alto. In fondo c'è il posto dove arriverà il visore delle pagine. Il comando con la freccia riporta al catalogo.

**Correggere i dati** — Titolo, tipo, autore, data e lingua si correggono a mano: il comando con la matita apre il campo, Invio salva, Esc annulla. Un campo corretto porta un segno accanto all'etichetta; passandoci sopra leggi cosa diceva la biblioteca, e il comando accanto al valore riporta all'originale. **Il dato originale non viene mai sovrascritto**: la correzione vive a parte, come le correzioni ai dizionari, quindi si può sempre tornare indietro. Riscrivere esattamente il valore della biblioteca non lascia nessun segno di correzione, perché non c'è niente da segnalare.

## Scaricare una fonte

Nel catalogo ogni riga dice **quante pagine sono davvero sul computer**: *solo online*, *34 pagine su 210 sul computer*, oppure *tutte le pagine sul computer*.

Il comando **scarica** mette in coda il lavoro vero: puoi cambiare schermata, metterlo in pausa, riprenderlo. Mentre gira, al posto del comando compare la percentuale; nel pannello dei lavori in basso trovi la stessa cosa con il nome dell'opera e quanto ha scaricato.

Quando una fonte è tutta sul computer il comando **sparisce**, e al suo posto resta un segno di spunta: non c'è niente da chiedere alla biblioteca, e con i limiti di cortesia un manoscritto intero può costare un quarto d'ora di rete.

**A che risoluzione** — Glossa **calcola** la misura da chiedere: dalle dimensioni della pagina, che il manifesto della biblioteca dichiara, ricava la larghezza che porta il lato lungo a 2000 pixel, e chiede quella. Non c'è nessuna trattativa e nessuna richiesta in più per pagina.

All'avvio di ogni libro fa una domanda sola alla biblioteca, che costa qualche secondo su un lavoro di ore, e serve a sapere se quella biblioteca tiene già pronte le misure ridotte: se le tiene, chiedergliene una vale il doppio della velocità. Se la domanda non riceve risposta non è un problema: si va avanti col calcolo, che funziona ovunque.

Se la biblioteca rifiuta la misura chiesta, Glossa prende la pagina alla sua dimensione piena e **la conserva così com'è**: non rimpicciolisce niente da sé, perché ridurre un'immagine le fa perdere qualcosa e non è una cosa che deve succedere alle tue spalle. Quel libro occuperà più spazio, e quando vuoi lo recuperi con il comando che riduce le immagini, che ti dice quante pagine tocca e quanto libera. Il rifiuto si paga **una volta per libro**, non a ogni pagina: dalla successiva Glossa sa già come comportarsi.

Con i limiti di alcune biblioteche lo scaricamento è lento per scelta: vedi [Archiviazione e lavori](/guides/storage-and-jobs).

## Controllare e liberare spazio

Ogni riga della Biblioteca ha sei comandi, sempre presenti: **scarica**, **verifica**, **riduci le immagini**, **libera spazio**, **archivia**, **togli**. Quelli che in quel momento non servono restano al loro posto, spenti — così sai sempre cosa si può fare.

**Verifica** confronta quello che Glossa ha registrato con quello che c'è davvero sul disco. Se manca qualcosa te lo dice e ti propone di riscaricarlo: le pagine già presenti non vengono richieste di nuovo.

Da ogni pagina che scarica Glossa ricava la sua **miniatura**, senza chiedere niente in più alla biblioteca: servono a sfogliare il libro senza rete. Finché non scarichi, le miniature si guardano online come le pagine.

**Libera spazio** cancella le pagine scaricate, subito e per davvero. Restano la scheda, il manifesto e le miniature, quindi il libro resta sfogliabile e le pagine si riscaricano quando servono. La conferma dice quanto stai liberando.

## Archiviare un'opera

Quando un'opera non ti serve più tutti i giorni ma non vuoi perderla, **archiviala**: sparisce dall'elenco senza uscire dalla Biblioteca. Per rivedere le archiviate accendi il comando con la cassetta nella barra di ricerca; da lì lo stesso comando sulla riga la riporta in catalogo.

Archiviare riguarda **solo l'elenco**: le pagine già scaricate restano dov'erano. Siccome è il momento in cui te ne accorgi, subito dopo Glossa ti chiede se vuoi anche liberare lo spazio che quell'opera occupa. Puoi dire di no e farlo più tardi, o non farlo mai: niente viene cancellato senza che tu lo chieda.

## Togliere una fonte

Il comando di rimozione toglie l'opera **per intero**: la scheda, i collegamenti ai workspace e tutto quello che ha nel deposito — manifesto, miniature e pagine scaricate. La conferma dice quanto spazio stai eliminando.

Se vuoi tenere l'opera e recuperare solo lo spazio, il comando è un altro: **libera spazio**. Se invece vuoi solo toglierla di mezzo senza perderla, **archiviala**: la rimozione non ha ripensamenti, l'archivio sì.
