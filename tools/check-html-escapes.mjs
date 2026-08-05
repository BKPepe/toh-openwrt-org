#!/usr/bin/env node
/*
 * Flags HTML built by string concatenation in static/js/toh_*.js where an
 * interpolated value reaches an attribute without going through tohAttr(), or
 * an href or src without going through tohSafeUrl().
 *
 * It is a lint over source text, one line at a time. It checks attribute
 * context only, not text between tags ('>' + v + '<'), and a value that
 * reaches the attribute through a variable can get past it. The injection
 * sweep in tools/regress.mjs checks the rendered result.
 *
 * Usage:
 *     node tools/check-html-escapes.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'static', 'js');

// Our own scripts only - the vendored libraries are not ours to lint.
const FILES = readdirSync(DIR).filter(f => /^toh_.*\.js$/.test(f));

// attr=" or attr=' followed by + <something>, i.e. a value spliced into an
// attribute. The capture is whatever was spliced in.
const ATTR = /\b([a-zA-Z-]+)\s*=\s*(?:\\?["'])\s*(?:\\?['"])?\s*\+\s*([A-Za-z_$][\w$.()\[\] ]*)/g;

// A value is safe if the expression that produced it names one of these.
const SAFE = /\btoh(Attr|SafeUrl|Icon|ArrayText)\s*\(/;

// Interpolations that are ours, not the dataset's: loop counters, literals from
// toh_conf.js, and the handful of internal keys the UI builds selectors from.
const INTERNAL = /^(?:(?:i|j|n|idx|index|key|field|type|other|cls|myclass|sel)$|id_|go\.|f\.|n\.|section\.|col\.|kind\.|toh_)/;

const findings = [];

for (const file of FILES) {
	const src = readFileSync(join(DIR, file), 'utf8');
	const lines = src.split('\n');

	lines.forEach((line, i) => {
		// a line that is entirely a comment cannot emit anything
		if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
			return;
		}
		// Only lines that emit markup: the same pattern also matches a jQuery
		// attribute selector and a query string being assembled.
		if (!/<\s*[a-zA-Z\/]/.test(line)) {
			return;
		}
		if (/\$\s*\(/.test(line) && !/\+=|return\s+['"]/.test(line)) {
			return;					// a selector, not a template
		}
		let m;
		ATTR.lastIndex = 0;
		while ((m = ATTR.exec(line)) !== null) {
			const [, attr, expr] = m;
			const value = expr.trim();
			if (SAFE.test(value) || INTERNAL.test(value)) {
				continue;
			}
			// a quoted literal spliced in is not a value at all
			if (/^['"]/.test(value)) {
				continue;
			}
			findings.push({
				file,
				line: i + 1,
				attr,
				value,
				want: /^(href|src|action|formaction)$/i.test(attr) ? 'tohSafeUrl() then tohAttr()' : 'tohAttr()',
				text: line.trim().slice(0, 120),
			});
		}
	});
}

if (findings.length === 0) {
	console.log(basename(DIR) + '/toh_*.js: ' + FILES.length + ' files, no unescaped attribute interpolation found');
	process.exit(0);
}

console.error('Unescaped values spliced into HTML attributes:\n');
for (const f of findings) {
	console.error('  static/js/' + f.file + ':' + f.line);
	console.error('    ' + f.attr + '= takes ' + f.value + ' - wrap it in ' + f.want);
	console.error('    ' + f.text);
	console.error('');
}
console.error(findings.length + ' to fix. If one of these is provably safe, say why in a');
console.error('comment and add its shape to INTERNAL in this file.');
process.exit(1);
