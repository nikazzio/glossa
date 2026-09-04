# Archiviazione e lavori in background

Glossa tiene i dati in due posti distinti e svolge le operazioni lunghe in una
coda che puoi fermare e riprendere.

## Due cartelle, non una

**Cartella dati** — contiene il database: schede, traduzioni, glossari,
impostazioni. È piccola e va tenuta su un disco locale.

**Cartella del deposito** — contiene le immagini e i documenti scaricati dalle
biblioteche. Sono gigabyte, e possono stare altrove: un'altra partizione, un
disco esterno, una cartella sincronizzata.

Separarle protegge il database: chi vuole le immagini sul cloud non è costretto
a portarci anche il database, che in una cartella sincronizzata rischia di
corrompersi.

## Cambiare cartella

In **Impostazioni → Archiviazione**. La finestra di scelta la apre Glossa
stessa, non la pagina: il percorso non passa mai per l'interfaccia.

Scegliendo una cartella per il deposito:

- **vuota** → viene creata la struttura del deposito;
- **già un deposito Glossa** → viene ricollegata senza copiare niente, utile per
  spostare un disco fra due computer;
- **con dentro altro** → viene rifiutata, per non riversare migliaia di file in
  una cartella scelta per errore.

Cambiare cartella **non sposta** i file già scaricati: lo spostamento arriverà
come lavoro in background.

Se la cartella scelta non è raggiungibile — disco staccato, condivisione non
montata — Glossa lo dichiara e blocca le operazioni sul deposito. Non considera
i file persi e non riscarica niente.

## Cartelle sincronizzate

Il deposito può stare su Drive, OneDrive o iCloud, **a una condizione**: il
client deve tenere una copia vera sul disco. In modalità solo online i file
sono segnaposto — risultano presenti, con la dimensione giusta, e occupano zero
byte. Glossa direbbe che una fonte è completa mentre non c'è niente.

**Il database non va mai su una cartella sincronizzata.**

## La coda dei lavori

Scaricamenti, verifiche del deposito e generazioni lunghe non bloccano
l'applicazione: diventano lavori in coda.

**Dove si vedono** — nella barra in basso a destra, in ogni sezione. Il clic
apre il pannello con l'elenco diviso in *in corso*, *in attesa*, *terminati
oggi*.

**Come si comandano** — pausa, ripresa, annullamento e nuovo tentativo per
ciascun lavoro, oppure per tutti insieme dai comandi in cima al pannello.

**Come si chiamano** — ogni riga porta il nome dell'opera già mentre aspetta il
turno, e mentre gira aggiunge a che punto è e quanto ha scaricato: *I diarii di
Marino Sanuto · 34/374 · 46 MB*. Accanto trovi cosa sta facendo in quel momento:
avvio, lettura del manifesto, scelta della risoluzione, scaricamento. Un
contrassegno dice di che tipo di lavoro si tratta — pagine, verifica —
e i numeri distinguono quanto è arrivato da quanto si prevede in tutto.

**Cliccando una riga** si apre e mostra i dettagli: la risoluzione che la
biblioteca ha accettato, l'indirizzo del suo server, i tentativi fatti, gli orari.

La pausa non è istantanea: il lavoro porta a termine il pezzo in corso — la
pagina che sta scaricando — lo salva e si ferma. Per questo lo stato passa da
*in pausa…* a *in pausa*.

Un lavoro annullato è definitivo: si può ripetere da capo, non riprendere. Le
pagine già scaricate restano.

## Chiudere e riaprire

Chiudendo Glossa con lavori attivi compare una conferma con l'elenco. I lavori
vengono messi **in pausa**, non annullati, salvando il punto raggiunto.

Alla riapertura **nessun lavoro riparte da solo**: li ritrovi fermi e decidi tu.
L'unica eccezione è opzionale — in **Impostazioni → Lavori** puoi far ripartire
automaticamente gli scaricamenti interrotti.

## Verificare il deposito

In **Impostazioni → Archiviazione** ci sono due controlli.

La **verifica rapida** guarda soltanto se i file che Glossa ha registrato sono ancora al loro posto: è questione di millisecondi anche per un manoscritto grande. La **verifica completa** apre ogni file, ne controlla la forma e confronta l'impronta con quella registrata quando è arrivato: è l'unica che riconosce un file troncato da uno scaricamento interrotto o marcito sul disco. È lenta in proporzione ai gigabyte, e su una cartella sincronizzata costringe il servizio a scaricare tutto. Se niente è danneggiato i due conteggi coincidono, e cambia solo il tempo.

Entrambe diventano lavori in coda: le segui dal pannello in basso, le metti in pausa, le annulli. Il risultato è un conteggio in quattro parti — integri, mancanti, corrotti, orfani — dove gli *orfani* sono file rimasti nel deposito che nessuna scheda reclama. **Nessuna delle due cancella o riscarica niente da sola.**

L'esito dell'ultimo controllo **resta nelle impostazioni**, sotto i due comandi, finché non ne fai un altro: quando è stato fatto, di che tipo, e i quattro numeri. Accanto ai file senza opera c'è il comando che li cancella, con la conferma che dice quanti sono e quanto occupano. Glossa riguarda il deposito nel momento in cui premi — non si fida del conto di prima — e alla fine ti dice quanti ne ha tolti davvero: fra il controllo e la cancellazione può essere finito uno scaricamento, e quei file non sono più senza padrone.

Un interruttore accende la verifica rapida a ogni avvio. È spenta di default: allunga l'apertura su depositi grandi o su una cartella di rete.

## Quanti lavori insieme

In **Impostazioni → Lavori**, un limite per ciascun tipo di risorsa:
scaricamenti, elaborazioni, scritture su disco, servizi linguistici,
generazione documenti. *Automatico* lascia scegliere a Glossa.

Il limite degli **scaricamenti** non dipende dalla potenza del computer ma dal
server della biblioteca: alzarlo troppo fa scattare blocchi temporanei.

## Quanto grandi le pagine

In **Impostazioni → Biblioteca → Immagini** scegli la misura delle pagine e quella delle
miniature.

La misura delle pagine è un **obiettivo, non un numero esatto**: Glossa chiede
alla biblioteca quella che dichiara più vicina, sopra o sotto. Chiedere una
misura inventata costringerebbe il servizio a produrla sul momento — misurato:
ventitré secondi contro uno.

La stessa scelta si può fare sulla **singola opera**, aprendo la sua scheda in
Biblioteca, e lì vince: la misura dipende dal materiale — una cinquecentina a
stampa larga si legge a molto meno di una minuscola fitta — non da chi conserva
il libro.

Le pagine già scaricate restano come sono: la scelta vale per quello che si
scarica da adesso.

Le **miniature** non si chiedono alla biblioteca: Glossa le ricava dalle pagine
che ha scaricato, sul computer. Più grandi occupano più spazio e si sfogliano
meglio; non costano nessuna richiesta.

## Il ritmo verso le biblioteche

Ogni biblioteca ha i suoi tempi: quante richieste in un minuto, quante insieme,
quante pagine di uno stesso libro scaricare per volta, quanto fermarsi quando
chiede di rallentare, quanti tentativi fare. Sono pochi ritmi diversi applicati a
molte biblioteche, quindi in **Impostazioni → Biblioteca → Configurazioni** si
governano come **profili**.

Fra una richiesta riuscita e la successiva **non c'è nessuna pausa**: a tenere i
tempi sono il numero di richieste insieme, il limite al minuto e la pausa lunga
dopo un rifiuto. Una pausa a ogni richiesta si moltiplicava per tutti i pezzi di
una pagina ingrandita e rendeva il visore inutilizzabile.

Due profili arrivano con Glossa, con i valori provati sul campo: **Normale**,
che usano quasi tutte, e **Lento**, tarato su Gallica che è la più severa.
Puoi modificarli, crearne altri e dare un nome a ciascuno; accanto al nome
Glossa dice quante biblioteche lo usano.

Nella linguetta **Biblioteche** trovi l'elenco delle biblioteche: per ognuna
scegli il profilo e come chiedere
le immagini — **Automatico**, **Solo formati già pronti** o **Misura precisa**.
Il primo è consigliato; l'ultimo può essere molto più lento quando la
biblioteca deve costruire ogni immagine.
Un profilo che qualcuno sta usando non si può eliminare — prima si spostano le
biblioteche che lo seguono — e i due che arrivano con l'applicazione non si
eliminano affatto.

Le **richieste insieme non superano mai quattro**, qualunque cosa si scriva: il
limite dipende dal loro server e serve a non farsi bloccare. Uno scaricamento
non le occupa mai tutte: un posto resta sempre alla pagina che stai guardando,
così sfogliare un libro resta possibile mentre un altro si scarica.

In basso a destra, accanto ai lavori, un piccolo indicatore dice se la rete si
sta muovendo davvero. Passandoci sopra si apre un pannello: quante immagini
sono in corso e quante aspettano il turno, tenendo separata la pagina che stai
guardando dalle miniature; quanti posti sono occupati verso ciascuna biblioteca
e quante richieste hai già speso nel minuto corrente; e da dove sono arrivate le
immagini finora — dal deposito, dalla memoria di lavoro o dalla rete — con la
percentuale di richieste che ti sei risparmiato. Serve a distinguere un lavoro
lento da uno fermo.

## Le copertine e le ricerche tenute da parte

Le copertine che vedi nei risultati di ricerca e in Biblioteca non vengono
chieste alla biblioteca ogni volta che le guardi: Glossa le tiene da parte, e le
ridisegna da lì. Lo stesso vale per le ricerche — la stessa ricerca fatta due
volte non ripassa dalla rete.

Serve a due cose. La prima è che le copertine **si vedono**: prima, nella
versione installata, restavano riquadri vuoti. La seconda è che quaranta
risultati non sono più quaranta richieste sparate insieme a una biblioteca, ma
richieste che rispettano le stesse pause di uno scaricamento.

**Questa roba non è tua.** Non conta come scaricata, non compare nel conteggio
delle pagine di un'opera, non entra in un backup, e viene buttata quando serve
spazio — a partire da quella che non guardi da più tempo. Il modo di **tenere**
un libro resta scaricarlo.

In **Impostazioni → Dati** si vede quanto occupa adesso, si sceglie il tetto
(predefinito 512 MB) e per quanto valgono le ricerche prima di essere rifatte
(predefinito 24 ore). Accanto c'è il comando per svuotarla: si può fare in
qualsiasi momento senza perdere niente. Le immagini invece non scadono mai — i
pixel di un manoscritto del Cinquecento non cambiano — le governa solo il tetto.

Se vuoi sapere **se nel frattempo è comparso qualcosa di nuovo**, sopra i
risultati compare da quanto tempo risale quello che stai guardando, e accanto un
comando che rifà la ricerca davvero, saltando quello che era stato tenuto da
parte.

## Quante pagine hai davvero

Il numero che leggi in Biblioteca è quello dei file che stanno sul tuo computer:
Glossa guarda la cartella, non un elenco tenuto da parte. Il vantaggio si vede
quando qualcosa va storto — un'interruzione, una copia a mano, un disco
staccato e riattaccato: il conteggio non può raccontare una cosa diversa da
quella che c'è.

**Le pagine che la biblioteca non serve non contano come mancanti.** Capita che
un manoscritto dichiari 328 pagine e il server non ne restituisca venti: non è un
guasto tuo e riscaricarle non le farebbe comparire. Glossa se lo segna, non le
richiede a ogni ripresa, e considera il libro completo per quanto la biblioteca
serve. Ogni tanto — una volta a settimana — le riprova, perché le biblioteche
riparano.

**Le pagine prese a risoluzione piena sono un'aggiunta, non un buco.** Se di tre
pagine hai voluto anche la versione più grande, la scheda dice «più 3 a
risoluzione piena» accanto al conteggio, invece di far sembrare il libro a metà.

## Comprimere per liberare spazio, senza perdere l'originale

Un libro scaricato alla massima risoluzione occupa il triplo del necessario. Uno
scaricato mesi fa con un tetto più alto di quello che ti serve adesso tiene
dettaglio che non guardi. In entrambi i casi **comprimere è meglio che
riscaricare**, perché la biblioteca non ne paga il prezzo.

Nella tab **Digitalizzazioni** della scheda dell'opera ogni versione locale ha
il suo comando "comprimi": parte da quella versione, e nel pannello si scelgono
soltanto la misura più piccola d'arrivo e la qualità. Il comando mette subito il
lavoro in coda.

**Non è più irreversibile: nasce una copia nuova, l'originale non si tocca
mai.** Prima la compressione sostituiva le pagine scaricate al loro posto,
per sempre; ora la copia compressa compare accanto alle altre risoluzioni
della stessa opera, ognuna con il suo comando per liberare solo quella —
tieni la copia leggera e butta l'originale pesante, o il contrario, quando
vuoi.

Su un libro lungo dura minuti, quindi è un lavoro come lo scaricamento: lo segui
dal pannello in basso a destra, e puoi metterlo in pausa o annullarlo. Il
lavoro usa più pagine insieme (quanti nuclei ha il tuo processore, meno uno),
non una alla volta.

Mentre gira, il pannello dice quante pagine ha ridotto e quanto peserà la
copia; il valore resta nel lavoro concluso.

Se una pagina non può essere letta, il lavoro termina in errore senza nasconderla:
nel dettaglio resta il numero delle pagine non riuscite, e quelle riuscite
restano correttamente salvate nella copia.

Finché uno scaricamento o un'ottimizzazione può modificare un'opera, i comandi
per liberarne lo spazio o eliminarla vengono rifiutati. Prima il lavoro deve
concludersi o essere annullato; metterlo in pausa non basta.

## Il backup

**Impostazioni → Backup** salva un file con tutto
quello che non si riscarica: schede delle opere, note, trascrizioni, traduzioni
con il loro storico, glossari, memoria di frasi e il registro del lavoro svolto.

**Riguarda tutto Glossa, non un workspace solo.** Il file contiene ogni
workspace che hai, e il ripristino li sostituisce tutti.

**Le immagini non ci sono, ed è voluto.** Si riprendono dalla biblioteca: un
backup da 40 GB non lo fa nessuno, uno da pochi megabyte si fa ogni settimana.
Il file però **sa quali opere erano sul computer e a che misura**, e al
ripristino Glossa ti propone di riscaricarle. Se vuoi anche le immagini al
sicuro, la strada è tenere il deposito in una cartella sincronizzata.

Il file è compresso — il contenuto è testo, e si comprime di circa dieci volte
— e porta con sé un'impronta: un backup interrotto a metà scrittura viene
riconosciuto **prima** che il ripristino cominci, invece di lasciarti a metà
strada con i dati già cancellati.

Puoi salvare un file che apre solo Glossa: evita aperture casuali, ma non
protegge materiale riservato. Per dati riservati usa il lucchetto: chiede una
password e, dopo il salvataggio, mostra un codice di recupero una sola volta.
Puoi selezionarlo oppure usare il pulsante di copia accanto. Conserva il codice
fuori dall'app: password o codice aprono il backup cifrato,
ma se perdi entrambi non si può recuperare il contenuto.

**Il ripristino sostituisce tutto**: ogni workspace presente adesso viene
rimpiazzato da quello che c'è nel file. La conferma lo dice, e non si torna
indietro. Chiudere la finestra di salvataggio senza scegliere un file non
scrive niente, e Glossa non dice di aver salvato.

**Le pagine che avevi sul computer restano dov'erano.** Il ripristino se le
tiene, per le opere che il backup contiene, e subito dopo mette in coda un
controllo del deposito per vedere se quei file ci sono davvero. Quando il
controllo finisce — anche molto dopo, o alla riapertura successiva — Glossa ti
dice com'è andata: se non manca niente lo dice e basta, se manca qualcosa ti
propone di riprendere **solo quello**, alla misura che aveva. I file rimasti
senza opera li trovi contati nelle impostazioni, con il comando per toglierli.

## Fermo non vuol dire rotto

Un lavoro può restare immobile per minuti rispettando i limiti di una
biblioteca. In quel caso l'indicatore dice *in attesa · riprende fra 8 min* e la
barra **non si muove**: non è un errore, e riprende da solo. Un lavoro fallito
lo dice diversamente, con il motivo e la possibilità di riprovare.
