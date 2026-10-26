/** Data breve di una revisione (giorno, mese, ora) nella lingua dell'interfaccia. */
export function formatRevisionDate(value: string, language: string): string {
  // `value` è già ISO (revisione appena scritta, in attesa della rilettura
  // dal database) oppure "AAAA-MM-GG HH:MM:SS" di SQLite, sempre UTC. Solo
  // la seconda forma va completata: aggiungere "Z" alla prima produceva due
  // fusi orari sulla stessa stringa e una data non finita.
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Intl.DateTimeFormat(language, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}
