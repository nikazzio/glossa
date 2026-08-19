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

I comandi della scheda sono in due gruppi: prima cosa fai al libro — scarica, verifica, libera spazio, elimina — poi dove sta.

Aprendo una fonte vedi il dettaglio con le versioni registrate e l'elenco di tutti i tuoi workspace, dove puoi collegarla o scollegarla da ciascuno.

## Scaricare una fonte

Nel catalogo ogni riga dice **quante pagine sono davvero sul computer**: *solo online*, *34 pagine su 210 sul computer*, oppure *tutte le pagine sul computer*.

Il comando **scarica** mette in coda il lavoro vero: puoi cambiare schermata, metterlo in pausa, riprenderlo. Mentre gira, al posto del comando compare la percentuale; nel pannello dei lavori in basso trovi la stessa cosa con il nome dell'opera e quanto ha scaricato.

Quando una fonte è tutta sul computer il comando **sparisce**, e al suo posto resta un segno di spunta: non c'è niente da chiedere alla biblioteca, e con i limiti di cortesia un manoscritto intero può costare un quarto d'ora di rete.

**A che risoluzione** — Glossa **calcola** la misura da chiedere: dalle dimensioni della pagina, che il manifesto della biblioteca dichiara, ricava la larghezza che porta il lato lungo a 2000 pixel, e chiede quella. Non c'è nessuna trattativa e nessuna richiesta in più per pagina.

All'avvio di ogni libro fa una domanda sola alla biblioteca, che costa qualche secondo su un lavoro di ore, e serve a sapere se quella biblioteca tiene già pronte le misure ridotte: se le tiene, chiedergliene una vale il doppio della velocità. Se la domanda non riceve risposta non è un problema: si va avanti col calcolo, che funziona ovunque.

Se la biblioteca rifiuta la misura chiesta, Glossa prende la pagina alla sua dimensione piena e **la conserva così com'è**: non rimpicciolisce niente da sé, perché ridurre un'immagine le fa perdere qualcosa e non è una cosa che deve succedere alle tue spalle. Quel libro occuperà più spazio, e quando vuoi lo recuperi con il comando che riduce le immagini, che ti dice quante pagine tocca e quanto libera. Il rifiuto si paga **una volta per libro**, non a ogni pagina: dalla successiva Glossa sa già come comportarsi.

Con i limiti di alcune biblioteche lo scaricamento è lento per scelta: vedi [Archiviazione e lavori](/guides/storage-and-jobs).

## Controllare e liberare spazio

Ogni riga della Biblioteca ha cinque comandi, sempre presenti: **scarica**, **verifica**, **riduci le immagini**, **libera spazio**, **togli**. Quelli che in quel momento non servono restano al loro posto, spenti — così sai sempre cosa si può fare.

**Verifica** confronta quello che Glossa ha registrato con quello che c'è davvero sul disco. Se manca qualcosa te lo dice e ti propone di riscaricarlo: le pagine già presenti non vengono richieste di nuovo.

Da ogni pagina che scarica Glossa ricava la sua **miniatura**, senza chiedere niente in più alla biblioteca: servono a sfogliare il libro senza rete. Finché non scarichi, le miniature si guardano online come le pagine.

**Libera spazio** cancella le pagine scaricate, subito e per davvero. Restano la scheda, il manifesto e le miniature, quindi il libro resta sfogliabile e le pagine si riscaricano quando servono. La conferma dice quanto stai liberando.

## Togliere una fonte

Il comando di rimozione toglie l'opera **per intero**: la scheda, i collegamenti ai workspace e tutto quello che ha nel deposito — manifesto, miniature e pagine scaricate. La conferma dice quanto spazio stai eliminando.

Se vuoi tenere l'opera e recuperare solo lo spazio, il comando è un altro: **libera spazio**.
