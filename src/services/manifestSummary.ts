/**
 * Il manifesto della biblioteca, letto per essere capito.
 *
 * Il documento grezzo resta a un click di distanza — l'indirizzo è lì sopra —
 * e riversarlo a schermo non aggiunge niente a chi lo legge: quello che serve
 * è cosa dichiara la biblioteca su quell'opera. Regge le due versioni del
 * formato, perché le biblioteche non si sono aggiornate insieme: la 2 usa
 * `sequences`/`canvases` e stringhe semplici, la 3 usa `items` ed etichette
 * per lingua.
 */

export interface ManifestField {
  label: string;
  value: string;
}

export interface ManifestSummary {
  title: string | null;
  summary: string | null;
  /** Diritti e attribuzione, che la biblioteca chiede di riportare. */
  rights: string[];
  pages: number | null;
  /** Le voci dichiarate dalla biblioteca, nell'ordine in cui le scrive. */
  fields: ManifestField[];
}

export function summarizeManifest(raw: string): ManifestSummary {
  const manifest = JSON.parse(raw) as Record<string, unknown>;
  return {
    title: text(manifest.label),
    summary: text(manifest.summary) ?? text(manifest.description),
    rights: [
      text(manifest.requiredStatement && (manifest.requiredStatement as Record<string, unknown>).value),
      text(manifest.attribution),
      text(manifest.rights),
      text(manifest.license),
    ].filter((value): value is string => Boolean(value)),
    pages: pageCount(manifest),
    fields: fields(manifest.metadata),
  };
}

/** Quante pagine dichiara: `items` nella versione 3, `sequences` nella 2. */
function pageCount(manifest: Record<string, unknown>): number | null {
  const items = manifest.items;
  if (Array.isArray(items)) {
    const canvases = items.filter((item) => typeName(item).includes('Canvas'));
    if (canvases.length > 0) return canvases.length;
  }
  const sequences = manifest.sequences;
  if (Array.isArray(sequences) && sequences.length > 0) {
    const first = sequences[0] as Record<string, unknown>;
    if (Array.isArray(first.canvases)) return first.canvases.length;
  }
  return null;
}

function typeName(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const record = item as Record<string, unknown>;
  return String(record.type ?? record['@type'] ?? '');
}

function fields(metadata: unknown): ManifestField[] {
  if (!Array.isArray(metadata)) return [];
  return metadata
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const label = text(record.label);
      const value = text(record.value);
      return label && value ? { label, value } : null;
    })
    .filter((field): field is ManifestField => field !== null);
}

/**
 * Un testo, comunque la biblioteca lo abbia scritto: stringa, elenco, oppure
 * oggetto per lingua. Si prende la prima forma leggibile invece di scegliere
 * una lingua: un manifesto in una lingua sola non deve sparire.
 */
function text(value: unknown): string | null {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) {
    const parts = value.map((entry) => text(entry)).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('@value' in record) return text(record['@value']);
    if ('label' in record && 'value' in record) return text(record.value);
    const first = Object.values(record).find((entry) => entry !== undefined);
    return first === undefined ? null : text(first);
  }
  if (typeof value === 'number') return String(value);
  return null;
}

/** Le biblioteche scrivono spesso HTML dentro i valori: a schermo va il testo. */
function clean(value: string): string | null {
  const stripped = value
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0 ? stripped : null;
}
