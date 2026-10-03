import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { PhraseProvenanceLookup } from '../../hooks/usePhraseProvenanceLookup';
import type { TextProvenance } from '../../types';
import { StatRow, StatBlock } from '../ui';
import { WorkspaceIdentity } from '../workspace/WorkspaceIdentity';

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
}

/** Da dove viene una frase in memoria: workspace, traduzione e frammento, su
 *  righe separate. Una frase importata da file non ha traduzione. */
export function PhraseProvenance({ workspaceId, projectId, chunkId, lookup, currentWorkspaceId, provenance, sourcePhrase }: PhraseProvenanceProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const home = workspaceId ? workspaces.find((workspace) => workspace.id === workspaceId) : undefined;

  const workspaceValue = workspaceId === null
    ? t('memory.provenance.noWorkspace')
    : workspaceId === currentWorkspaceId
      ? t('memory.provenance.thisWorkspace')
      : home
        ? <WorkspaceIdentity workspace={home} iconSize={13} />
        : t('memory.provenance.unknownWorkspace');

  const position = (chunkId ? lookup.chunkPositions[chunkId] : undefined) ?? provenance?.chunkPosition;

  return (
    <dl className="space-y-1">
      <StatRow label={t('memory.provenance.workspace')} value={workspaceValue} />
      {provenance?.workspaceName && provenance.workspaceId !== workspaceId && (
        <StatRow label={t('memory.provenance.originWorkspace')} value={provenance.workspaceName} />
      )}
      <StatBlock label={t('memory.provenance.book')} value={provenance?.sourceTitle ?? t('memory.provenance.noBook')} />
      {provenance?.sourceVersionLabel && <StatRow label={t('memory.provenance.bookVersion')} value={provenance.sourceVersionLabel} />}
      {sourcePhrase && provenance?.selection && provenance.selection.exact !== sourcePhrase && (
        <StatRow label={t('memory.provenance.textVersion')} value={t('memory.provenance.sourceEdited')} />
      )}
      {projectId || provenance?.projectName ? (
        <>
          <StatRow
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
