---
title: Ricerca delle fonti
---

# Ricerca delle fonti

La Dashboard offre due modalità di ricerca: **Ricerca federata**, che interroga
più servizi, e **Ricerca singola / identificativo**, per una fonte specifica o
un indirizzo noto. I risultati restano separati dal catalogo personale finché
non vengono aggiunti alla Biblioteca.

## Ricerca su più fonti

Le due ricerche si aprono dalla barra a sinistra, come voci sotto Dashboard.

Le parole chiave si scrivono nel campo in cima alla pagina e la ricerca parte
dal comando accanto. Il comando successivo apre i **criteri avanzati** in una
finestra: lì si restringe la ricerca e si scelgono le fonti. Le biblioteche e le
raccolte aggregate sono selezionabili separatamente; Europeana e Internet Archive
non vengono inclusi automaticamente nella selezione iniziale delle biblioteche.
Europeana richiede una chiave in **Impostazioni → Biblioteca → Biblioteche**.

Le ricerche già fatte si riaprono dalla scheda **Ricerche** nella colonna di
destra, che conserva criteri, risultati e tentativi.

L’avvio registra i criteri della ricerca. Ogni pagina di risultati di ciascun
provider viene elaborata come lavoro indipendente: una fonte lenta o in errore
non impedisce alle altre di pubblicare risultati. Il monitor mostra stato,
tentativi ed errori; permette di sospendere, riprendere, annullare, riprovare,
ripetere dalla prima pagina o caricare altri risultati per fonte.

## Filtri bibliografici

Titolo, autore, editore, istituzione, lingua, materiale e intervallo di anni
filtrano i metadati ricevuti. Non corrispondono a campi di interrogazione
uniformi sui cataloghi remoti e non rendono la ricerca esaustiva.

I dati mancanti o le date non interpretabili producono un esito non verificabile.
Un valore generico come `text` non viene convertito automaticamente in
«manoscritto» o «stampato». Valuta il numero di fonti concluse e quelle in errore
prima di interpretare l’assenza di risultati.

## Identità e provenienza

Il raggruppamento usa l’identità esatta del manifesto IIIF. Titoli simili non
sono sufficienti per unire risultati. Le occorrenze e i riferimenti ai servizi
che li hanno restituiti restano disponibili. Il servizio interrogato,
l’istituzione di conservazione e il servizio delle immagini possono essere
organizzazioni diverse.

L’ordinamento per titolo permette di integrare esplicitamente i nuovi risultati.
Lo storico distingue le esecuzioni precedenti da quella corrente. **Estendi
alle raccolte** crea una ricerca collegata con gli stessi criteri, limitata
alle raccolte selezionate che non erano già incluse.

## Apertura per identificativo

La ricerca singola interpreta l’input secondo la fonte selezionata. Gli esempi
nel campo indicano la sintassi accettata.

| Fonte | Ricerca per parole | Esempio di riferimento diretto |
| --- | --- | --- |
| Europeana | Sì, con chiave API | Indirizzo della scheda |
| Internet Archive | Sì | Indirizzo `archive.org/details/…` |
| Wellcome Collection | Sì | Indirizzo di un manifesto IIIF |
| Biblioteca Vaticana | Sì | `Urb.lat.1779` |
| Gallica | Sì | Identificativo ARK o indirizzo Gallica |
| e-codices | Sì | `bbb-0264` |
| Bodleian Libraries | Sì | Indirizzo dell’oggetto |
| Biblioteca Estense | Sì | Identificativo o indirizzo del visore |
| Institut de France | Sì | `17837` |
| Cambridge University Digital Library | Sì | `MS-ADD-03996` |
| Bayerische Staatsbibliothek | Sì | `bsb00026283` |
| Library of Congress | Sì | Indirizzo `loc.gov/item/…` o `loc.gov/resource/…` |
| Harvard Library | Sospesa nell’integrazione | `drs:123456` o `ids:123456` |
| Heidelberg University Library | No | `cpg848` |
| e-rara | No | Numero della scheda |
| e-manuscripta | No | Numero della scheda |
| IIIF diretto | No | Indirizzo completo del manifesto |

La tabella descrive le capacità implementate in Glossa, non la disponibilità
in tempo reale dei servizi. Limitazioni di rete e controlli anti-automazione
possono impedire una richiesta anche per una fonte supportata.

## Disponibilità delle riproduzioni

Una scheda bibliografica non implica che esista una riproduzione consultabile.
Glossa verifica i risultati visibili e distingue gli elementi non ancora
controllati, quelli aperti correttamente e quelli dichiarati non disponibili.
Questi ultimi restano visibili con l’indicazione **non consultabile**.
Un timeout o un limite di richieste non viene interpretato come assenza dell’opera.

## Conservazione dei risultati

**Aggiungi alla Biblioteca** salva la fonte nel catalogo; **Aggiungi a un
workspace** la salva e crea anche il collegamento. Aggiungere di nuovo lo
stesso manifesto non duplica la fonte.

Le ricerche persistenti conservano criteri, esecuzioni e risultati fra le
sessioni e sono incluse nel backup. I lavori si fermano quando l’app è chiusa.
La cache delle risposte di rete è distinta dallo storico: il comando di
aggiornamento della ricerca singola permette di interrogare nuovamente la fonte.
