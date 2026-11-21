import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisArea } from './AnalysisArea';
import { useUiStore } from '../../stores/uiStore';

const loading = { data: null, loading: true, error: false };
vi.mock('../../hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({
    since: null, usage: loading, activity: loading, words: loading, quality: loading, ocr: loading,
    memory: loading, languages: loading, glossaries: loading, progress: loading, chunkWords: loading,
  }),
}));

describe('AnalysisArea', () => {
  beforeEach(() => {
    useUiStore.setState({
      statsPeriod: '30d',
      statsSectionColumns: { left: ['rhythm', 'forecast'], right: [] },
    });
  });

  it('opens Statistics, not an empty page', () => {
    render(<AnalysisArea />);

    expect(screen.getByText('dashboardStats.title')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'dashboardStats.period.label' })).toBeInTheDocument();
  });

  it('keeps the period and section order chosen before', () => {
    render(<AnalysisArea />);

    expect(screen.getByRole('radio', { name: 'dashboardStats.period.30d' })).toHaveAttribute('aria-checked', 'true');
    const rhythm = screen.getByText('dashboardStats.rhythm.title');
    const forecast = screen.getByText('dashboardStats.forecast.title');
    expect(rhythm.compareDocumentPosition(forecast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
