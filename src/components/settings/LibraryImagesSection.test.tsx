import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryImagesSection } from './LibraryImagesSection';
import {
  getGlobalSizeCap,
  getThumbnailEdge,
  setGlobalSizeCap,
  setThumbnailEdge,
} from '../../services/downloadSettingsService';

vi.mock('../../services/downloadSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/downloadSettingsService')>();
  return {
    ...actual,
    getGlobalSizeCap: vi.fn(),
    getThumbnailEdge: vi.fn(),
    setGlobalSizeCap: vi.fn(),
    setThumbnailEdge: vi.fn(),
  };
});

const readCap = vi.mocked(getGlobalSizeCap);
const readEdge = vi.mocked(getThumbnailEdge);
const saveCap = vi.mocked(setGlobalSizeCap);
const saveEdge = vi.mocked(setThumbnailEdge);

describe('misure delle immagini', () => {
  beforeEach(() => {
    readCap.mockReset().mockResolvedValue('2000');
    readEdge.mockReset().mockResolvedValue(300);
    saveCap.mockReset().mockResolvedValue(undefined);
    saveEdge.mockReset().mockResolvedValue(undefined);
  });

  it('mostra il tetto e la misura delle miniature come sono salvati', async () => {
    render(<LibraryImagesSection />);

    expect(await screen.findByLabelText('settings.download.sizeCap')).toHaveValue('2000');
    expect(await screen.findByLabelText('settings.download.thumbnailEdge')).toHaveValue('300');
  });

  it('la misura più grande disponibile è una scelta', async () => {
    const user = userEvent.setup();
    render(<LibraryImagesSection />);
    const cap = await screen.findByLabelText('settings.download.sizeCap');

    await user.selectOptions(cap, 'max');

    expect(saveCap).toHaveBeenCalledWith('max');
  });

  it('cambiando la misura delle miniature la salva come numero', async () => {
    const user = userEvent.setup();
    render(<LibraryImagesSection />);
    const edge = await screen.findByLabelText('settings.download.thumbnailEdge');

    await user.selectOptions(edge, '600');

    expect(saveEdge).toHaveBeenCalledWith(600);
  });
});
