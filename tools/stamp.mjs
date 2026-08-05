// Stamps every local asset URL in index.html with a hash of the file's
// contents ("?v=<8 hex digits>"): an unchanged file keeps its URL, and a
// changed one gets a new URL, so it cannot be served stale from a cache.
//
//	Run it after changing a file under static/:  node tools/stamp.mjs
//	Check it in CI:  node tools/stamp.mjs && git diff --exit-code index.html
//
//	Running it twice in a row changes nothing.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(ROOT, 'index.html');

// src="static/…" or href="static/…", with or without a stamp already on it
const ASSET = /((?:src|href)=")(static\/[^"?]+)(\?v=[0-9a-f]{8})?"/g;

let html = readFileSync(PAGE, 'utf8');
let stamped = 0;
const missing = [];

html = html.replace(ASSET, (whole, attr, path, old) => {
	const file = join(ROOT, path);
	if (!existsSync(file)) {
		missing.push(path);
		return whole;
	}
	const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8);
	stamped++;
	return `${attr}${path}?v=${hash}"`;
});

if (missing.length) {
	console.error('index.html references files that do not exist:');
	missing.forEach(p => console.error('  ' + p));
	process.exit(1);
}

const before = readFileSync(PAGE, 'utf8');
if (before === html) {
	console.log(`index.html: ${stamped} assets, all stamps current`);
} else {
	writeFileSync(PAGE, html);
	console.log(`index.html: ${stamped} assets stamped`);
}
