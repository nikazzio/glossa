import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const tauriMockPath = fileURLToPath(new URL('./support/tauriMock.js', import.meta.url));

async function openFirstRun(page: Page): Promise<void> {
  await page.addInitScript({ path: tauriMockPath });
  await page.addInitScript(() => window.localStorage.setItem('glossa-lang', 'it'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crea il tuo primo workspace' })).toBeVisible();
}

async function createWorkspace(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'Nome workspace' }).fill('Archivio E2E');
  await page.getByRole('button', { name: 'Crea workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('avvia l’app e crea il primo workspace', async ({ page }) => {
  await openFirstRun(page);
  await createWorkspace(page);

  await expect(page.getByRole('button', { name: 'Archivio E2E' })).toBeVisible();
});

test('crea un progetto e apre la sua schermata di importazione', async ({ page }) => {
  await openFirstRun(page);
  await createWorkspace(page);

  await page.getByRole('button', { name: 'Archivio E2E' }).click();
  await expect(page.getByRole('heading', { name: 'Archivio E2E' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuovo libro' }).click();
  await page.getByPlaceholder('Nome del progetto...').fill('Manoscritto E2E');
  await page.getByRole('button', { name: 'Crea', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Manoscritto E2E' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importa documento' })).toBeVisible();
});
