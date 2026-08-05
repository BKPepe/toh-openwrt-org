#!/usr/bin/env node
/*
 * Prints the Lucide SVG sprite that is inlined at the top of <body> in
 * index.html. It is inline so that the icons need no request of their own;
 * the boot overlay uses one.
 *
 * Usage:
 *     node tools/gen-icon-sprite.mjs <path-to-lucide-static/icons>
 *
 * The icons come from the lucide-static npm package. The sprite goes to
 * stdout: replace the <svg class="toh-icon-sprite"> element in index.html
 * with it, then run node tools/check-icons.mjs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every icon the app renders. Keep alphabetical, and in step with the icons
// index.html and static/js/toh_*.js refer to (tools/check-icons.mjs).
const ICONS = [
	'arrow-down-wide-narrow',
	'book-open',
	'camera',
	'check',
	'chevron-down',
	'chevron-left',
	'chevron-right',
	'circle-check',
	'circle-help',
	'circle-x',
	'clock',
	'cloud-download',
	'code',
	'columns-3',
	'cpu',
	'database',
	'download',
	'ellipsis',
	'external-link',
	'factory',
	'file-down',
	'filter',
	'git-branch',
	'git-commit-horizontal',
	'hard-drive',
	'heart',
	'image',
	'info',
	'landmark',
	'layers',
	'lightbulb',
	'list',
	'loader-circle',
	'memory-stick',
	'moon',
	'network',
	'panel-left-close',
	'panel-left-open',
	'pencil',
	'rotate-ccw',
	'router',
	'search',
	'shield',
	'sliders-horizontal',
	'square',
	'square-check',
	'square-minus',
	'star',
	'sun',
	'table-columns-split',
	'tag',
	'triangle-alert',
	'usb',
	'user',
	'wifi',
	'x',
	'zap',
];

const iconsDir = process.argv[2];
if (!iconsDir) {
	console.error('usage: node tools/gen-icon-sprite.mjs <path-to-lucide-static/icons>');
	process.exit(1);
}

const symbols = ICONS.map((name) => {
	const svg = readFileSync(join(iconsDir, `${name}.svg`), 'utf8');
	const body = svg
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join('');
	return `\t\t<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`;
}).join('\n');

process.stdout.write(
	`<svg xmlns="http://www.w3.org/2000/svg" class="toh-icon-sprite" aria-hidden="true" focusable="false">\n` +
	`\t<defs>\n${symbols}\n\t</defs>\n` +
	`</svg>\n`
);
