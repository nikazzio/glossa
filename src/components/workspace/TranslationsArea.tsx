import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Languages, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL, MOTION_DURATION, MOTION_SHIFT } from '../layout/motion';
import { AREA_PAPER_CLASSNAME, AreaHeading, CatalogViewSwitch, EmptyState, IconButton, ListReveal, Spinner, type RowCommand } from '../ui';
import { CATALOG_GRID_CLASSNAME, CATALOG_GROUP_HEADER_CLASSNAME, CATALOG_LIST_CLASSNAME } from '../ui/catalogStyles';
import { confirm } from '../../stores/confirmStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { withWorkspaceFilter } from '../../navigation/appLocation';
import { renameProject } from '../../services/projectService';
import { listTranslationCatalog, type TranslationCatalogEntry } from '../../services/translationCatalogService';
import {
  EMPTY_TRANSLATION_FILTERS,
  TRANSLATION_FACETS,
  filterTranslationCatalog,
  groupTranslationCatalog,
  orderTranslationCatalog,
  splitLanguagePair,
  translationFacetCounts,
  translationShelfCounts,
  type TranslationFacet,
  type TranslationFilters,
} from '../../utils/translationCatalogFilters';
import { CreateProjectDialog } from '../projects/CreateProjectDialog';
import { TranslationCatalogRow, type TranslationRowProps } from '../projects/TranslationCatalogRow';
import { useLanguageLabel } from '../../hooks/useLanguageLabel';
import { TranslationCatalogTable } from '../projects/TranslationCatalogTable';
import { TranslationQuickFilters } from '../projects/TranslationQuickFilters';
import { TranslationShelves } from '../projects/TranslationShelves';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Area globale Traduzioni: il catalogo delle traduzioni di tutti i workspace,
 * sul modello delle Trascrizioni — scaffali a destra, ricerca e filtri rapidi
 * sopra l'elenco, tre viste. Un click apre la traduzione nell'editor.
 */
export function TranslationsArea() {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const location = useUiStore((s) => s.location);
  const view = useUiStore((s) => s.translationsView);
  const setView = useUiStore((s) => s.setTranslationsView);
  const grouping = useUiStore((s) => s.translationsGrouping);
  const setGrouping = useUiStore((s) => s.setTranslationsGrouping);
  const openProjectInWorkspace = useProjectStore((s) => s.openProjectInWorkspace);
  const removeProject = useProjectStore((s) => s.removeProject);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const languageLabel = useLanguageLabel();
  const workspaceFilter = location.area === 'translations' ? location.workspaceFilter : undefined;

  const [catalog, setCatalog] = useState<TranslationCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState(EMPTY_TRANSLATION_FILTERS);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [firstReveal, setFirstReveal] = useState(true);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await listTranslationCatalog());
      setLoadError(false);
    } catch (err: unknown) {
      setLoadError(true);
      toast.error(t('areas.translations.catalog.loadFailed'), { description: errorText(err) });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    if (catalog.length > 0) setFirstReveal(false);
  }, [catalog.length]);

  // Il filtro workspace vive anche nell'indirizzo, come in Biblioteca e Trascrizioni.
  useEffect(() => {
    setFilters((current) =>
      current.workspaceId === (workspaceFilter ?? '') ? current : { ...current, workspaceId: workspaceFilter ?? '' });
  }, [workspaceFilter]);

  const changeFilters = (next: TranslationFilters) => {
    setFilters(next);
    const nextWorkspaceFilter = next.workspaceId || null;
    if (nextWorkspaceFilter !== (workspaceFilter ?? null)) navigate(withWorkspaceFilter(location, nextWorkspaceFilter));
  };

  const now = Date.now();
  const filtered = orderTranslationCatalog(filterTranslationCatalog(catalog, filters, now), filters.sort);
  const counts = Object.fromEntries(TRANSLATION_FACETS.map((facet) =>
    [facet, translationFacetCounts(catalog, filters, now, facet)])) as Record<TranslationFacet, Map<string, number>>;
  const workspaceName = (id: string) =>
    workspaces.find((workspace) => workspace.id === id)?.name
    ?? catalog.find((entry) => entry.workspaceId === id)?.workspaceName
    ?? t('areas.translations.catalog.grouping.missing.workspace');
  const pairLabel = (key: string) => {
    const [source, target] = splitLanguagePair(key);
    return `${languageLabel(source)} → ${languageLabel(target)}`;
  };
  const valueLabel = (facet: TranslationFacet, value: string) =>
    facet === 'workspaceId' ? workspaceName(value) : pairLabel(value);
  const groupLabel = (key: string) => (grouping === 'workspace' ? workspaceName(key) : pairLabel(key));
  const groups = groupTranslationCatalog(filtered, grouping, (a, b) => groupLabel(a).localeCompare(groupLabel(b)));

  const open = async (entry: TranslationCatalogEntry) => {
    setOpeningId(entry.id);
    try {
      await openProjectInWorkspace(entry.id, entry.workspaceId);
    } catch (err: unknown) {
      setOpeningId(null);
      toast.error(t('projects.loadFailed'), { description: errorText(err) });
    }
  };

  const run = async (work: () => Promise<void>, failure: string) => {
    try {
      await work();
      await loadCatalog();
    } catch (err: unknown) {
      toast.error(t(failure), { description: errorText(err) });
    }
  };

  const remove = async (entry: TranslationCatalogEntry) => {
    const ok = await confirm({
      title: t('projects.confirmDeleteTitle'),
      message: t('projects.confirmDeleteMessage', { name: entry.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await removeProject(entry.id);
      toast.success(t('projects.deleted'));
    }, 'projects.deleteFailed');
  };

  /** I comandi di una traduzione, uguali in elenco, copertine e tabella: nome | eliminazione. */
  const commandsFor = (entry: TranslationCatalogEntry): RowCommand[][] => [
    [{
      key: 'rename',
      icon: <Pencil size={14} />,
      label: t('areas.translations.catalog.rename'),
      onClick: () => setRenamingId(entry.id),
    }],
    [{
      key: 'remove',
      icon: <Trash2 size={14} />,
      label: t('projects.delete'),
      tone: 'danger',
      onClick: () => void remove(entry),
    }],
  ];

  const rowPropsFor = (entry: TranslationCatalogEntry): TranslationRowProps => ({
    entry,
    commands: commandsFor(entry),
    renaming: renamingId === entry.id,
    onRename: (name) => {
      setRenamingId(null);
      void run(() => renameProject(entry.id, name), 'areas.translations.catalog.renameFailed');
    },
    onRenameCancel: () => setRenamingId(null),
    onOpen: () => void open(entry),
    disabled: openingId !== null,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: MOTION_SHIFT }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION_DURATION, ease: EASE_EDITORIAL }}
      className="flex h-full min-h-0 w-full min-w-0 flex-1"
    >
      <main className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${AREA_PAPER_CLASSNAME.translations}`}>
        <div className="px-5 pt-5 md:px-6">
          <AreaHeading area="translations" title={t('areas.translations.title')}>
            <div className="flex items-center gap-1">
              <IconButton size="sm" onClick={() => setShowNewDialog(true)} title={t('areas.translations.catalog.newTranslation')}>
                <Plus size={13} />
              </IconButton>
              {catalog.length > 0 && <CatalogViewSwitch view={view} onChange={setView} />}
            </div>
          </AreaHeading>
        </div>
        {catalog.length > 0 && (
          <TranslationQuickFilters filters={filters} onChange={changeFilters} counts={counts}
            valueLabel={valueLabel} grouping={grouping} onGrouping={setGrouping} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 text-sm text-editorial-muted" />
            </div>
          ) : loadError && catalog.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <EmptyState icon={<AlertCircle size={20} />} message={t('areas.translations.catalog.loadFailed')}
                className="flex flex-col items-center gap-3" />
              <IconButton size="sm" onClick={() => void loadCatalog()} title={t('areas.library.retry')}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
          ) : catalog.length === 0 ? (
            <EmptyState icon={<Languages size={20} />} message={t('areas.translations.emptyMessage')}
              hint={t('areas.translations.emptyHint')} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Languages size={20} />} message={t('areas.translations.catalog.filters.noMatches')} />
          ) : (
            <div className="px-5 pb-4 md:px-6">
              {groups.map((group) => (
                <section key={group.key} aria-label={grouping === 'none' ? undefined : groupLabel(group.key)}>
                  {grouping !== 'none' && (
                    <h2 className={`${CATALOG_GROUP_HEADER_CLASSNAME} ${AREA_PAPER_CLASSNAME.translations}`}>
                      {groupLabel(group.key)}
                      <span className="font-sans text-xs not-italic tabular-nums text-editorial-muted">{group.entries.length}</span>
                    </h2>
                  )}
                  {view === 'table' ? (
                    <TranslationCatalogTable
                      entries={group.entries}
                      sort={filters.sort}
                      onSort={(sort) => changeFilters({ ...filters, sort })}
                      rowPropsFor={rowPropsFor}
                    />
                  ) : (
                    <div className={view === 'grid' ? CATALOG_GRID_CLASSNAME : CATALOG_LIST_CLASSNAME}>
                      {group.entries.map((entry, index) => (
                        <ListReveal key={entry.id} index={index} stagger={firstReveal}
                          className={view === 'grid' ? 'h-full' : undefined}>
                          <TranslationCatalogRow view={view} {...rowPropsFor(entry)} />
                        </ListReveal>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
      <aside className="flex w-56 shrink-0 flex-col border-l border-editorial-border bg-surface-panel">
        <TranslationShelves filters={filters} onChange={changeFilters} counts={translationShelfCounts(catalog, now)} />
      </aside>

      <CreateProjectDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
    </motion.div>
  );
}
