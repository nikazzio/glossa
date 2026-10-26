import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AREA_INK_CLASSNAME, CommandBar, CompletionBar, RenameField, Tooltip, type RowCommand } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import type { TranslationCatalogEntry } from '../../services/translationCatalogService';
import { isFullyVerified, translatedRatio } from '../../utils/translationCatalogFilters';
import { useLanguageLabel } from '../../hooks/useLanguageLabel';

export interface TranslationRowProps {
  entry: TranslationCatalogEntry;
  commands: RowCommand[][];
  renaming: boolean;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
  onOpen: () => void;
  /** Mentre un'altra traduzione si sta aprendo la riga non risponde. */
  disabled: boolean;
}

/** Le lingue di una traduzione: «Latino → Italiano». */
export function useLanguagePair(entry: TranslationCatalogEntry): string {
  const languageLabel = useLanguageLabel();
  return `${languageLabel(entry.sourceLanguage)} → ${languageLabel(entry.targetLanguage)}`;
}

/** A che punto è: frammenti tradotti sul totale e verificati. */
export function useTranslationProgress(entry: TranslationCatalogEntry) {
  const { t } = useTranslation();
  if (entry.chunkCount === 0) return { translated: t('areas.translations.catalog.noText'), verified: null };
  return {
    translated: t('areas.translations.catalog.chunksTranslated', { done: entry.translatedChunks, total: entry.chunkCount }),
    verified: entry.verifiedChunks > 0
      ? t('areas.translations.catalog.verifiedCount', { count: entry.verifiedChunks })
      : null,
  };
}

export function TranslationRenameField(props: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return <RenameField {...props} label={t('areas.translations.catalog.renameLabel')} />;
}

/**
 * Una traduzione nel suo catalogo, sul modello della riga delle Trascrizioni:
 * il nome in corsivo, sotto le lingue, poi workspace e frammenti tradotti e
 * verificati. Un click apre l'editor; i comandi compaiono al passaggio o col fuoco.
 */
export function TranslationCatalogRow({ entry, commands, renaming, onRename, onRenameCancel, onOpen, disabled, view }:
  TranslationRowProps & { view: 'list' | 'grid' }) {
  const { t } = useTranslation();
  const languages = useLanguagePair(entry);
  const { translated, verified } = useTranslationProgress(entry);
  const isGrid = view === 'grid';
  const ratio = translatedRatio(entry);

  const details = (
    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-editorial-muted">
      <span className="min-w-0 truncate">{[entry.workspaceName, translated, verified].filter(Boolean).join(' · ')}</span>
      {entry.translatedChunks > 0 && <CompletionBar ratio={ratio} complete={isFullyVerified(entry)}
        label={`${Math.round(ratio * 100)}%`} ariaLabel={t('areas.translations.catalog.table.progress')} />}
    </span>
  );
  const identity = (
    <span className="block min-w-0">
      {!renaming && (
        <Tooltip label={entry.name} variant="panel" className="w-full min-w-0">
          <span className="block line-clamp-2 font-display text-lg italic leading-snug text-editorial-ink">{entry.name}</span>
        </Tooltip>
      )}
      <span className="block truncate text-sm text-editorial-ink">{languages}</span>
      {details}
    </span>
  );
  const cover = (
    <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-editorial-border bg-editorial-textbox">
      <Languages size={18} className={AREA_INK_CLASSNAME.translations} aria-hidden="true" />
    </span>
  );

  return (
    <article
      className={`group/row ${
        isGrid
          ? 'flex h-full flex-col justify-between gap-2 rounded-2xl border border-editorial-border bg-surface-elevated p-3'
          : 'flex items-start gap-3 rounded px-1 py-2.5'
      }`}
    >
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {cover}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <TranslationRenameField initial={entry.name} onSave={onRename} onCancel={onRenameCancel} />
            {identity}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-start gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-wait"
        >
          {cover}
          <span className="min-w-0 flex-1">{identity}</span>
        </button>
      )}
      <div className={`${isGrid ? 'self-end' : ''} ${ROW_REVEAL_CLASSNAME}`}>
        <CommandBar groups={commands} variant={isGrid ? 'menu' : 'inline'} />
      </div>
    </article>
  );
}
