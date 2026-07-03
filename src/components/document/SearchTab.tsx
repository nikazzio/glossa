import { Search, X, FileText, BookOpen, ScanLine } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from '../../hooks/useDebounce';
import { useUiStore } from '../../stores/uiStore';
import { indexPad } from '../../utils';
import type { TranslationChunk } from '../../types';

interface SearchTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
  currentChunkId: string | null;
  onSelectChunk: (id: string) => void;
}

type MatchScope = 'source' | 'translation' | 'audit';

interface ChunkMatch {
  chunk: TranslationChunk;
  index: number;
  scopes: MatchScope[];
  snippet: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSnippet(text: string, query: string, maxLen = 120): string {
  if (!text) return '';
  const plain = text.replace(/\s+/g, ' ').trim();
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return plain.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, idx + query.length + 60);
  return (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
}

function highlightSnippet(text: string, query: string): string {
  const safe = escapeHtml(text);
  if (!query.trim()) return safe;
  const re = new RegExp(`(${escapeRegex(query.trim())})`, 'gi');
  return safe.replace(re, '<strong>$1</strong>');
}

function matchesChunk(chunk: TranslationChunk, query: string): { scopes: MatchScope[]; snippet: string } | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const scopes: MatchScope[] = [];
  let snippet = '';

  if (chunk.originalText.toLowerCase().includes(q)) {
    scopes.push('source');
    snippet = getSnippet(chunk.originalText, q);
  }

  const draft = chunk.currentDraft ?? chunk.translationDisplayText ?? '';
  if (draft.toLowerCase().includes(q)) {
    scopes.push('translation');
    if (!snippet) snippet = getSnippet(draft, q);
  }

  const auditText = chunk.judgeResult.issues
    .flatMap((i) => [i.description, i.phrase ?? ''])
    .join(' ');
  if (auditText.toLowerCase().includes(q)) {
    scopes.push('audit');
    if (!snippet) snippet = getSnippet(auditText, q);
  }

  return scopes.length > 0 ? { scopes, snippet } : null;
}

const SCOPE_ICON: Record<MatchScope, React.ReactNode> = {
  source: <FileText size={9} />,
  translation: <BookOpen size={9} />,
  audit: <ScanLine size={9} />,
};

export function SearchTab({ panelId, labelledBy, chunks, currentChunkId, onSelectChunk }: SearchTabProps) {
  const { t } = useTranslation();
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const debouncedQuery = useDebounce(searchQuery, 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const matches = useMemo<ChunkMatch[]>(() => {
    if (!debouncedQuery.trim()) return [];
    return chunks.flatMap((chunk, index) => {
      const m = matchesChunk(chunk, debouncedQuery);
      return m ? [{ chunk, index, scopes: m.scopes, snippet: m.snippet }] : [];
    });
  }, [chunks, debouncedQuery]);

  const virtualizer = useVirtualizer({
    count: matches.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 90,
    overscan: 5,
  });

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col flex-1 min-h-0">
      {/* Input ricerca */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 rounded-[14px] border border-editorial-border bg-editorial-textbox/40 px-3 py-2">
          <Search size={13} className="shrink-0 text-editorial-muted" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('document.searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-editorial-ink placeholder:text-editorial-muted/60 outline-none"
            aria-label={t('document.searchPlaceholder')}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); inputRef.current?.focus(); }}
              data-tooltip={t('common.clear')}
              aria-label={t('common.clear')}
              className="shrink-0 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded-full"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Contatore risultati */}
      {debouncedQuery.trim() && (
        <div className="px-5 pb-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
          {matches.length > 0
            ? t('document.searchResults', { count: matches.length })
            : t('document.searchNoResults')}
        </div>
      )}

      {/* Lista risultati */}
      {!debouncedQuery.trim() ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Search size={24} className="text-editorial-border" />
          <p className="text-sm font-medium text-editorial-muted">{t('document.searchEmptyTitle')}</p>
          <p className="text-xs leading-relaxed text-editorial-muted/70">{t('document.searchEmptyBody')}</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Search size={24} className="text-editorial-border" />
          <p className="text-xs leading-relaxed text-editorial-muted">{t('document.searchNoResults')}</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
          <ul style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="w-full">
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const { chunk, index, scopes, snippet } = matches[virtualRow.index]!;
              const isActive = chunk.id === currentChunkId;

              return (
                <li
                  key={chunk.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: virtualRow.start, left: 0, right: 0 }}
                  className="border-b border-editorial-border/55"
                >
                  <button
                    type="button"
                    onClick={() => onSelectChunk(chunk.id)}
                    className={`relative block w-full px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                      isActive ? 'bg-editorial-charcoal/10' : 'hover:bg-editorial-textbox/40'
                    }`}
                  >
                    {isActive && <span className="absolute left-0 top-0 h-full w-[3px] bg-editorial-charcoal" aria-hidden="true" />}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`font-display text-sm italic shrink-0 ${isActive ? 'text-editorial-charcoal' : 'text-editorial-accent'}`}>
                        {indexPad(index + 1)}
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        {scopes.map((scope) => (
                          <span
                            key={scope}
                            className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] bg-editorial-textbox text-editorial-muted"
                          >
                            {SCOPE_ICON[scope]}
                            {t(`document.searchScope_${scope}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p
                      className="text-xs leading-snug text-editorial-muted"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: highlightSnippet(snippet, debouncedQuery) }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
