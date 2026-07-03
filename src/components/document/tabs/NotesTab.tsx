import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  HelpCircle,
  MessageSquare,
  NotebookText,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnotationsStore } from '../../../stores/annotationsStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useUiStore } from '../../../stores/uiStore';
import { IconButton, PillButton } from '../../ui';
import type { AnnotationType, TranslationChunk } from '../../../types';
import type { Annotation } from '../../../types';

export interface NotesTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

/** Mappa canonica tipo → icona/colore/etichetta. Riusata anche altrove (es. IndexTab) per non inventare palette ad-hoc. */
export const ANNOTATION_META: Record<AnnotationType, { icon: LucideIcon; colorClass: string; bgClass: string; labelKey: string }> = {
  comment:  { icon: MessageSquare, colorClass: 'text-editorial-charcoal', bgClass: 'bg-editorial-charcoal', labelKey: 'annotations.typeComment' },
  doubt:    { icon: HelpCircle,    colorClass: 'text-editorial-warning',  bgClass: 'bg-editorial-warning',  labelKey: 'annotations.typeDoubt' },
  problem:  { icon: AlertTriangle, colorClass: 'text-editorial-danger',   bgClass: 'bg-editorial-danger',   labelKey: 'annotations.typeProblem' },
  approved: { icon: CheckCircle2,  colorClass: 'text-editorial-success',  bgClass: 'bg-editorial-success',  labelKey: 'annotations.typeApproved' },
};

const ANNOTATION_TYPES: AnnotationType[] = ['comment', 'doubt', 'problem', 'approved'];

function TypeSelector({ selected, onSelect }: { selected: AnnotationType; onSelect: (t: AnnotationType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex items-center gap-1">
      {ANNOTATION_TYPES.map((type) => {
        const meta = ANNOTATION_META[type];
        const Icon = meta.icon;
        return (
          <IconButton
            key={type}
            size="sm"
            tone={selected === type ? 'accent' : 'default'}
            onClick={() => onSelect(type)}
            title={t(meta.labelKey)}
            ariaPressed={selected === type}
          >
            <Icon size={12} />
          </IconButton>
        );
      })}
      <span className="mx-1 h-3 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="font-display text-sm italic text-editorial-ink">{t(ANNOTATION_META[selected].labelKey)}</span>
    </div>
  );
}

function AnchorPill({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-editorial-border/50 bg-editorial-textbox/40 px-3 py-1.5">
      <span className="flex-1 truncate font-display text-sm italic text-editorial-muted">«{text}»</span>
      <IconButton size="sm" tone="default" onClick={onClear} title="Rimuovi ancora">
        <X size={11} />
      </IconButton>
    </div>
  );
}

function AnnotationCard({
  annotation,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onLocate,
  number,
}: {
  annotation: Annotation;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: Partial<Pick<Annotation, 'type' | 'content' | 'anchorText'>>) => void;
  onDelete: () => void;
  onLocate: (() => void) | null;
  number: number | null;
}) {
  const { t } = useTranslation();
  const meta = ANNOTATION_META[annotation.type];
  const Icon = meta.icon;

  const [editType, setEditType] = useState<AnnotationType>(annotation.type);
  const [editContent, setEditContent] = useState(annotation.content);
  const [editAnchor, setEditAnchor] = useState(annotation.anchorText ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isEditing) {
    return (
      <article className="py-3">
        <TypeSelector selected={editType} onSelect={setEditType} />
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={5}
          className="w-full resize-none rounded-xl border border-editorial-border bg-editorial-textbox px-3 py-2 text-sm leading-relaxed text-editorial-ink placeholder:text-editorial-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
        <input
          type="text"
          value={editAnchor}
          onChange={(e) => setEditAnchor(e.target.value)}
          placeholder={t('annotations.anchorPlaceholder')}
          className="mt-2 w-full rounded-xl border border-editorial-border bg-editorial-textbox px-3 py-1.5 text-xs text-editorial-ink placeholder:text-editorial-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
        <div className="mt-3 flex items-center gap-2">
          <PillButton
            variant="accent"
            onClick={() => onSave({ type: editType, content: editContent, anchorText: editAnchor.trim() || undefined })}
            disabled={!editContent.trim()}
          >
            {t('annotations.updateButton')}
          </PillButton>
          <PillButton variant="secondary" onClick={onCancelEdit}>
            {t('annotations.cancelButton')}
          </PillButton>
        </div>
      </article>
    );
  }

  return (
    <article className="group py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {number !== null && (
              <span className="shrink-0 font-display text-sm font-bold text-editorial-danger" data-tooltip={`[^${number}]`}>
                {number}
              </span>
            )}
            <Icon size={13} className={`shrink-0 ${meta.colorClass}`} />
            <span className={`truncate text-[11px] font-bold uppercase tracking-[0.14em] ${meta.colorClass}`}>
              {t(meta.labelKey)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {confirmingDelete ? (
            <>
              <span className="text-[10px] text-editorial-danger">{t('annotations.confirmDelete')}</span>
              <IconButton size="sm" tone="danger" onClick={onDelete} title={t('annotations.confirmDeleteYes')}>
                <Trash2 size={11} />
              </IconButton>
              <IconButton size="sm" tone="default" onClick={() => setConfirmingDelete(false)} title={t('annotations.confirmDeleteNo')}>
                <X size={11} />
              </IconButton>
            </>
          ) : (
            <>
              {annotation.anchorText && onLocate && (
                <IconButton size="sm" tone="default" onClick={onLocate} title={t('annotations.locateInTextTooltip')}>
                  <Crosshair size={11} />
                </IconButton>
              )}
              <IconButton size="sm" tone="default" onClick={onEdit} title={t('annotations.editButton')}>
                <Pencil size={11} />
              </IconButton>
              <IconButton size="sm" tone="default" onClick={() => setConfirmingDelete(true)} title={t('annotations.deleteButton')}>
                <Trash2 size={11} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {annotation.anchorText && (
        <div className="mt-1.5 w-full font-display text-sm italic leading-snug text-editorial-muted">
          «{annotation.anchorText}»
        </div>
      )}
      <p className="mt-1.5 w-full whitespace-pre-wrap text-sm leading-relaxed text-editorial-ink">{annotation.content}</p>
    </article>
  );
}

export function NotesTab({ panelId, labelledBy, currentChunk }: NotesTabProps) {
  const { t } = useTranslation();
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const { annotationsByChunkId, addAnnotation, updateAnnotation, deleteAnnotation } = useAnnotationsStore();
  const pendingAnnotationAnchor = useUiStore((s) => s.pendingAnnotationAnchor);
  const setPendingAnnotationAnchor = useUiStore((s) => s.setPendingAnnotationAnchor);
  const focusAnnotationInChunk = useUiStore((s) => s.focusAnnotationInChunk);
  const focusIsAnnotation = useUiStore((s) => s.focusIsAnnotation);
  const focusedIssueQuery = useUiStore((s) => s.focusedIssueQuery);
  const clearAnnotationFocus = useUiStore((s) => s.clearAnnotationFocus);

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<AnnotationType>('comment');
  const [formContent, setFormContent] = useState('');
  const [formAnchor, setFormAnchor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const footnotes = currentChunk?.footnotes ?? [];
  const annotations = currentChunk ? (annotationsByChunkId.get(currentChunk.id) ?? []) : [];

  // Number anchored notes by reading order in the final draft — the same order
  // the preview footnotes use — so each card shows its footnote number.
  const draft = currentChunk?.currentDraft ?? '';
  const numberById = useMemo(() => {
    const placed = annotations
      .map((a) => ({ id: a.id, index: a.anchorText?.trim() ? draft.indexOf(a.anchorText.trim()) : -1 }))
      .filter((p) => p.index !== -1)
      .sort((x, y) => x.index - y.index);
    return new Map(placed.map((p, order) => [p.id, order + 1]));
  }, [annotations, draft]);

  useEffect(() => {
    if (!pendingAnnotationAnchor || !currentChunk) return;
    if (pendingAnnotationAnchor.chunkId !== currentChunk.id) return;
    setFormAnchor(pendingAnnotationAnchor.text);
    setFormType('comment');
    setFormContent(pendingAnnotationAnchor.content ?? '');
    setShowForm(true);
    setPendingAnnotationAnchor(null);
  }, [pendingAnnotationAnchor, currentChunk, setPendingAnnotationAnchor]);

  if (!currentChunk) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <NotebookText size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('annotations.emptyNoChunk')}</p>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!formContent.trim() || !activePipelineId) return;
    const anchor = formAnchor.trim();
    const content = formContent.trim();

    // The draft is never mutated: the inline marker and footnote are derived
    // from the anchor at render time (see composeAnnotatedMarkdown).
    await addAnnotation({
      chunkId: currentChunk.id,
      pipelineId: activePipelineId,
      type: formType,
      content,
      anchorText: anchor || null,
      sequence: annotations.length,
    });
    setFormContent('');
    setFormAnchor('');
    setFormType('comment');
    setShowForm(false);
  };

  const handleSaveEdit = async (id: string, updates: Partial<Pick<Annotation, 'type' | 'content' | 'anchorText'>>) => {
    await updateAnnotation(id, currentChunk.id, updates);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const ann = annotations.find((a) => a.id === id);
    await deleteAnnotation(id, currentChunk.id);
    if (editingId === id) setEditingId(null);
    // Only clear the annotation-locate focus — never touch an active audit focus.
    if (focusIsAnnotation && ann?.anchorText && ann.anchorText === focusedIssueQuery) {
      clearAnnotationFocus();
    }
  };

  const closeForm = () => { setShowForm(false); setFormContent(''); setFormAnchor(''); };

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col gap-4 px-5 py-5">

      {/* Add form */}
      {showForm && (
        <div className="border-y border-editorial-border/55 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('annotations.addButton')}
            </span>
            <IconButton size="sm" tone="default" onClick={closeForm} title={t('annotations.cancelButton')}>
              <X size={12} />
            </IconButton>
          </div>
          <TypeSelector selected={formType} onSelect={setFormType} />
          <textarea
            autoFocus
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder={t('annotations.placeholder')}
            rows={3}
            className="w-full resize-none rounded-xl border border-editorial-border bg-editorial-textbox px-3 py-2 text-sm leading-relaxed text-editorial-ink placeholder:text-editorial-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          {formAnchor && <AnchorPill text={formAnchor} onClear={() => setFormAnchor('')} />}
          <div className="mt-3 flex items-center gap-2">
            <PillButton variant="accent" onClick={handleAdd} disabled={!formContent.trim()}>
              {t('annotations.saveButton')}
            </PillButton>
            <PillButton variant="secondary" onClick={closeForm}>
              {t('annotations.cancelButton')}
            </PillButton>
          </div>
        </div>
      )}

      {/* Annotations list */}
      {annotations.length === 0 && !showForm && (
        <p className="px-1 text-xs text-editorial-muted">{t('annotations.emptyNoAnnotations')}</p>
      )}
      {annotations.length > 0 && (
        <div className="divide-y divide-editorial-border/55">
          {annotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              isEditing={editingId === ann.id}
              onEdit={() => setEditingId(ann.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(updates) => handleSaveEdit(ann.id, updates)}
              onDelete={() => handleDelete(ann.id)}
              onLocate={ann.anchorText ? () => focusAnnotationInChunk(currentChunk.id, ann.anchorText!) : null}
              number={numberById.get(ann.id) ?? null}
            />
          ))}
        </div>
      )}

      {/* Source footnotes */}
      {footnotes.length > 0 && (
        <>
          <div className="mx-0 my-1 h-px bg-editorial-border/40" />
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 text-[10px] font-sans font-bold uppercase tracking-[0.16em] text-editorial-danger/80 transition-colors hover:text-editorial-danger">
              <ChevronRight size={11} className="shrink-0 text-editorial-danger/70 transition-transform group-open:rotate-90" />
              {t('annotations.sourceTitle')}
            </summary>
            <div className="mt-3 divide-y divide-editorial-danger/25">
              {footnotes.map((note) => (
                <article key={note.id} className="py-2">
                  <div className="mb-1 font-display text-sm italic text-editorial-danger">{note.marker}</div>
                  <p className="text-[12px] leading-relaxed text-editorial-danger/90">{note.text}</p>
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
