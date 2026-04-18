import { Settings } from 'lucide-react';
import { usePipelineStore } from '../../stores/pipelineStore';

export function Header() {
  const { setShowSettings } = usePipelineStore();

  return (
    <header className="px-10 py-10 border-b border-editorial-border bg-editorial-bg flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="brand font-display italic text-4xl tracking-tight">Glossa // Pipeline</div>
      <div className="flex items-center gap-6">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-editorial-muted">
          Multi-LLM Pipeline v1.0
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 border border-editorial-border hover:bg-editorial-ink hover:text-white transition-colors"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
