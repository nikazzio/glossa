import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , bundleDirArg, outputFileArg] = process.argv;

if (!bundleDirArg || !outputFileArg) {
  console.error('Usage: node scripts/generate-release-checksums.mjs <bundle-dir> <output-file>');
  process.exit(1);
}

const bundleDir = path.resolve(bundleDirArg);
const outputFile = path.resolve(outputFileArg);
const releasableSuffixes = [
  '.AppImage',
  '.deb',
  '.dmg',
  '.exe',
  '.msi',
  '.rpm',
  '.sig',
  '.tar.gz',
  '.zip',
];

function isReleasable(filePath) {
  return releasableSuffixes.some((suffix) => filePath.endsWith(suffix));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }

    if (entry.isFile() && isReleasable(fullPath)) {
      return [fullPath];
    }

    return [];
  }));

  return files.flat();
}

async function hashFile(filePath) {
  await stat(filePath);

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const files = (await walk(bundleDir)).sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  console.error(`No releasable assets found under ${bundleDir}`);
  process.exit(1);
}

const lines = await Promise.all(files.map(async (filePath) => {
  const digest = await hashFile(filePath);
  const relativePath = path.relative(bundleDir, filePath).split(path.sep).join('/');
  return `${digest}  ${relativePath}`;
}));

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${lines.join('\n')}\n`, 'utf8');

console.log(`Wrote ${files.length} checksums to ${outputFile}`);
