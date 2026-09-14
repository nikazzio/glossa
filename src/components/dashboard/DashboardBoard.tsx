import { useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { SectionDragHandleProvider } from './sectionDragHandle';

type ColumnId = 'left' | 'right';

export interface BoardSection {
  id: string;
  node: ReactNode;
}

/** Quanto deve muoversi il puntatore prima che sia un trascinamento: senza,
 *  un click sulla maniglia sposterebbe la sezione di un pixel. */
const DRAG_START_DISTANCE = 4;

/**
 * Le sezioni della Panoramica su due colonne, spostabili a trascinamento.
 *
 * L'ordine e la colonna di ognuna vivono in `uiStore`, quindi la disposizione
 * scelta resta anche dopo la chiusura. Una sezione si porta dove serve — anche
 * nell'altra colonna — perché a contare non è l'ordine con cui sono state
 * scritte ma quello con cui si lavora.
 */
export function DashboardBoard({ sections }: { sections: BoardSection[] }) {
  const { t } = useTranslation();
  const columns = useUiStore((state) => state.dashboardSectionColumns);
  const setColumns = useUiStore((state) => state.setDashboardSectionColumns);
  const [dragging, setDragging] = useState<string | null>(null);
  // La colonna di partenza: durante il trascinamento quella corrente è già
  // cambiata, e riordinare di nuovo all'arrivo farebbe scavalcare la sezione
  // su cui si è lasciato.
  const originColumn = useRef<ColumnId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_START_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Una sezione nuova nel codice non deve sparire dalla schermata perché
  // l'ordine salvato non la conosce: finisce in fondo alla colonna sinistra.
  const known = [...columns.left, ...columns.right];
  const placed: Record<ColumnId, string[]> = {
    left: [...columns.left.filter(inSections), ...sections.map((s) => s.id).filter((id) => !known.includes(id))],
    right: columns.right.filter(inSections),
  };

  function inSections(id: string): boolean {
    return sections.some((section) => section.id === id);
  }

  const columnOf = (id: string): ColumnId | null => {
    if (placed.left.includes(id)) return 'left';
    if (placed.right.includes(id)) return 'right';
    return null;
  };

  const nodeOf = (id: string) => sections.find((section) => section.id === id)?.node ?? null;

  /** Dove sta finendo il trascinamento: sopra una sezione, o sulla colonna vuota. */
  const targetColumn = (id: string): ColumnId | null =>
    id === 'left' || id === 'right' ? id : columnOf(id);

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = targetColumn(String(over.id));
    if (!from || !to || from === to) return;
    // Il passaggio da una colonna all'altra si fa mentre si trascina, così la
    // sezione si vede già al suo posto prima di lasciarla.
    const source = placed[from].filter((id) => id !== active.id);
    const overIndex = placed[to].indexOf(String(over.id));
    const destination = [...placed[to]];
    destination.splice(overIndex < 0 ? destination.length : overIndex, 0, String(active.id));
    setColumns({ ...placed, [from]: source, [to]: destination });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const origin = originColumn.current;
    originColumn.current = null;
    const { active, over } = event;
    if (!over) return;
    const column = columnOf(String(active.id));
    if (!column) return;
    // Cambiata colonna, la sezione è già al suo posto: il passaggio l'ha
    // collocata mentre si trascinava, e qui non c'è più niente da spostare.
    if (origin !== column) return;
    const oldIndex = placed[column].indexOf(String(active.id));
    const newIndex = placed[column].indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    setColumns({ ...placed, [column]: arrayMove(placed[column], oldIndex, newIndex) });
  };

  const handleDragStart = (event: DragStartEvent) => {
    originColumn.current = columnOf(String(event.active.id));
    setDragging(String(event.active.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {(['left', 'right'] as ColumnId[]).map((column) => (
          <BoardColumn key={column} id={column} label={t(`dashboard.board.${column}`)}>
            <SortableContext items={placed[column]} strategy={verticalListSortingStrategy}>
              {placed[column].map((id) => (
                <SortableSection key={id} id={id} label={t('dashboard.section.move')}>
                  {nodeOf(id)}
                </SortableSection>
              ))}
            </SortableContext>
          </BoardColumn>
        ))}
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="rounded-lg opacity-90 shadow-lg">{nodeOf(dragging)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Una colonna resta un bersaglio anche quando è vuota: altrimenti, svuotata
 *  una volta, non ci si potrebbe più rimettere niente. */
function BoardColumn({ id, label, children }: { id: ColumnId; label: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={`flex min-h-24 min-w-0 flex-col gap-4 rounded-lg transition-colors ${
        isOver ? 'bg-editorial-accent/5' : ''
      }`}
    >
      {children}
    </div>
  );
}

function SortableSection({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      title={label}
      className="flex cursor-grab touch-none items-center text-editorial-border transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Durante il trascinamento la copia che segue il puntatore è l'unica da
      // leggere: il posto di partenza resta come traccia, smorzato.
      className={isDragging ? 'opacity-40' : ''}
    >
      <SectionDragHandleProvider handle={handle}>{children}</SectionDragHandleProvider>
    </div>
  );
}
