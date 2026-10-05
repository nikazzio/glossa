import type { ReactNode } from 'react';
import { BookPlus, CircleCheck, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PhraseMemoryMatch } from '../../../stores/phraseMemoryStore';
import type { PhraseProvenanceLookup } from '../../../hooks/usePhraseProvenanceLookup';
import { useLanguageLabel } from '../../../hooks/useLanguageLabel';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import type { MemoryCircle } from '../../../utils/memoryCircles';
import { CopyButton, Hint, IconButton } from '../../ui';

interface ReferenceMatchRowProps {
  match: PhraseMemoryMatch;
  circle: MemoryCircle;
  enabled: boolean;
  lookup: PhraseProvenanceLookup;
  onToggle: () => void;
  onExtractTerm: () => void;
}

/**
 * Un riferimento in una colonna stretta: in testa somiglianza e cerchio, poi
 * originale (serif) e traduzione (sans) con la lingua a margine, infine una sola
 * riga di provenienza; il resto sta nel suggerimento dell'icona «i».
 */
export function ReferenceMatchRow({ match, circle, enabled, lookup, onToggle, onExtractTerm }: ReferenceMatchRowProps) {
  const { t } = useTranslation();
  const languageLabel = useLanguageLabel();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const translation = (match.projectId ? lookup.projectNames[match.projectId] : undefined) ?? match.provenance?.projectName;
  const position = (match.chunkId ? lookup.chunkPositions[match.chunkId] : undefined) ?? match.provenance?.chunkPosition;
  const chunk = position !== undefined && position !== null ? t('memory.reference.chunk', { number: position + 1 }) : null;
  const workspaceName = match.workspaceId ? workspaces.find((workspace) => workspace.id === match.workspaceId)?.name : undefined;
  const book = match.provenance?.sourceTitle;

  // Riga visibile: solo ciò che il cerchio non dice già.
  const origin = [
    circle === 'elsewhere' ? workspaceName ?? t('memory.provenance.unknownWorkspace') : null,
    circle !== 'document' ? translation ?? t('memory.provenance.imported') : null,
    chunk,
  ].filter(Boolean).join(' · ');
  const details = [
    `${t('memory.provenance.workspace')}: ${workspaceName ?? t('memory.provenance.noWorkspace')}`,
    `${t('memory.provenance.book')}: ${book ?? t('memory.provenance.noBook')}${match.provenance?.sourceVersionLabel ? ` — ${match.provenance.sourceVersionLabel}` : ''}`,
    `${t('memory.provenance.translation')}: ${translation ?? t('memory.provenance.imported')}`,
    match.embeddingModel ? `${t('library.embeddingModel')}: ${match.embeddingModel}` : null,
  ].filter(Boolean).join('\n');

  return (
    <div className="flex items-start gap-2.5 py-3">
      <IconButton size="sm" tone={enabled ? 'accent' : 'default'} ariaPressed={enabled}
        title={t('memory.useInTranslation')} onClick={onToggle} className="shrink-0">
        <CircleCheck size={14} />
      </IconButton>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-2 text-xs text-editorial-muted">
          <span className="font-mono text-editorial-ink">{Math.round(match.score * 100)}%</span>
          <span className={circle === 'document' ? 'text-editorial-accent' : ''}>{t(`memory.circle.${circle}`)}</span>
        </div>
        <PhraseLine code={match.sourceLanguage} label={languageLabel(match.sourceLanguage)} role={t('memory.reference.original')}>
          <p className="font-display text-base leading-snug text-editorial-charcoal">{match.sourcePhrase}</p>
        </PhraseLine>
        <PhraseLine code={match.targetLanguage} label={languageLabel(match.targetLanguage)} role={t('memory.reference.translation')}>
          <p className="text-sm leading-snug text-editorial-ink">{match.targetPhrase}</p>
        </PhraseLine>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-editorial-muted">
          {origin && <span className="min-w-0 truncate">{origin}</span>}
          <Hint label={details}><Info size={12} className="shrink-0" aria-label={t('memory.reference.details')} /></Hint>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <CopyButton text={match.targetPhrase} size="sm" />
        <IconButton size="sm" title={t('memory.extractTermButton')} onClick={onExtractTerm} tooltipSide="left">
          <BookPlus size={13} />
        </IconButton>
      </div>
    </div>
  );
}

/** Un testo con la sua lingua a margine: il codice breve, il nome e il ruolo nel suggerimento. */
export function PhraseLine({ code, label, role, children }: { code: string; label: string; role: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] items-baseline gap-1.5">
      <Hint label={`${role} — ${label}`}>
        <span className="font-mono text-xs uppercase text-editorial-muted">{code === 'und' ? '—' : code}</span>
      </Hint>
      {children}
    </div>
  );
}
