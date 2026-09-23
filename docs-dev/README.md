# Documentazione di sviluppo

Leggere solo i documenti pertinenti al lavoro corrente.

| Se si modifica | Leggere e aggiornare |
|---|---|
| flussi, database, backend, store o prompt | `ARCHITECTURE.md` |
| comportamento e confini del prodotto | `PRODUCT_ARCHITECTURE_2_0.md` |
| componenti o regole visive | `UI_DESIGN_SYSTEM.md` |
| priorità e lavoro futuro | `ROADMAP_2_0.md` |
| attività aperte della sessione | `../STATO_SESSIONE_2.0.md` |
| **comportamento visibile all'utente** | **guida in-app (`help.*` in `src/i18n/it.json` e `en.json`) e documentazione pubblica `docs/` + `docs/en/`** |

La riga in grassetto non è un promemoria: è la regola di documentazione
obbligatoria descritta in `CLAUDE.md`. Ogni funzione nuova, rimossa o cambiata
nel comportamento visibile si documenta nello stesso task in tre posti — guida
in-app, pagine pubbliche italiane e inglesi, documento di sviluppo pertinente.
Una pagina pubblica nuova richiede la voce in entrambe le barre laterali di
`docs/.vitepress/config.ts`; `npx vitepress build docs` fallisce sui
collegamenti morti.
Scriptoria resta riferimento tecnico per fonti, deposito, lavori, trascrizione
ed export. #186 e #446 tracciano adozione e adattamento dei pattern.

Piani e specifiche implementative completati non restano come documentazione:
invarianti in architettura, regole visive nel design system, lavoro residuo
nella roadmap.
