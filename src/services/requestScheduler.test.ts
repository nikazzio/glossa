import { describe, expect, it, vi } from 'vitest';
import { createRequestScheduler } from './requestScheduler';

describe('request scheduler', () => {
  it('fa passare il visore davanti alle miniature ancora in coda', async () => {
    const scheduler = createRequestScheduler(1);
    const order: string[] = [];
    let release!: () => void;
    const active = scheduler.schedule(
      () => new Promise<void>((resolve) => {
        order.push('miniatura attiva');
        release = resolve;
      }),
      { priority: 'low' },
    );
    const queuedThumbnail = scheduler.schedule(async () => {
      order.push('miniatura in coda');
    }, { priority: 'low' });
    const viewer = scheduler.schedule(async () => {
      order.push('visore');
    }, { priority: 'high' });

    await vi.waitFor(() => expect(order).toEqual(['miniatura attiva']));
    release();
    await Promise.all([active, queuedThumbnail, viewer]);

    expect(order).toEqual(['miniatura attiva', 'visore', 'miniatura in coda']);
  });

  it('non avvia una miniatura uscita dallo schermo mentre era in coda', async () => {
    const scheduler = createRequestScheduler(1);
    let release!: () => void;
    const active = scheduler.schedule(() => new Promise<void>((resolve) => (release = resolve)));
    const controller = new AbortController();
    const run = vi.fn(async () => undefined);
    const stale = scheduler.schedule(run, { priority: 'low', signal: controller.signal });

    controller.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await active;

    expect(run).not.toHaveBeenCalled();
  });

  it('tiene liberi dei posti per la pagina aperta anche a coda piena di miniature', async () => {
    const scheduler = createRequestScheduler(3, 1);
    const started: string[] = [];
    const never = () => new Promise<void>(() => {});
    const run = (name: string) => () => {
      started.push(name);
      return never();
    };

    void scheduler.schedule(run('miniatura-1'), { priority: 'low' });
    void scheduler.schedule(run('miniatura-2'), { priority: 'low' });
    void scheduler.schedule(run('miniatura-3'), { priority: 'low' });
    void scheduler.schedule(run('tassello'), { priority: 'high' });
    await Promise.resolve();

    // Il terzo posto è riservato: la terza miniatura resta in coda, il
    // tassello parte subito.
    expect(started).toEqual(['miniatura-1', 'miniatura-2', 'tassello']);
  });
});
