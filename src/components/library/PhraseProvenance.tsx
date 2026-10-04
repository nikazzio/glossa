import { BookOpenText, CalendarDays, FileText, Folder, Hash, History, Languages, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { PhraseProvenanceLookup } from '../../hooks/usePhraseProvenanceLookup';
import type { TextProvenance } from '../../types';
import { StatRow, StatBlock } from '../ui';
import { timestampOf } from '../../utils/libraryCatalogFilters';
import { ResourceFact } from './ResourceFact';

interface PhraseProvenanceProps {
  /** Workspace di casa della frase; `null` = traduzione senza workspace. */
  workspaceId: string | null;
  projectId: string | null;
  chunkId: string | null;
  lookup: PhraseProvenanceLookup;
  /** Il workspace da cui si guarda: la sua frase si dice «questo workspace». */
  currentWorkspaceId?: string | null;
  provenance?: TextProvenance;
  sourcePhrase?: string;
  compact?: boolean;
  createdAt?: string;
}

/** Da dove viene una frase in memoria: workspace, traduzione e frammento, su
 *  righe separate. Una frase importata da file non ha traduzione. */
export function PhraseProvenance({ workspaceId, projectId, chunkId, lookup, currentWorkspaceId, provenance, sourcePhrase, compact = false, createdAt }: PhraseProvenanceProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const home = workspaceId ? workspaces.find((workspace) => workspace.id === workspaceId) : undefined;

  const workspaceValue = workspaceId === null
    ? t('memory.provenance.noWorkspace')
    : workspaceId === currentWorkspaceId
      ? t('memory.provenance.thisWorkspace')
      : home
        ? home.name
        : t('memory.provenance.unknownWorkspace');

  const position = (chunkId ? lookup.chunkPositions[chunkId] : undefined) ?? provenance?.chunkPosition;

  if (compact) {
    const translation = (projectId ? lookup.projectNames[projectId] : undefined) ?? provenance?.projectName;
    return <div className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2">
      <ResourceFact icon={Folder} label={t('memory.provenance.workspace')} value={workspaceValue} />
      <ResourceFact icon={BookOpenText} label={t('memory.provenance.book')} value={provenance?.sourceTitle ?? t('memory.provenance.noBook')} />
      {provenance?.sourceVersionLabel && <ResourceFact icon={FileText} label={t('memory.provenance.bookVersion')} value={provenance.sourceVersionLabel} />}
      {translation && <ResourceFact icon={Languages} label={t('memory.provenance.translation')} value={translation} />}
      {position !== undefined && position !== null && <ResourceFact icon={Hash} label={t('memory.provenance.chunk')} value={String(position + 1)} />}
      {createdAt && <ResourceFact icon={CalendarDays} label={t('library.createdAt')} value={new Date(timestampOf(createdAt)).toLocaleString()} />}
      {provenance?.workspaceName && provenance.workspaceId !== workspaceId && <ResourceFact icon={History} label={t('memory.provenance.originWorkspace')} value={provenance.workspaceName} />}
      {!projectId && <ResourceFact icon={History} label={t('memory.provenance.origin')} value={t(translation ? 'memory.provenance.translationRemoved' : 'memory.provenance.imported')} />}
      {sourcePhrase && provenance?.selection && provenance.selection.exact !== sourcePhrase && <ResourceFact icon={Pencil} label={t('memory.provenance.textVersion')} value={t('memory.provenance.sourceEdited')} />}
    </div>;
  }

  return (
    <dl className="space-y-1">
      <StatBlock label={t('memory.provenance.workspace')} value={workspaceValue} />
      {provenance?.workspaceName && provenance.workspaceId !== workspaceId && (
        <StatBlock label={t('memory.provenance.originWorkspace')} value={provenance.workspaceName} />
      )}
      <StatBlock label={t('memory.provenance.book')} value={provenance?.sourceTitle ?? t('memory.provenance.noBook')} />
      {provenance?.sourceVersionLabel && <StatBlock label={t('memory.provenance.bookVersion')} value={provenance.sourceVersionLabel} />}
      {sourcePhrase && provenance?.selection && provenance.selection.exact !== sourcePhrase && (
        <StatRow label={t('memory.provenance.textVersion')} value={t('memory.provenance.sourceEdited')} />
      )}
      {projectId || provenance?.projectName ? (
        <>
          <StatBlock
            label={t('memory.provenance.translation')}
            value={(projectId ? lookup.projectNames[projectId] : undefined) ?? provenance?.projectName ?? t('memory.provenance.unknownTranslation')}
          />
          {!projectId && <StatRow label={t('memory.provenance.origin')} value={t('memory.provenance.translationRemoved')} />}
          {position !== undefined && position !== null && (
            <StatRow label={t('memory.provenance.chunk')} value={String(position + 1)} />
          )}
        </>
      ) : (
        <StatRow label={t('memory.provenance.origin')} value={t('memory.provenance.imported')} />
      )}
    </dl>
  );
}
