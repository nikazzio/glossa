import { useEffect, useState } from 'react';
import { FileJson, FileText, FolderOpen, Languages, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogCancelButton,
  DialogConfirmButton,
  Hint,
  IconButton,
  SearchPicker,
  SettingRow,
  ToggleRow,
  type SearchPickerGroup,
} from '../ui';
import { FIELD_INLINE_CLASSNAME } from '../ui/fieldStyles';
import { SECTION_SETTING_LIST_CLASSNAME } from '../ui/panelStyles';
import { useLanguageCatalog } from '../../hooks/useLanguageCatalog';
import { languageName, languageNameOf, searchLanguages, type LanguageEntry } from '../../languages/catalog';
import {
  fileStem,
  importPdfAsNewWork,
  importSourceManifest,
  inspectPdfFile,
  pickManifestFile,
  pickPdfFile,
  readManifestFile,
  type ImportFields,
  type ManifestFile,
  type PdfFacts,
} from '../../services/pdfImportService';
import { errorMessage, logger } from '../../utils/logger';
import { humanSize } from '../../utils';

type TextField = 'title' | 'creator' | 'date' | 'pageUrl';

const EMPTY_FIELDS: ImportFields = { title: '', creator: '', date: '', language: null, pageUrl: '' };

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** I campi proposti dal manifesto: sono i dati della biblioteca. */
function fieldsFromManifest(manifest: ManifestFile, knownLanguage: (code: string) => boolean): ImportFields {
  const language = manifest.preview.language?.trim().toLowerCase() ?? '';
  return {
    title: manifest.preview.title,
    creator: manifest.preview.creator ?? '',
    date: manifest.preview.date ?? '',
    language: knownLanguage(language) ? language : null,
    pageUrl: manifest.preview.pageUrl ?? '',
  };
}

/**
 * Finestra «Importa un PDF»: crea un'opera nuova da un PDF del computer, con il
 * manifesto della biblioteca facoltativo. I campi venuti dal manifesto portano
 * un segno; cambiarli li trasforma in correzioni a mano.
 */
export function ImportPdfDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  onImported: (sourceId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useLanguageCatalog();
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfFacts | null>(null);
  const [pdfInvalid, setPdfInvalid] = useState(false);
  const [manifestPath, setManifestPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestFile | null>(null);
  const [fields, setFields] = useState<ImportFields>(EMPTY_FIELDS);
  const [fromManifest, setFromManifest] = useState<ImportFields | null>(null);
  const [extractNow, setExtractNow] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setPdfPath(null);
    setPdf(null);
    setPdfInvalid(false);
    setManifestPath(null);
    setManifest(null);
    setFields(EMPTY_FIELDS);
    setFromManifest(null);
    setExtractNow(true);
  }, [open]);

  const choosePdf = async () => {
    const path = await pickPdfFile(t('areas.library.importPdfPick'));
    if (!path) return;
    setPdfPath(path);
    setPdf(null);
    setPdfInvalid(false);
    try {
      setPdf(await inspectPdfFile(path));
      setFields((current) => (current.title.trim() ? current : { ...current, title: fileStem(path) }));
    } catch (error: unknown) {
      logger.debug('library.import.pdfInvalid', { reason: errorMessage(error) });
      setPdfInvalid(true);
    }
  };

  const chooseManifest = async () => {
    const path = await pickManifestFile(t('areas.library.importManifestPick'));
    if (!path) return;
    try {
      const read = await readManifestFile(path);
      const proposed = fieldsFromManifest(read, (code) => Boolean(catalog?.languages.get(code)));
      setManifestPath(path);
      setManifest(read);
      setFromManifest(proposed);
      setFields(proposed);
    } catch (error: unknown) {
      logger.debug('library.import.manifestUnreadable', { reason: errorMessage(error) });
      toast.error(t('areas.library.importManifestUnreadable'));
    }
  };

  const clearManifest = () => {
    setManifestPath(null);
    setManifest(null);
    setFromManifest(null);
  };

  const setField = (field: TextField, value: string) => setFields((current) => ({ ...current, [field]: value }));
  const isFromManifest = (field: keyof ImportFields) =>
    Boolean(fromManifest && fromManifest[field] && fromManifest[field] === fields[field]);

  const canImport = Boolean(pdfPath && pdf && !pdfInvalid && fields.title.trim() && !busy);

  const submit = async () => {
    if (!pdfPath || !canImport) return;
    setBusy(true);
    try {
      const sourceId = await importPdfAsNewWork({
        pdfPath,
        manifestPath,
        manifest,
        fields,
        workspaceId,
        extractNow,
      });
      toast.success(t('areas.library.importPdfDone'));
      onOpenChange(false);
      onImported(sourceId);
    } catch (error: unknown) {
      const reason = errorMessage(error);
      logger.warn('library.import.failed', { reason });
      toast.error(t(reason.includes('pdf_invalid') || reason.includes('pdf_pages_unreadable')
        ? 'areas.library.importPdfInvalid'
        : 'areas.library.importPdfFailed'));
    } finally {
      setBusy(false);
    }
  };

  const uiLanguage = i18n.language;
  const toItems = (entries: LanguageEntry[]) =>
    entries.map((entry) => ({ id: entry.code, label: languageName(entry, uiLanguage), detail: entry.code }));
  const searchLanguageGroups = (query: string): SearchPickerGroup[] => {
    if (!catalog) return [];
    const groups = searchLanguages(catalog, query, uiLanguage, []);
    return [
      { id: 'historical', label: t('workLanguages.groupHistorical'), items: toItems(groups.historical) },
      { id: 'other', label: t('workLanguages.groupAll'), items: toItems(groups.other) },
    ];
  };

  const manifestMark = (field: keyof ImportFields) =>
    isFromManifest(field) ? (
      <Hint label={t('areas.library.importFromManifest')}>
        <FileJson size={12} className="text-editorial-muted" aria-label={t('areas.library.importFromManifest')} />
      </Hint>
    ) : null;

  const textRow = (field: TextField, label: string, required = false) => (
    <SettingRow
      label={
        <span className="flex items-center gap-1.5">
          {required ? `${label} *` : label}
          {manifestMark(field)}
        </span>
      }
    >
      <input
        value={fields[field]}
        onChange={(event) => setField(field, event.target.value)}
        aria-label={label}
        className={`${FIELD_INLINE_CLASSNAME} w-72`}
      />
    </SettingRow>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={t('areas.library.importPdfTitle')}
      closeLabel={t('common.close')}
      icon={<FileText size={16} />}
      widthClassName="max-w-2xl"
      compact
      footer={
        <>
          <DialogCancelButton onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </DialogCancelButton>
          <DialogConfirmButton onClick={() => void submit()} disabled={!canImport}>
            {t('areas.library.importPdfConfirm')}
          </DialogConfirmButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <SettingRow label={t('areas.library.importPdfField')}>
            <span className="flex min-w-0 flex-col items-end">
              <span className="max-w-72 truncate text-sm text-editorial-ink">
                {pdfPath ? fileName(pdfPath) : t('areas.library.importNoFile')}
              </span>
              {pdf && (
                <span className="text-xs text-editorial-muted">
                  {t('areas.library.importPdfFacts', { count: pdf.pages, size: humanSize(pdf.bytes) })}
                </span>
              )}
              {pdfInvalid && <span className="text-xs text-editorial-danger">{t('areas.library.importPdfInvalid')}</span>}
            </span>
            <IconButton size="sm" disabled={busy} onClick={() => void choosePdf()} title={t('areas.library.importPdfPick')}>
              <FolderOpen size={14} />
            </IconButton>
          </SettingRow>
          <SettingRow label={t('areas.library.importManifestField')} hint={t('areas.library.importManifestHint')}>
            <span className="max-w-72 truncate text-sm text-editorial-ink">
              {manifestPath ? fileName(manifestPath) : t('areas.library.importManifestNone')}
            </span>
            <IconButton size="sm" disabled={busy} onClick={() => void chooseManifest()} title={t('areas.library.importManifestPick')}>
              <FolderOpen size={14} />
            </IconButton>
            <IconButton size="sm" disabled={busy || !manifestPath} onClick={clearManifest} title={t('areas.library.importManifestClear')}>
              <X size={14} />
            </IconButton>
          </SettingRow>
        </div>

        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          {textRow('title', t('areas.library.importTitleField'), true)}
          {textRow('creator', t('areas.library.importCreatorField'))}
          {textRow('date', t('areas.library.importDateField'))}
          <SettingRow
            label={
              <span className="flex items-center gap-1.5">
                {t('areas.library.importLanguageField')}
                {manifestMark('language')}
              </span>
            }
          >
            {fields.language ? (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="max-w-48 truncate font-display text-base text-editorial-ink">
                  {languageNameOf(catalog, fields.language, uiLanguage)}
                </span>
                <span className="font-mono text-xs text-editorial-muted">{fields.language}</span>
              </span>
            ) : (
              <span className="text-sm italic text-editorial-muted">{t('workLanguages.notSpecified')}</span>
            )}
            <SearchPicker
              icon={<Languages size={14} />}
              title={t('workLanguages.chooseLanguage')}
              disabled={busy || !catalog}
              searchLabel={t('workLanguages.searchLanguage')}
              search={searchLanguageGroups}
              emptyQueryHint={t('workLanguages.typeToSearchAll')}
              noResults={t('workLanguages.noResults')}
              onPick={(code) => setFields((current) => ({ ...current, language: code }))}
            />
            <IconButton
              size="sm"
              title={t('workLanguages.clearLanguage')}
              disabled={busy || !fields.language}
              onClick={() => setFields((current) => ({ ...current, language: null }))}
            >
              <X size={14} />
            </IconButton>
          </SettingRow>
          {textRow('pageUrl', t('areas.library.importPageUrlField'))}
        </div>

        <ToggleRow
          icon={<FileText size={14} />}
          label={t('areas.library.importExtractNow')}
          hint={t('areas.library.importExtractNowHint')}
          checked={extractNow}
          disabled={busy}
          onChange={() => setExtractNow((current) => !current)}
        />
      </div>
    </Dialog>
  );
}

/** «Carica il manifesto» per un'opera importata: riempie i dati della
 *  biblioteca, le correzioni a mano restano. */
export function ImportManifestButton({ sourceId, onDone }: { sourceId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const path = await pickManifestFile(t('areas.library.importManifestPick'));
    if (!path) return;
    setBusy(true);
    try {
      await importSourceManifest(sourceId, path);
      toast.success(t('areas.library.importManifestDone'));
      onDone();
    } catch (error: unknown) {
      logger.warn('library.import.manifestFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.importManifestUnreadable'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <IconButton size="sm" disabled={busy} onClick={() => void load()} title={t('areas.library.importManifestAction')} tooltipSide="bottom">
      <FileJson size={13} />
    </IconButton>
  );
}
