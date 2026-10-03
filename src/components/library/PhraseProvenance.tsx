import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { PhraseProvenanceLookup } from '../../hooks/usePhraseProvenanceLookup';
import { StatRow } from '../ui';
import { WorkspaceIdentity } from '../workspace/WorkspaceIdentity';

interface PhraseProvenanceProps {
  /** Workspace di casa della frase; `null` = traduzione senza workspace. */
  workspaceId: string | null;
  projectId: string | null;
  chunkId: string | null;
  lookup: PhraseProvenanceLookup;
  /** Il workspace da cui si guarda: la sua frase si dice «questo workspace». */
  currentWorkspaceId?: string | null;
}

/** Da dove viene una frase in memoria: workspace, traduzione e frammento, su
 *  righe separate. Una frase importata da file non ha traduzione. */
export function PhraseProvenance({ workspaceId, projectId, chunkId, lookup, currentWorkspaceId }: PhraseProvenanceProps) {
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

  const position = chunkId ? lookup.chunkPositions[chunkId] : undefined;

  return (
    <dl className="space-y-1">
      <StatRow label={t('memory.provenance.workspace')} value={workspaceValue} />
      {projectId ? (
        <>
          <StatRow
            label={t('memory.provenance.translation')}
            value={lookup.projectNames[projectId] ?? t('memory.provenance.unknownTranslation')}
          />
          {position !== undefined && (
            <StatRow label={t('memory.provenance.chunk')} value={String(position + 1)} />
          )}
        </>
      ) : (
        <StatRow label={t('memory.provenance.origin')} value={t('memory.provenance.imported')} />
      )}
    </dl>
  );
}
