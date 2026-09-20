/**
 * Le categorie di errore che il motore di scaricamento distingue già quando
 * una richiesta di pagina fallisce in rete (vedi `tag_network_error` lato
 * Rust, in `httpcache/commands.rs`). Un errore locale non arriva in questo
 * formato: chi chiama riceve `null` e mostra un messaggio semplice.
 */
export function networkErrorHintKey(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown };
    switch (parsed.kind) {
      case 'transport':
        return 'areas.library.viewerErrorHintTransport';
      case 'rateLimited':
        return 'areas.library.viewerErrorHintRateLimited';
      case 'throttled':
        return 'areas.library.viewerErrorHintThrottled';
      case 'notFound':
        return 'areas.library.viewerErrorHintNotFound';
      case 'sizeRejected':
        return 'areas.library.viewerErrorHintSizeRejected';
      case 'storage':
        return 'areas.library.viewerErrorHintStorage';
      case 'format':
        return 'areas.library.viewerErrorHintFormat';
      default:
        return null;
    }
  } catch {
    return null;
  }
}
