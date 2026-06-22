export { Header } from './Header';
export { PipelineSidebar } from './PipelineSidebar';
// ProjectFlyout NON è ri-esportato qui: è caricato solo via lazy import diretto in App
// (un re-export nel barrel lo trascinerebbe nel chunk principale → INEFFECTIVE_DYNAMIC_IMPORT).
