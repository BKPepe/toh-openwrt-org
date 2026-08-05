#!/usr/bin/env node
/*
 * Flags HTML built by string concatenation where an interpolated value reaches
 * an attribute without going through tohAttr(), or an href without going
 * through tohSafeUrl().
 *
 * Why a scanner and not a safe-by-construction wrapper:
 *
 * The obvious fix for "escaping is remembered, not enforced" is a tagged
 * template that escapes every interpolation and a marker type for the few
 * values that really are markup. That cannot be used here. Tabulator renders a
 * formatter's return value through a typeof switch
 * (static/lib/tabulator-6.3.0/js/tabulator.min.js, Cell._generateContents):
 * a string goes to innerHTML, a Node is appended, and any OTHER object blanks
 * the cell and logs a warning. A marker object returned from a formatter would
 * therefore empty the cpu, ethernet, Wi-Fi, support and link columns and every
 * icon column header. jQuery is no better - $(el).html(markerObject) renders
 * nothing, because buildFragment treats a bare object as array-like.
 *
 * So the three contexts stay separated by function instead of by type:
 *
 *     text in an element      tohAttr(value)
 *     attribute value         tohAttr(value)
 *     href / src              tohSafeUrl(value), then tohAttr()
 *     deliberate markup       returned as a string, escaped at its own source
 *
 * ... and this file is what stops the next one from being forgotten. It is a
 * lint, not a proof: it reads source text, so a value laundered through a
 * variable several lines earlier will pass. It catches the shape that has
 * actually gone wrong in this codebase every time.
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
const INTERNAL = /^(i|j|n|idx|index|key|field|type|other|cls|myclass|sel|id_|go\.|f\.|n\.|section\.|col\.|kind\.|toh_)/;

const findings = [];

for (const file of FILES) {
	const src = readFileSync(join(DIR, file), 'utf8');
	const lines = src.split('\n');

	lines.forEach((line, i) => {
		// a line that is entirely a comment cannot emit anything
		if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
			return;
		}
		// Only lines that actually emit markup. Without this the same pattern
		// matches a jQuery attribute selector, a query string being assembled
		// and a Set-Cookie being built - none of which is HTML, and all of which
		// would make this too noisy to be worth running.
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
	console.log(basename(DIR) + '/toh_*.js: ' + FILES.length + ' files, every attribute interpolation is escaped');
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
