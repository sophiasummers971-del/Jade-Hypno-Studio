import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const entry = pathToFileURL(resolve('dist/index.html')).href;

test('production file build works offline, exports/imports and persists after browser restart', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'jade-offline-'));
  let context: BrowserContext | undefined;
  const requests: string[] = [];
  const errors: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      acceptDownloads: true,
      offline: true,
    });
    context.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    let page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(
      page.getByRole('button', { name: 'New session', exact: true }),
    ).toBeEnabled();
    expect(
      await page.locator('body').evaluate((el) => getComputedStyle(el).margin),
    ).toBe('0px');
    await page
      .getByRole('button', { name: 'New session', exact: true })
      .click();
    await page.getByLabel('Session title').fill('Offline session');
    await page.getByRole('button', { name: 'Create session' }).click();
    await page
      .getByLabel('Description')
      .fill('Survives a complete browser restart.');
    await expect(
      page.getByText('Saved locally', { exact: true }),
    ).toBeVisible();
    const downloadPending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export session JSON' }).click();
    const download = await downloadPending;
    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();
    const json = await readFile(exportPath!, 'utf8');
    const exported = JSON.parse(json);
    expect(exported.schemaVersion).toBe(1);
    expect(exported.description).toContain('restart');
    await page.getByRole('button', { name: 'Sessions', exact: true }).click();
    await page.getByLabel('Import session JSON file').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(
      page.getByText(/Imported locally with a new session ID/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByLabel('TTS voice identifier (placeholder)')
      .fill('local-placeholder');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(
      page.getByText('Settings saved locally.', { exact: true }),
    ).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      offline: true,
    });
    context.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(entry);
    await expect(page.getByText('2 saved sessions')).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByLabel('TTS voice identifier (placeholder)'),
    ).toHaveValue('local-placeholder');
    await page.getByRole('button', { name: 'Sessions', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open Offline session', exact: true })
      .first()
      .click();
    await expect(page.getByLabel('Description')).toHaveValue(
      'Survives a complete browser restart.',
    );
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('capability page opens offline and verifies marker persistence, JSON and local image selection', async ({
  page,
  context,
}) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('dist/capabilities.html')).href);
  await page.getByRole('button', { name: 'Write test marker' }).click();
  await expect(page.locator('#storage')).toContainText(
    'Persistent test marker:',
  );
  const marker = await page.locator('#storage').textContent();
  await page.reload();
  await expect(page.locator('#storage')).toHaveText(marker!);
  await page.getByLabel('Select JSON').setInputFiles({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"probe":true}'),
  });
  await expect(page.locator('#json-result')).toContainText('parsed locally');
  await page
    .getByLabel('Select image')
    .setInputFiles(resolve('src-tauri/icons/icon.png'));
  await expect(page.locator('#image-result')).toContainText(
    'decoded successfully',
  );
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download test JSON' }).click();
  expect((await downloadPending).suggestedFilename()).toBe(
    'jade-capability-test.json',
  );
});

test('capability page selects and plays local audio/video and enters fullscreen', async ({
  page,
  context,
}) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('dist/capabilities.html')).href);
  // Synthetic fixtures exist only in this browser test, never in application sessions.
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(16000, 40);
  for (let i = 0; i < 8000; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i * Math.PI * 2 * 440) / 8000) * 500),
      44 + i * 2,
    );
  await page.getByRole('button', { name: 'Write test marker' }).click();
  await page
    .getByLabel('Select audio')
    .setInputFiles({ name: 'probe.wav', mimeType: 'audio/wav', buffer: wav });
  await page
    .locator('#audio-preview')
    .evaluate((el: HTMLAudioElement) => el.play());
  await expect(page.locator('#audio-result')).toContainText('playback started');
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const paint = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
    });
    const chunks: Blob[] = [];
    const result = new Promise<number[]>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
        );
      };
    });
    recorder.start();
    const timer = setInterval(() => {
      paint.fillStyle = '#b5e5cf';
      paint.fillRect(0, 0, 64, 64);
    }, 30);
    setTimeout(() => {
      clearInterval(timer);
      recorder.stop();
    }, 400);
    return result;
  });
  await page.getByLabel('Select video').setInputFiles({
    name: 'probe.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(video),
  });
  await page
    .locator('#video-preview')
    .evaluate((el: HTMLVideoElement) => el.play());
  await expect(page.locator('#video-result')).toContainText('playback started');
  await page.getByRole('button', { name: 'Test fullscreen' }).click();
  await expect(page.locator('#fullscreen-result')).toContainText(
    'Fullscreen entered',
  );
});
