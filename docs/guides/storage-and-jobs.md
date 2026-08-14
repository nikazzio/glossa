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

## Quanti lavori insieme

In **Impostazioni → Lavori**, un limite per ciascun tipo di risorsa:
scaricamenti, elaborazioni, scritture su disco, servizi linguistici,
generazione documenti. *Automatico* lascia scegliere a Glossa.

Il limite degli **scaricamenti** non dipende dalla potenza del computer ma dal
server della biblioteca: alzarlo troppo fa scattare blocchi temporanei.

## Fermo non vuol dire rotto

Un lavoro può restare immobile per minuti rispettando i limiti di una
biblioteca. In quel caso l'indicatore dice *in attesa · riprende fra 8 min* e la
barra **non si muove**: non è un errore, e riprende da solo. Un lavoro fallito
lo dice diversamente, con il motivo e la possibilità di riprovare.
