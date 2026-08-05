#!/usr/bin/env node
/*
 * Responsive and behavioural regression checks for the ToH page.
 *
 * Run from the repository root:
 *
 *     npm install          # once: puts playwright in node_modules (dev only,
 *                          # the page itself needs no build step)
 *     npx playwright install chromium
 *     npm test             # = node tools/regress.mjs
 *
 * The script serves the repository over a local port itself and caches the
 * device dump in tools/.cache/ on first run, so every pass sees the same data.
 * Delete the cache to test against fresh data.
 *
 * Page URLs carry ?cache=<run id> to keep a browser cache out of the way.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, 'tools', '.cache');

// --- the device data, cached ------------------------------------------------
async function cached(name, url) {
	const path = join(CACHE_DIR, name);
	if (!existsSync(path)) {
		mkdirSync(CACHE_DIR, { recursive: true });
		console.log('fetching', url);
		const res = await fetch(url);
		if (!res.ok) throw new Error(url + ' -> ' + res.status);
		writeFileSync(path, Buffer.from(await res.arrayBuffer()));
	}
	return readFileSync(path);
}
const toh = await cached('toh.json', 'https://openwrt.org/toh.json');
const versions = await cached('versions.json', 'https://downloads.openwrt.org/.versions.json');
const stable = JSON.parse(versions).stable_version;
const overview = await cached('overview-' + stable + '.json',
	'https://downloads.openwrt.org/releases/' + stable + '/.overview.json');

// --- a static server over the repo, on an ephemeral port ---------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
	'.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.md': 'text/plain' };
const server = createServer((req, res) => {
	// decodeURIComponent throws on a malformed escape ("%zz"), and an exception
	// here would take the whole server - and the suite - down with it
	let rel;
	try { rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, ''); }
	catch { res.writeHead(400); res.end(); return; }
	const path = normalize(join(ROOT, rel || 'index.html'));
	const file = path.endsWith('/') ? join(path, 'index.html') : path;
	// ROOT plus a separator: a bare prefix test would also accept a sibling
	// directory such as "/repo/toh-secrets"
	if ((file !== ROOT && !file.startsWith(ROOT + '/') && !file.startsWith(ROOT + '\\'))
		|| !existsSync(file) || !statSync(file).isFile()) {
		res.writeHead(404); res.end(); return;
	}
	res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
	createReadStream(file).on('error', () => { res.destroy(); }).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const CACHE = 'r' + Date.now();

// --- harness -----------------------------------------------------------------
const results = [];
const check = (name, ok) => { results.push([name, !!ok]); };

const browser = await chromium.launch();
const ctx = await browser.newContext();

// Requests that leave the local server are answered from the cache or refused,
// so a run does not depend on openwrt.org. Later routes are matched first.
async function stub(page, data = toh) {
	await page.route(u => !u.href.startsWith(BASE), r => r.abort());
	await page.route('**://openwrt.org/toh.json*', r =>
		r.fulfill({ contentType: 'application/json', body: data }));
	await page.route('**://downloads.openwrt.org/.versions.json*', r =>
		r.fulfill({ contentType: 'application/json', body: versions }));
	await page.route('**://downloads.openwrt.org/releases/*/.overview.json*', r =>
		r.fulfill({ contentType: 'application/json', body: overview }));
}

async function open(w, h, qs = '', from = ctx) {
	const page = await from.newPage();
	await page.setViewportSize({ width: w, height: h });
	await stub(page);
	page.on('pageerror', e => { console.log('  [PAGEERROR]', e.message); check('no page error', false); });
	await page.goto(BASE + '/index.html?cache=' + CACHE + '&' + qs, { waitUntil: 'load' });
	await page.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
	await page.waitForTimeout(1500);
	return page;
}

const state = page => page.evaluate(() => {
	const hold = document.querySelector('.tabulator-tableholder');
	const side = document.getElementById('toh-sidebar');
	const bar = document.getElementById('toh-summary');
	return {
		view: toh_current_view,
		cards: toh_cards_on,
		cols: tabuTable.getColumns().filter(c => c.isVisible()).length,
		presetSize: (toh_colPresets[toh_current_view] || []).length,
		scrollW: hold ? hold.scrollWidth : 0,
		clientW: hold ? hold.clientWidth : 0,
		docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
		url: buildBrowserUrl(false),
		lit: [...document.querySelectorAll('#toh-cols-presets A.toh-selected')].map(a => a.dataset.key),
		sideTop: Math.round(side.getBoundingClientRect().top),
		barH: Math.round(bar.getBoundingClientRect().height),
		summaryOn: document.body.classList.contains('toh-summary-on'),
		cardCount: document.querySelectorAll('.toh-card-dev').length,
		rowH: (() => { const r = document.querySelector('#toh-table .tabulator-row');
			return r ? Math.round(r.getBoundingClientRect().height) : 0; })(),
		active: tabuTable.getRows('active').length,
		dl: (() => {
			const c = [...document.querySelectorAll('#toh-table .tabulator-cell[tabulator-field="VIRT_download"]')];
			return { total: c.length, labelled: c.filter(x => /\d+\.\d+/.test(x.textContent)).length };
		})(),
	};
});

// 1. Every width : which renderer, and does anything scroll sideways ---------
console.log('\n--- width sweep ---');
let TOTAL = 0;
const sweep = {};
for (const w of [1920, 1600, 1280, 1100, 1099, 1024, 900, 768, 767, 700, 673, 390, 360, 344, 320]) {
	const page = await open(w, 900);
	const s = await state(page);
	sweep[w] = s;
	if (!TOTAL) { TOTAL = await page.evaluate(() => tabuTable.getDataCount()); }
	const over = s.scrollW - s.clientW;
	console.log(String(w).padStart(5) + 'px  ' + String(s.view).padEnd(8)
		+ ' cards=' + String(s.cards).padEnd(6) + ' cols=' + String(s.cols).padStart(2)
		+ '  ' + String(s.scrollW).padStart(5) + '/' + String(s.clientW).padStart(5)
		+ (over > 1 ? '  SCROLLS ' + over : '  fits'));
	await page.close();
}
check('1920 fits without scrolling sideways', sweep[1920].scrollW <= sweep[1920].clientW + 1);
check('1600 fits without scrolling sideways', sweep[1600].scrollW <= sweep[1600].clientW + 1);
check('1280 fits without scrolling sideways', sweep[1280].scrollW <= sweep[1280].clientW + 1);
check('1100 fits without scrolling sideways', sweep[1100].scrollW <= sweep[1100].clientW + 1);
// 1099 and 768 are the two ends of the tablet preset, and 1024 is an iPad on
// its side: the widths where a preset that is a few pixels too wide shows
check('the tablet preset never scrolls sideways',
	[1099, 1024, 900, 768].every(w => sweep[w].scrollW <= sweep[w].clientW + 1));
// Headless Chromium hides scrollbars, and a desktop browser's takes width from
// the table: the narrow end of each table preset again, with them showing.
{
	const withBars = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
	const barCtx = await withBars.newContext();
	for (const w of [768, 1100]) {
		const page = await open(w, 900, '', barCtx);
		const s = await state(page);
		check(w + 'px fits with a scrollbar showing', s.scrollW <= s.clientW + 1);
		await page.close();
	}
	await withBars.close();
}
check('the table never grows as the window shrinks',
	[1920, 1600, 1280, 1100, 1099, 1024, 900, 768].every((w, i, a) =>
		i === 0 || sweep[a[i - 1]].clientW >= sweep[w].clientW));
check('desktop shows exactly the default preset',
	sweep[1600].view === 'normal' && sweep[1600].cols === sweep[1600].presetSize);
check('the download column names a release, not another arrow',
	sweep[1600].dl.total === 30 && sweep[1600].dl.labelled > 0);
check('narrow viewports open on the tablet preset',
	[1099, 1024, 900, 768].every(w => sweep[w].view === 'tablet' && sweep[w].cols === sweep[w].presetSize));
check('phones get cards instead', sweep[767].cards && sweep[700].cards && sweep[390].cards);
check('nothing overflows the document', Object.values(sweep).every(s => !s.docOverflow));
check('the preset button is lit', sweep[1600].lit[0] === 'normal' && sweep[900].lit[0] === 'tablet');
check('neither default names itself in the URL',
	!sweep[1600].url.includes('view=') && !sweep[900].url.includes('view='));

// 2. An explicit ?view= beats the viewport ----------------------------------
console.log('\n--- explicit view ---');
let page = await open(900, 1000, 'view=normal');
let s = await state(page);
console.log('900px + ?view=normal ->', s.view, s.cols, 'cols');
check('an explicit ?view= wins over the viewport',
	s.view === 'normal' && s.cols === sweep[1600].cols);
check('and stays in the shared URL', s.url.includes('view=normal'));
await page.close();

// 3. Resizing follows the breakpoint, until the visitor chooses -------------
console.log('\n--- resize ---');
page = await open(1600, 900);
const r1 = await state(page);
await page.setViewportSize({ width: 900, height: 900 });
await page.waitForTimeout(1400);
const r2 = await state(page);
await page.setViewportSize({ width: 1600, height: 900 });
await page.waitForTimeout(1400);
const r3 = await state(page);
await page.evaluate(() => $('#toh-cols-presets A[data-key=mini]').trigger('click'));
await page.waitForTimeout(1200);
const r4 = await state(page);
await page.setViewportSize({ width: 900, height: 900 });
await page.waitForTimeout(1400);
const r5 = await state(page);
console.log([r1, r2, r3, r4, r5].map(x => x.view).join(' -> '));
check('resizing narrow switches renderer without a reload', r2.view === 'tablet');
check('resizing back restores the desktop preset', r3.view === 'normal');
check('a hand-picked view survives a resize', r4.view === 'mini' && r5.view === 'mini');
await page.close();

// 4. The sticky summary row -------------------------------------------------
console.log('\n--- summary row ---');
page = await open(1500, 900);
const s1 = await state(page);
await page.evaluate(() => { document.body.scrollTop = 900; });
await page.waitForTimeout(700);
const s2 = await state(page);
await page.evaluate(() => { document.body.scrollTop = 0; });
await page.waitForTimeout(400);
await page.click('#toh-search-input-model');
await page.type('#toh-search-input-model', 'Archer', { delay: 25 });
await page.waitForTimeout(1500);
await page.evaluate(() => $('.toh-filters-list INPUT[data-key]').first().trigger('click'));
await page.waitForTimeout(1500);
await page.evaluate(() => { document.body.scrollTop = 900; });
await page.waitForTimeout(700);
const sum = await page.evaluate(() => ({
	chips: [...document.querySelectorAll('#toh-summary-chips .toh-summary-chip')]
		.map(c => c.textContent.replace(/\s+/g, ' ').trim()),
	count: document.getElementById('toh-summary-count').textContent.trim(),
	rows: tabuTable.getRows('active').length,
}));
console.log('chips:', JSON.stringify(sum.chips), '| count:', sum.count);
check('the bar is hidden at the top of the page', !s1.summaryOn && s1.barH === 0);
check('it appears once the hero has gone', s2.summaryOn && s2.barH === 44);
check('the sidebar sticks below it', s2.sideTop === 60 + 44);
check('it names the search and the filters', sum.chips.length === 2 && sum.chips[0].includes('Archer'));
check('it counts what is left', /of/.test(sum.count) && sum.rows < TOTAL);
const before = sum.rows;
await page.evaluate(() => $('#toh-summary-chips .toh-summary-chip-drop[data-field=model]').trigger('click'));
await page.waitForTimeout(1400);
const dropped = await page.evaluate(() => tabuTable.getRows('active').length);
check('dropping a chip drops only that term', dropped > before);
await page.evaluate(() => $('#toh-summary-clear').trigger('click'));
await page.waitForTimeout(1400);
const cleared = await page.evaluate(() => ({
	rows: tabuTable.getRows('active').length,
	chips: document.querySelectorAll('#toh-summary-chips .toh-summary-chip').length,
}));
check('Clear empties the bar and the filters', cleared.rows === TOTAL && cleared.chips === 0);
await page.close();

// 5. Row density ------------------------------------------------------------
console.log('\n--- density ---');
page = await open(1500, 900);
const d1 = await state(page);
await page.evaluate(() => $('.toh-density-but[data-density=compact]').trigger('click'));
await page.waitForTimeout(1200);
const d2 = await state(page);
const page2 = await open(1500, 900);			// same context: the cookie applies
const d3 = await state(page2);
console.log('rows:', d1.rowH, '->', d2.rowH, '-> reload', d3.rowH);
check('comfortable is the height the table always had', d1.rowH === 34);
check('compact shortens the rows without a reload', d2.rowH === 28);
check('the choice survives a reload', d3.rowH === 28);
await page2.evaluate(() => $('.toh-density-but[data-density=comfortable]').trigger('click'));
await page2.waitForTimeout(1000);
check('switching back restores it', (await state(page2)).rowH === 34);
await page.close(); await page2.close();

// 6. The phone card renderer ------------------------------------------------
console.log('\n--- cards ---');
page = await open(390, 844);
const c1 = await state(page);
const card = await page.evaluate(() => {
	const c = document.querySelector('.toh-card-dev');
	return {
		brand: c.querySelector('.toh-card-brand').textContent,
		model: c.querySelector('.toh-card-model').textContent,
		stateText: c.querySelector('.toh-card-state').textContent.trim(),
		specs: c.querySelectorAll('.toh-card-spec').length,
		y: Math.round(c.getBoundingClientRect().top + document.body.scrollTop),
		pager: document.getElementById('toh-cards-page').textContent,
	};
});
console.log('first card:', card.brand, '/', card.model, '/', card.stateText, '| y =', card.y);
check('the phone draws 30 cards, no table', c1.cards && c1.cardCount === 30);
check('a card says brand, model, support state and specs',
	!!card.brand && !!card.model && card.stateText.length > 0 && card.specs >= 2);
check('the pager reports page and total',
	new RegExp('Page 1 of \\d+ · ' + TOTAL.toLocaleString('en-US') + ' devices').test(card.pager));
check('the first device is on the opening screen', card.y < 844);

await page.click('#toh-cards-next');
await page.waitForTimeout(1200);
check('Next pages through Tabulator', (await page.evaluate(() => tabuTable.getPage())) === 2);

await page.evaluate(() => $('.toh-card-dev').first().find('.toh-card-fav').trigger('click'));
await page.evaluate(() => {
	const id = $('.toh-card-dev').first().attr('data-id');
	tohCompareToggle(id, !tohCompareHas(id));
});
await page.waitForTimeout(900);
const shared = await page.evaluate(() => ({
	favs: toh_favorites.length, cmps: toh_compare.length,
	tray: !document.getElementById('toh-compare-tray').classList.contains('toh-hidden'),
}));
check('favouriting from a card reaches the shared state', shared.favs === 1);
check('comparing from a card reaches the shared state', shared.cmps === 1);
check('the compare tray opens from a card', shared.tray);

await page.evaluate(() => $('.toh-card-dev').first().find('.toh-card-details').trigger('click'));
await page.waitForTimeout(900);
const sheet = await page.evaluate(() => {
	const b = document.getElementById('toh-sheet-body');
	return {
		open: !document.getElementById('toh-sheet').classList.contains('toh-hidden'),
		title: !!b.querySelector('.toth-details-title'),
		groups: b.querySelectorAll('.toh-details-group').length,
		chars: b.textContent.trim().length,
	};
});
console.log('sheet:', JSON.stringify(sheet));
check('Details opens the sheet with the real details',
	sheet.open && sheet.title && sheet.groups >= 3 && sheet.chars > 400);
await page.evaluate(() => tohSheetClose());
await page.waitForTimeout(500);
check('closing the sheet leaves the cards up',
	(await page.evaluate(() => !document.getElementById('toh-sheet').classList.contains('toh-hidden'))) === false);

// 6b. Phone chrome ------------------------------------------------------------
const chrome = await page.evaluate(() => {
	document.body.classList.add('toh-sidebar-open');
	const side = document.getElementById('toh-sidebar').getBoundingClientRect();
	const info = document.getElementById('toh-info').getBoundingClientRect();
	document.body.classList.remove('toh-sidebar-open');
	return { drawer: Math.round(side.width), info: Math.round(info.width), vw: window.innerWidth };
});
console.log('phone chrome:', JSON.stringify(chrome));
check('the filter drawer covers the phone screen', chrome.drawer === chrome.vw);
check('the info section uses the full width', chrome.info === chrome.vw);
await page.close();

// a touch device gets tap-sized rows; a mouse keeps the tuned density
const touchCtx = await browser.newContext({ hasTouch: true, isMobile: true,
	viewport: { width: 390, height: 844 } });
const tp = await touchCtx.newPage();
await stub(tp);
await tp.goto(BASE + '/index.html?cache=' + CACHE + '&touch=1', { waitUntil: 'load' });
await tp.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
await tp.waitForTimeout(1500);
const tapH = await tp.evaluate(() => {
	const a = document.querySelector('.toh-filter-feature .toh-filter-title A');
	return a ? Math.round(a.getBoundingClientRect().height) : 0;
});
console.log('filter row on a touch device:', tapH + 'px');
check('touch devices get tap-sized filter rows', tapH >= 40);

// Phones apply :hover on tap and keep it until the next tap elsewhere, so a
// hover look must not show on a touch screen at all
const bgOf = (pg, sel) => pg.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
const restBg = await bgOf(tp, '#toh-cards-next');
await tp.hover('#toh-cards-next');
await tp.waitForTimeout(400);
check('a touch screen gets no hover look',
	(await bgOf(tp, '#toh-cards-next')) === restBg
	&& await tp.evaluate(() => !matchMedia('(hover: hover)').matches));
await tp.close(); await touchCtx.close();
{
	const mp = await open(1440, 900);
	const before = await bgOf(mp, '.toh-export-but-toggle');
	await mp.hover('.toh-export-but-toggle');
	await mp.waitForTimeout(400);
	check('a mouse still gets hover feedback', (await bgOf(mp, '.toh-export-but-toggle')) !== before);
	// the focus ring on the navy app bar is the logo's cyan, not --primary
	await mp.keyboard.press('Tab');
	await mp.focus('#toh-theme-toggle');
	const ring = await mp.evaluate(() => {
		const el = document.getElementById('toh-theme-toggle');
		return el.matches(':focus-visible') ? getComputedStyle(el).outlineColor : '';
	});
	check('the app bar focus ring shows on the navy bar', ring === 'rgb(0, 181, 226)');
	await mp.close();
}

// 7. The device search matches what the Device column shows ------------------
console.log('\n--- device search & flash filter ---');
page = await open(1500, 900);
const search = async (q) => {
	await page.evaluate(() => $('#toh-search-input-model').val('').trigger('keyup'));
	await page.waitForTimeout(600);
	await page.click('#toh-search-input-model');
	await page.type('#toh-search-input-model', q, { delay: 15 });
	await page.waitForTimeout(1200);
	return page.evaluate(() => ({
		n: tabuTable.getRows('active').length,
		models: tabuTable.getData('active').slice(0, 10).map(r => r.brand + ' / ' + r.model),
	}));
};
const t = await search('Turris');
console.log('"Turris" ->', t.n);
check('a brand-only search finds the whole family', t.n >= 8 && t.models.some(m => /omnia/i.test(m)));
const o = await search('turris omnia');
check('brand + model words narrow it down', o.n >= 1 && o.models.every(m => /omnia/i.test(m)));
check('a model-only search still works', (await search('Archer C7')).n >= 1);
check('there is exactly one search box', 1 === await page.evaluate(() => $('.toh-search-input').length));

await page.evaluate(() => $('#toh-search-input-model').val('').trigger('keyup'));
await page.waitForTimeout(600);
const flash = (v) => page.evaluate(async (val) => {
	tabuTable.setHeaderFilterValue('flashmb', /^\d+$/.test(val) ? { minimum: val, search: '' } : { minimum: '', search: val });
	await new Promise(r => setTimeout(r, 600));
	const n = tabuTable.getRows('active').length;
	tabuTable.setHeaderFilterValue('flashmb', null);
	return n;
}, v);
check('a number in the flash filter means minimum MB', (await flash('512')) < TOTAL);
check('text in the flash filter searches', (await flash('NAND')) < TOTAL);
check('the flash filter is one readable input', 1 === await page.evaluate(() =>
	document.querySelectorAll('.tabulator-col[tabulator-field="flashmb"] .tabulator-header-filter input').length));
// a bare flash size gets its MB unit, and the extra chip (eMMC/NAND) is kept
const flashCell = await page.evaluate(() => {
	const d = tabuTable.getData().find(r => Array.isArray(r.flashmb)
		&& r.flashmb.length === 2 && /^\d+$/.test(String(r.flashmb[0])) && /eMMC/i.test(String(r.flashmb[1])));
	const col = tabuTable.getColumn('flashmb');
	return FormatterArray({ getValue: () => d.flashmb }, col.getDefinition().formatterParams);
});
console.log('flash "8/eMMC" renders as:', flashCell);
check('a bare flash size shows its unit', /\d+ MB \+ eMMC/i.test(flashCell));
// the phone card and the details chip share the rule with the cell
const flashTexts = await page.evaluate(() => {
	const d = tabuTable.getData().find(r => Array.isArray(r.flashmb)
		&& r.flashmb.length === 2 && /^\d+$/.test(String(r.flashmb[0])) && /eMMC/i.test(String(r.flashmb[1])));
	const card = document.createElement('div');
	card.innerHTML = tohCardHtml({ getData: () => d });
	const details = document.createElement('div');
	details.innerHTML = tohDeviceDetailsHtml({ getData: () => d });
	const chip = [...details.querySelectorAll('.toh-details-chip')]
		.map(c => c.textContent).find(t => /Flash/.test(t)) || '';
	return { card: card.textContent, chip };
});
check('the phone card says "8 MB + eMMC", not "8, eMMC MB"',
	/\d+ MB \+ eMMC/i.test(flashTexts.card) && !/eMMC MB/i.test(flashTexts.card));
check('the details flash chip agrees', /\d+ MB \+ eMMC/i.test(flashTexts.chip));

// The static server itself: a malformed escape must not kill it, and a path
// that resolves outside ROOT must not be served. The traversal is sent as
// %2e%2e because fetch collapses a literal "../" before the request is made.
const srvBad = await fetch(BASE + '/%zz').then(r => r.status).catch(() => 'dead');
const srvUp = await fetch(BASE + '/%2e%2e/' + ROOT.split('/').pop() + '-x/etc').then(r => r.status).catch(() => 'dead');
const srvOut = await fetch(BASE + '/%2e%2e/%2e%2e/%2e%2e/etc/hosts').then(r => r.status).catch(() => 'dead');
const srvOk = await fetch(BASE + '/index.html').then(r => r.status).catch(() => 'dead');
check('a malformed escape gets 400, not a dead server', srvBad === 400 && srvOk === 200);
check('an encoded traversal into a sibling directory is refused', srvUp === 404);
check('an encoded traversal out of the repo is refused', srvOut === 404);

// 8. The details download block ----------------------------------------------
console.log('\n--- details downloads ---');
const ids = await page.evaluate(() => {
	const rows = tabuTable.getData();
	return {
		cur: rows.find(r => /^\d/.test(String(r.supportedcurrentrel)) && r.firmwareopenwrtinstallurl && r.target)?.deviceid,
		old: rows.find(r => String(r.supportedcurrentrel).toLowerCase() === 'eol' && r.firmwareopenwrtinstallurl)?.deviceid,
		none: rows.find(r => !r.firmwareopenwrtinstallurl && !r.firmwareopenwrtupgradeurl)?.deviceid,
	};
});
const dlrow = (id) => page.evaluate((i) => {
	const d = tabuTable.getData().find(r => r.deviceid === i);
	const el = document.createElement('div'); el.innerHTML = tohDeviceDownloadsHtml(d);
	return {
		main: el.querySelector('.toh-dlrow-main')?.textContent.trim() || null,
		olders: [...el.querySelectorAll('.toh-dlrow-old')].map(a => a.textContent.trim().replace(/\s+/g, ' ')),
		empty: el.innerHTML === '',
	};
}, id);
const da = await dlrow(ids.cur), db = await dlrow(ids.old), dc = await dlrow(ids.none);
console.log('current:', JSON.stringify(da.main), '| eol olders:', db.olders.length, '| none empty:', dc.empty);
check('a supported device leads with the current build', da.main !== null && /\d+\.\d+/.test(da.main));
check('its recorded images sit under it, release named', da.olders.length > 0 && /\d+\.\d+/.test(da.olders[0]));
check('an EOL device gets no primary, only the recorded image', db.main === null && db.olders.length > 0);
check('a device with nothing gets no block at all', dc.empty);
await page.close();

// 8b. Compare : each column is a card that opens the device's full details ---
console.log('\n--- compare cards ---');
page = await open(1500, 950);
const cmp = await page.evaluate(async () => {
	const ids = tabuTable.getData().slice(0, 3).map(d => d.deviceid);
	ids.forEach(id => tohCompareToggle(id, true));
	tohOpenCompare();
	await new Promise(r => setTimeout(r, 400));
	const cards = [...document.querySelectorAll('#toh-compare-body .toh-compare-card')];
	const linkTitles = [...document.querySelectorAll('#toh-compare-body .toh-compare-devlink')].map(a => a.title);
	// click the first card's name -> the details sheet opens over the comparison
	cards[0].click();
	await new Promise(r => setTimeout(r, 400));
	const sheet = document.getElementById('toh-sheet');
	const open = !sheet.classList.contains('toh-hidden');
	const groups = sheet.querySelectorAll('.toh-details-group').length;
	tohSheetClose();
	await new Promise(r => setTimeout(r, 200));
	const backToCompare = !document.getElementById('toh-compare-panel').classList.contains('toh-hidden');
	return { cards: cards.length, badges: document.querySelectorAll('#toh-compare-body .toh-compare-badge .toh-badge').length,
		linkTitles, open, groups, backToCompare };
});
console.log('cards:', cmp.cards, '| link kinds:', JSON.stringify([...new Set(cmp.linkTitles)]), '| sheet groups:', cmp.groups);
check('the comparison shows a card per device', cmp.cards === 3);
check('each card carries a support badge', cmp.badges === 3);
check('cards link out to the forum / wiki', cmp.linkTitles.some(t => /forum/i.test(t)));
check('clicking a card opens the full details over the comparison', cmp.open && cmp.groups >= 3);
check('closing the details returns to the comparison', cmp.backToCompare);
await page.close();

// 8c. The details view explains the release warning triangle -----------------
console.log('\n--- partial support notice ---');
page = await open(1500, 900);
const notices = await page.evaluate(() => {
	const rows = tabuTable.getData();
	const partial = rows.find(r => /^\d/.test(String(r.supportedcurrentrel))
		&& r.unsupported_functions && String(r.unsupported_functions).trim()
		&& !/never supported/i.test(String(r.unsupported_functions)));
	const never = rows.find(r => /never supported/i.test(String(r.unsupported_functions)));
	const clean = rows.find(r => /^\d/.test(String(r.supportedcurrentrel))
		&& (!r.unsupported_functions || String(r.unsupported_functions).trim() === '-'
			|| String(r.unsupported_functions).trim() === ''));
	const text = (id) => {
		const el = document.createElement('div');
		el.innerHTML = tohDeviceDetailsHtml({ getData: () => rows.find(r => r.deviceid === id) });
		return [...el.querySelectorAll('.toh-notice')].map(n => n.textContent.replace(/\s+/g, ' ').trim());
	};
	return { partial: text(partial.deviceid), never: text(never.deviceid), clean: text(clean.deviceid) };
});
console.log('partial:', JSON.stringify(notices.partial));
check('a partly-supported device explains what does not work',
	notices.partial.some(n => /Partly supported/.test(n) && /Does not work/.test(n)));
check('a never-supported device says so, not "unknown"',
	notices.never.some(n => /Not supported/.test(n)) && !notices.never.some(n => /unknown/i.test(n)));
check('a fully supported device gets no warning notice',
	!notices.clean.some(n => /Partly supported|Not supported|No longer/.test(n)));

const extras = await page.evaluate(() => {
	const withCommit = tabuTable.getData().find(r => r.supportedsincecommit && r.deviceid);
	const el = document.createElement('div');
	el.innerHTML = tohDeviceDetailsHtml({ getData: () => withCommit });
	return {
		rowsHasCommit: toh_compare_rows.some(s => s.fields.includes('supportedsincecommit')),
		rowsNoDupRelease: !toh_compare_rows.some(s => s.fields.includes('supportedcurrentrel')),
		editLink: !!el.querySelector('a.toh-details-edit'),
		editIsExternal: el.querySelector('a.toh-details-edit')?.getAttribute('target') === '_blank',
	};
});
check('the comparison drops the duplicate release and adds the commit',
	extras.rowsHasCommit && extras.rowsNoDupRelease);
check('a device page offers a wiki edit link', extras.editLink && extras.editIsExternal);
await page.close();

// 9. Device data is HTML-escaped before it reaches the DOM -------------------
// toh.json is community-edited wiki data; a field carrying markup must not
// become live HTML. Payload probes both the angle brackets and the single
// quote (attributes in this code are written with either kind).
console.log('\n--- escaping ---');
page = await open(1500, 900);
const esc = await page.evaluate(() => {
	const evil = "x'\"><img src=x onerror=alert(1)>";
	const row = { getValue: () => evil, getRow: () => ({ getData: () => ({
		brand: evil, model: evil, deviceid: evil, cpu: evil }) }) };
	return {
		attr: tohAttr(evil),
		device: FormatterDevice(row),
		cell: tohCompareCell('brand', { brand: evil, model: evil }),
	};
});
// the injected "<img" must never survive as a real tag: escaped output carries
// "&lt;img", so the raw "<img" substring is the thing that would be a live tag
const noRawImg = s => !/<img/i.test(s);
check('tohAttr escapes the single quote', esc.attr.includes('&#39;') && !esc.attr.includes("'"));
check('tohAttr escapes angle brackets', !/<|>/.test(esc.attr));
check('the Device formatter escapes the payload', noRawImg(esc.device));
check('the compare cell escapes the payload', noRawImg(esc.cell));
await page.close();

// Foldables: the cover screen, and unfolding back into the table -------------
// Nothing may be clipped off the right edge, and the table has to re-render
// when the viewport grows past the card breakpoint.
console.log('\n--- foldables ---');
{
	const page = await open(344, 882);
	const fold = await page.evaluate(() => {
		const next = document.getElementById('toh-cards-next');
		const off = [...document.querySelectorAll('button, a, input')]
			.filter(e => { const r = e.getBoundingClientRect();
				return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 0.5; })
			.map(e => e.id || e.className);
		return {
			nextRight: next ? Math.round(next.getBoundingClientRect().right) : null,
			inner: window.innerWidth,
			docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
			offscreen: off,
		};
	});
	console.log('  344px: doc overflow ' + fold.docOverflow
		+ ' | Next right ' + fold.nextRight + '/' + fold.inner
		+ (fold.offscreen.length ? ' | offscreen: ' + fold.offscreen.join(', ') : ''));
	check('nothing overflows the cover screen', !fold.docOverflow);
	check('the card pager stays on the cover screen', fold.nextRight !== null && fold.nextRight <= fold.inner);
	check('no control is pushed off the cover screen', fold.offscreen.length === 0);

	// Tabulator builds inside a display:none container here and holds no row
	// elements, so unfolding has to redraw.
	const folded = await page.evaluate(() => document.querySelectorAll('#toh-table .tabulator-row').length);
	await page.setViewportSize({ width: 841, height: 673 });
	await page.waitForTimeout(1200);
	const unfolded = await page.evaluate(() => document.querySelectorAll('#toh-table .tabulator-row').length);
	console.log('  unfold 344->841: rows ' + folded + ' -> ' + unfolded);
	check('unfolding the device renders the table', unfolded > 0);
	await page.close();
}

// Shareable state: every parameter survives the next filter change -----------
// buildBrowserUrl() rewrites the whole query from state, so a parameter it does
// not model is lost on the next rewrite.
console.log('\n--- shareable URLs ---');
{
	const id = JSON.parse(toh).entries[0][0];
	const page = await open(1280, 900, 'device=' + encodeURIComponent(id));
	const after = await page.evaluate(() => location.search);
	check('?device= survives the boot rewrite', after.includes('device='));
	await page.evaluate(() => buildBrowserUrl());
	const later = await page.evaluate(() => location.search);
	check('?device= survives a later URL rebuild', later.includes('device='));
	console.log('  ' + after + '  ->  ' + later);
	await page.close();
}

// Wiki data cannot reach the DOM as markup -----------------------------------
// Every cell of two rows is hostile - one as plain strings, one as the arrays
// the multi-value columns hold - and they go through every surface that draws
// a device: all columns of the table, tooltips, the details popup and sheet,
// cards, the comparison and the manufacturer page.
console.log('\n--- injection sweep ---');
{
	const data = JSON.parse(toh);
	const ci = Object.fromEntries(data.columns.map((c, i) => [c, i]));
	const pwn = f => '<img src=pwn onerror="window.__xss.push(\'' + f + '\')">';
	const isArrayCol = f => data.entries.some(e => Array.isArray(e[ci[f]]));
	const ids = [data.entries[0][ci.deviceid], data.entries[1][ci.deviceid]];
	for (const f of data.columns) {
		if (f === 'deviceid') { continue; }			// the rows still have to be addressable
		data.entries[0][ci[f]] = pwn(f);
		data.entries[1][ci[f]] = isArrayCol(f) ? [pwn(f), 'java\tscript:window.__xss.push("' + f + '-url")'] : pwn(f);
	}
	// a third row whose links are the ways of spelling a scheme a browser accepts
	const urls = ['javascript:window.__xss.push("js")', 'java\tscript:window.__xss.push("tab")',
		'java\nscript:window.__xss.push("nl")', '\u0001javascript:window.__xss.push("c0")',
		' JaVaScRiPt:window.__xss.push("case")', 'data:text/html,<script>parent.__xss.push("data")</script>',
		'vbscript:msgbox(1)'];
	data.columns.filter(f => /url|page|fccid|picture/.test(f)).forEach((f, i) => {
		const u = urls[i % urls.length];
		data.entries[2][ci[f]] = isArrayCol(f) ? [u] : u;
	});
	ids.push(data.entries[2][ci.deviceid]);
	// and a fourth whose id is the payload: it goes into data-id attributes and URLs
	const badId = 'x"><img src=pwn onerror="window.__xss.push(\'deviceid\')">';
	data.entries[3][ci.deviceid] = badId;

	const hostile = async (w, h, qs, act) => {
		const page = await ctx.newPage();
		await page.setViewportSize({ width: w, height: h });
		await page.addInitScript(() => { window.__xss = []; });
		await stub(page, JSON.stringify(data));
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(BASE + '/index.html?cache=' + CACHE + '&' + qs, { waitUntil: 'load' });
		await page.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
		await page.waitForTimeout(1200);
		if (act) { await act(page); await page.waitForTimeout(600); }
		const bad = await page.evaluate(() => ({
			fired: [...new Set(window.__xss)],
			nodes: document.querySelectorAll('img[src^="pwn"]').length,
			// the browser's own reading of each href, so no spelling gets past it
			links: [...document.querySelectorAll('a[href]')].filter(a => !/^(https?|ftps?):$/.test(a.protocol)).length,
		}));
		await page.close();
		return { ...bad, errors };
	};
	const only = ids => page => page.evaluate(ids => tabuTable.setFilter(d => ids.includes(d.deviceid)), ids);

	const runs = {
		'every column of the table': await hostile(1600, 900, 'view=all', async page => {
			await only(ids)(page);
			await page.waitForTimeout(400);
			for (const f of ['model', 'cpu', 'comments']) {
				const cell = page.locator('#toh-table .tabulator-row .tabulator-cell[tabulator-field=' + f + ']').first();
				if (await cell.count()) { await cell.hover({ force: true }); await page.waitForTimeout(700); }
			}
		}),
		'the details popup': await hostile(1440, 900, 'device=' + encodeURIComponent(ids[0])),
		'the details popup, array values': await hostile(1440, 900, 'device=' + encodeURIComponent(ids[1])),
		'the details popup, hostile links': await hostile(1440, 900, 'device=' + encodeURIComponent(ids[2])),
		'the phone sheet': await hostile(390, 844, 'device=' + encodeURIComponent(ids[1])),
		'the phone cards': await hostile(390, 844, '', only(ids)),
		'the comparison': await hostile(1440, 900, 'compare=' + encodeURIComponent(ids.join(',')), page =>
			page.evaluate(() => tohOpenCompare())),
		'the manufacturer page': await hostile(1440, 900, '', page =>
			page.evaluate(b => tohOpenFacet('brand', b, false), pwn('brand'))),
		'a hostile device id, desktop': await hostile(1440, 900, 'device=' + encodeURIComponent(badId), async page => {
			await only([badId])(page);
			await page.waitForTimeout(400);
			await page.evaluate(id => { tohFavToggle(id); tohCompareToggle(id, true); }, badId);
			await page.evaluate(() => document.querySelector('#toh-table .tabulator-row .tabulator-cell[tabulator-field="model"]')?.click());
			await page.waitForTimeout(500);
		}),
		'a hostile device id, phone': await hostile(390, 844, '', async page => {
			await only([badId])(page);
			await page.waitForTimeout(400);
			await page.evaluate(() => { document.querySelector('.toh-card-fav')?.click(); document.querySelector('.toh-card-cmp')?.click(); document.querySelector('.toh-card-details')?.click(); });
		}),
	};
	for (const [where, r] of Object.entries(runs)) {
		const clean = r.fired.length === 0 && r.nodes === 0 && r.links === 0;
		console.log('  ' + where.padEnd(34) + (clean ? 'clean' : JSON.stringify(r)));
		check('hostile wiki data does nothing in ' + where, clean);
		check('... and does not break ' + where, r.errors.length === 0);
	}

	const page = await open(1280, 900);
	const tips = await page.evaluate(() => tabuTable.getColumns().filter(c => c.getDefinition().tooltip === true).length);
	check('no column uses Tabulator\'s own tooltip, which is innerHTML', tips === 0);
	const urlsOut = await page.evaluate(list => list.map(u => tohSafeUrl(u))
		.filter(u => u !== '' && !/^(https?|ftps?):$/.test(new URL(u, 'https://openwrt.org/').protocol)), urls);
	check('tohSafeUrl agrees with the browser about every scheme', urlsOut.length === 0);
	await page.close();
}

// What is marked hidden is hidden --------------------------------------------
// .toh-hidden has to win over any component rule that sets display.
console.log('\n--- visibility ---');
{
	const shown = () => [...document.querySelectorAll('.toh-hidden')]
		.filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className);
	for (const [w, h] of [[1440, 900], [390, 844]]) {
		const page = await open(w, h);
		const leaks = await page.evaluate(shown);
		check(w + 'px: nothing marked hidden is on screen' + (leaks.length ? ' (' + leaks.join(', ') + ')' : ''), leaks.length === 0);
		if (w === 1440) {
			const hint = () => page.evaluate(() => getComputedStyle(document.getElementById('toh-upresets-hint')).display !== 'none');
			const before = await hint();
			await page.click('#toh-filters-container .toh-upresets-help');
			const opened = await hint();
			await page.keyboard.press('Escape');
			check('the preset help opens on its button and closes on Escape', !before && opened && !(await hint()));
			check('the summary offers Clear only when something is set',
				await page.evaluate(() => getComputedStyle(document.getElementById('toh-summary-clear')).display === 'none'));
		}
		await page.close();
	}

	// one panel stands in for the table at a time
	const page = await open(1440, 900);
	const panels = () => page.evaluate(() => ['compare', 'adv', 'wiz', 'facet']
		.filter(n => !document.getElementById('toh-' + n + '-panel').classList.contains('toh-hidden')));
	await page.evaluate(() => { tohOpenWizard(); tohOpenStats(false); });
	check('opening statistics closes the chooser', (await panels()).join() === 'facet');
	const tiles = await page.evaluate(() => [...document.querySelectorAll('#toh-facet-body .toh-fact')].map(t => {
		const [l, v] = [t.querySelector('.toh-fact-label'), t.querySelector('.toh-fact-value')];
		return l && v && v.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1;
	}));
	check('the statistics page leads with four tiles, label above value', tiles.length === 4 && tiles.every(Boolean));
	await page.evaluate(() => tohOpenAdvSearch());
	check('opening Advanced search closes statistics', (await panels()).join() === 'adv');

	// Advanced search : the thresholds are part of what it applies
	await page.selectOption('.toh-adv-select[data-key=ram]', '512');
	await page.waitForTimeout(300);
	const promised = await page.evaluate(() => parseInt($('#toh-adv-count').text().replace(/\D/g, ''), 10));
	await page.click('#toh-adv-apply');
	await page.waitForTimeout(900);
	const got = await page.evaluate(() => ({ n: tabuTable.getDataCount('active'), url: location.search }));
	check('Advanced search applies the RAM threshold it counted with', promised > 0 && got.n === promised && /[?&]ram=512/.test(got.url));
	await page.evaluate(() => tohOpenAdvSearch());
	await page.selectOption('.toh-adv-select[data-key=ram]', '');
	await page.click('#toh-adv-close');
	await page.waitForTimeout(600);
	check('... and Cancel leaves it as it was', await page.evaluate(n => tabuTable.getDataCount('active') === n, got.n));
	await page.close();

	// panel heads on the narrowest screen
	const phone = await open(344, 882);
	await phone.evaluate(() => { tabuTable.getData().slice(40, 43).forEach(d => tohCompareToggle(d.deviceid, true)); tohOpenCompare(); });
	await phone.waitForTimeout(500);
	const head = await phone.evaluate(() => {
		const h = document.getElementById('toh-compare-head').getBoundingClientRect();
		const inside = [...document.querySelectorAll('#toh-compare-head label, #toh-compare-head a')]
			.every(e => e.getBoundingClientRect().right <= h.right + 1);
		return { inside, titleW: Math.round(document.querySelector('#toh-compare-head h2').getBoundingClientRect().width) };
	});
	check('344px: the comparison head keeps its controls inside and its title on one line', head.inside && head.titleW > 150);
	await phone.close();
}

// Facet pages: the related chips lead somewhere ------------------------------
// Every facet has a page of its own, so every related chip must be a link.
console.log('\n--- facet cross-links ---');
{
	const page = await open(1280, 900);
	for (const [type, param] of [['brand', 'brand'], ['target', 'target'], ['chipset', 'chipset']]) {
		const value = await page.evaluate(t => {
			const f = toh_facets[t];
			const seen = tohCountBy(tohRows(), f.field);
			return seen.length ? seen[0][0] : null;
		}, type);
		if (!value) { check(type + ' page has a value to open', false); continue; }
		const links = await page.evaluate(([t, v]) => {
			tohOpenFacet(t, v, false);
			const chips = document.querySelectorAll('#toh-facet-body .toh-facet-chips .toh-facet-chip');
			const linked = document.querySelectorAll('#toh-facet-body .toh-facet-chips a.js-toh-facet');
			return { chips: chips.length, linked: linked.length,
				types: [...new Set([...linked].map(a => a.dataset.type))] };
		}, [type, value]);
		console.log('  ' + type.padEnd(8) + ' "' + String(value).slice(0, 24) + '" : '
			+ links.linked + '/' + links.chips + ' chips link'
			+ (links.types.length ? ' -> ' + links.types.join(',') : ''));
		check('the ' + type + ' page links its related chips',
			links.chips > 0 && links.linked === links.chips);
	}
	await page.close();
}

// The RAM parser cannot throw inside a sorter --------------------------------
console.log('\n--- value parsing ---');
{
	const page = await open(1280, 900);
	const ram = await page.evaluate(() => {
		const t = v => { try { return _getCleanNumber(v, 'ram'); } catch (e) { return 'THREW'; } };
		return { list: t('8 GB, 16 GB'), gb: t('4 GB'), mb: t('512 MB'),
				 prose: t('more than 4GB'), noisy: t('DDR3 2 GB') };
	});
	console.log('  ' + JSON.stringify(ram));
	check('a comma-separated RAM list does not throw', ram.list === 16385);
	check('GB still ranks just above its MB equivalent', ram.gb === 4097);
	check('MB parses as a number, not a string', ram.mb === 512);
	check('the wiki wording "more than 4GB" parses', ram.prose === 4097);
	await page.close();
}

// Controls that route a value into a filter ----------------------------------
// A control's label and its filter value are different strings; asserting on
// the label alone does not prove the click filters anything.
console.log('\n--- controls that filter ---');
{
	const page = await open(1280, 900);

	// RAM and Flash bars count "this much or more" with the test their column
	// filter applies: every bar must leave as many rows as it says
	const bars = await page.evaluate(async () => {
		const out = [];
		tabuTable.clearHeaderFilter();
		tohOpenStats(false);
		await new Promise(r => setTimeout(r, 500));
		const list = [...document.querySelectorAll('#toh-facet-body .js-toh-column')].map(a => ({
			field: a.dataset.field, value: a.dataset.value,
			says: parseInt(a.querySelector('.toh-statbar-value').textContent.replace(/,/g, ''), 10) }));
		for (const b of list) {
			tabuTable.clearHeaderFilter();
			tohOpenStats(false);
			await new Promise(r => setTimeout(r, 250));
			document.querySelector('.js-toh-column[data-field="' + b.field + '"][data-value="' + CSS.escape(b.value) + '"]')?.click();
			await new Promise(r => setTimeout(r, 450));
			out.push({ ...b, got: tabuTable.getRows('active').length });
		}
		tabuTable.clearHeaderFilter();
		const types = [...document.querySelectorAll('#toh-facet-body .toh-facet-block')]
			.find(x => /Device types/.test(x.querySelector('h3').textContent));
		return { out, typeLinks: types ? types.querySelectorAll('a').length : -1 };
	});
	const off = bars.out.filter(b => b.says !== b.got);
	console.log('  ' + bars.out.length + ' RAM / Flash bars, ' + off.length + ' off: '
		+ off.map(b => b.field + ' ' + b.value + ' says ' + b.says + ', shows ' + b.got).join('; '));
	check('every RAM and Flash bar shows as many devices as it counts',
		bars.out.length >= 10 && bars.out.some(b => b.field === 'rammb') && bars.out.some(b => b.field === 'flashmb') && off.length === 0);
	check('device type bars only count: their column is hidden', bars.typeLinks === 0);

	// A multi-member array: the chip's value is extracted from the display
	// string, which a single-member cell would not exercise.
	const chip = await page.evaluate(async () => {
		tabuTable.clearHeaderFilter();
		const row = tabuTable.getRows().find(r => Array.isArray(r.getData().flashmb)
				&& r.getData().flashmb.length > 1 && /^\d/.test(String(r.getData().flashmb[0])))
			|| tabuTable.getRows().find(r => r.getData().flashmb);
		const box = document.createElement('div');
		box.innerHTML = tohDeviceDetailsHtml(row);
		const el = box.querySelector('.js-toh-atleast[data-field="flashmb"]');
		if (!el) { return { skip: true }; }
		document.body.appendChild(el);
		el.click();
		el.remove();
		await new Promise(r => setTimeout(r, 800));
		return { value: el.getAttribute('data-value'), got: tabuTable.getRows('active').length };
	});
	if (!chip.skip) {
		console.log('  flash chip data-value ' + JSON.stringify(chip.value) + ' -> ' + chip.got + ' devices');
		check('the flash "at least this much" chip returns devices', chip.got > 0);
		check('the flash chip filters on a bare number, not its label', /^\d+$/.test(chip.value || ''));
	}
	await page.close();
}

// State that has to survive a reload -----------------------------------------
console.log('\n--- persistence ---');
{
	const page = await open(1280, 900);
	// shared browser context: start from a known state and assert on the id
	const id = await page.evaluate(() => {
		tohFavClear();
		const d = tabuTable.getRows('active')[0].getData().deviceid;
		tohFavToggle(d);
		document.getElementById('toh-fav-pin').click();
		return d;
	});
	await page.waitForTimeout(600);
	const pinnedBefore = await page.evaluate(() => toh_favorites_pinned);
	await page.reload({ waitUntil: 'load' });
	await page.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
	await page.waitForTimeout(1200);
	const after = await page.evaluate(d => ({ pinned: toh_favorites_pinned, has: tohFavHas(d) }), id);
	console.log('  pinned ' + pinnedBefore + ' -> after reload ' + JSON.stringify(after));
	check('a favourite survives a reload', after.has === true);
	check('the favourites pin survives a reload', pinnedBefore === true && after.pinned === true);
	await page.close();
}

// A compare link whose first ids are gone ------------------------------------
// The four-device limit must apply after unknown ids are dropped, not before.
console.log('\n--- stale compare ids ---');
{
	const real = JSON.parse(toh).entries.slice(0, 2).map(e => e[0]);
	const stale = ['no:such_a', 'no:such_b', 'no:such_c', 'no:such_d'];
	const page = await open(1280, 900, 'compare=' + encodeURIComponent(stale.concat(real).join(',')));
	const got = await page.evaluate(() => toh_compare.slice());
	console.log('  4 stale + 2 real -> ' + JSON.stringify(got));
	check('valid compare ids survive behind stale ones', got.length === 2);
	await page.close();
}

// Export keeps every field a combined column draws ----------------------------
console.log('\n--- export ---');
const exportWants = {
	// the normal view shows Device, CPU, Ethernet and Wi-Fi; the tablet view no Ethernet
	normal: ['Brand', 'Model', 'Cores', 'MHz', 'Eth 100', 'Eth 1G', 'Eth 2.5G', 'Eth 10G', '2.4 GHz', '5 GHz', '6 GHz'],
	tablet: ['Brand', 'Model', '2.4 GHz', '5 GHz', '6 GHz', '60 GHz'],
};
for (const [w, view] of [[1440, 'normal'], [1024, 'tablet']]) {
	const page = await open(w, 900);
	const grab = async type => {
		await page.click('.toh-export-but-toggle');
		const [dl] = await Promise.all([page.waitForEvent('download'),
			page.click('.toh-but-download[data-dltype="' + type + '"]')]);
		return readFileSync(await dl.path(), 'utf8');
	};
	const head = (await grab('csv')).split('\n')[0].replace(/"/g, '').split(',');
	const rows = JSON.parse(await grab('json'));
	const active = await page.evaluate(() => tabuTable.getRows('active').length);
	const want = exportWants[view];
	const keys = ['brand', 'model', 'wlan24ghz', 'wlan50ghz'];
	console.log('  ' + view + ': ' + head.join('|'));
	check(view + ': the CSV has what the combined columns draw, as separate columns',
		want.every(t => head.includes(t)) && head.indexOf('Brand') === head.indexOf('Model') - 1);
	check(view + ': the CSV has no column named after a combined cell',
		!head.includes('Device') && !head.includes('Wi-Fi') && !head.includes('Ethernet'));
	check(view + ': the JSON keys are field names', keys.every(k => k in rows[0]));
	check(view + ': the export has every filtered row', rows.length === active);
	await page.close();
}

// Keyboard: one stop per feature filter, and the state is announced -----------
console.log('\n--- filter keyboard ---');
{
	const page = await open(1440, 900);
	const tabs = await page.evaluate(() => {
		const links = [...document.querySelectorAll('.toh-filter-feature .toh-filter-title A')];
		const boxes = [...document.querySelectorAll('.toh-filter-feature INPUT')];
		return { links: links.length, focusableBoxes: boxes.filter(b => b.tabIndex >= 0).length,
			pressed: links.filter(a => a.getAttribute('role') === 'button' && a.hasAttribute('aria-pressed')).length };
	});
	check('feature checkboxes are out of the tab order', tabs.links > 0 && tabs.focusableBoxes === 0);
	check('feature links are toggle buttons', tabs.pressed === tabs.links);
	await page.focus('.toh-filter-feature .toh-filter-title A');
	await page.keyboard.press('Tab');
	const next = await page.evaluate(() => document.activeElement.matches('.toh-filter-feature .toh-filter-title A'));
	check('Tab goes from one feature filter to the next', next);
	await page.focus('.toh-filter-feature .toh-filter-title A');
	await page.keyboard.press(' ');
	await page.waitForTimeout(600);
	const on = await page.evaluate(() => {
		const a = document.querySelector('.toh-filter-feature .toh-filter-title A');
		return [a.getAttribute('aria-pressed'), a.closest('.toh-filter-feature').classList.contains('is-on')];
	});
	check('Space turns a feature filter on and says so', on[0] === 'true' && on[1] === true);
	await page.close();
}

// Narrow phones see two devices side by side in a comparison -----------------
console.log('\n--- compare on a narrow phone ---');
for (const w of [344, 390]) {
	const page = await open(w, 880);
	await page.evaluate(() => { tabuTable.getData().slice(40, 43).forEach(d => tohCompareToggle(d.deviceid, true)); tohOpenCompare(); });
	await page.waitForTimeout(700);
	const m = await page.evaluate(() => {
		const heads = [...document.querySelectorAll('.toh-compare-devhead')].map(e => e.getBoundingClientRect());
		document.getElementById('toh-compare-body').scrollLeft = 300;
		const lab = document.querySelector('.toh-compare-table TBODY TR:not(.toh-compare-section) .toh-compare-rowhead').getBoundingClientRect();
		return { whole: heads.filter(r => r.left >= 0 && r.right <= innerWidth + 1).length,
			labelOn: lab.left >= 0 && lab.left < 40, page: document.documentElement.scrollWidth <= innerWidth + 1 };
	});
	console.log('  ' + w + 'px: ' + JSON.stringify(m));
	check(w + 'px: two compared devices fit side by side', m.whole >= 2);
	check(w + 'px: the field name stays on screen while the devices scroll', m.labelOn);
	check(w + 'px: the comparison does not widen the page', m.page);
	await page.close();
}

// The cards have a sort menu --------------------------------------------------
console.log('\n--- card sort ---');
{
	// its own context: a pinned favourite would lead the cards whatever the sort
	const sortCtx = await browser.newContext();
	const page = await open(390, 844, '', sortCtx);
	await page.selectOption('#toh-cards-sort-by', 'rammb:desc');
	await page.waitForTimeout(600);
	const r = await page.evaluate(() => ({
		field: (tabuTable.getSorters()[0] || {}).field,
		firstCard: document.querySelector('.toh-card-dev').dataset.id,
		firstRow: tabuTable.getRows('active')[0].getData().deviceid,
	}));
	check('the sort menu sorts the table', r.field === 'rammb');
	check('the first card is the first sorted row', r.firstCard === r.firstRow);
	await page.evaluate(() => tabuTable.setSort('usbports', 'asc'));
	await page.waitForTimeout(400);
	check('a column sort shows as such in the menu',
		await page.evaluate(() => document.getElementById('toh-cards-sort-by').value === ''));
	await sortCtx.close();
	const desk = await open(1440, 900);
	check('the table has no sort menu, its headers sort',
		await desk.evaluate(() => getComputedStyle(document.getElementById('toh-cards-sort')).display === 'none'));
	await desk.close();
}

// A refused or broken device list says why and offers a retry -----------------
console.log('\n--- load errors ---');
for (const [label, answer, want] of [
	['503', r => r.fulfill({ status: 503, body: 'busy' }), /busy or rate-limiting/],
	['cut off', r => r.abort('connectionreset'), /did not complete/],
]) {
	const page = await ctx.newPage();
	await stub(page);
	await page.route('**://openwrt.org/toh.json*', answer);
	await page.goto(BASE + '/index.html?cache=' + CACHE, { waitUntil: 'load' });
	await page.waitForSelector('#toh-boot-retry', { timeout: 30000 }).catch(() => {});
	const text = await page.evaluate(() => document.getElementById('toh-load-text').textContent);
	console.log('  ' + label + ': ' + text.replace(/\s+/g, ' ').trim());
	check('a ' + label + ' device list is reported as such, with a retry',
		want.test(text) && await page.evaluate(() => !!document.getElementById('toh-boot-retry')));
	await page.close();
}

// Links shared from 1.80 ------------------------------------------------------
// 1.80 put the search in ?model= and ?brand=; ?brand= now names a manufacturer.
console.log('\n--- 1.80 links ---');
for (const [qs, want] of [
	['model=archer', { rows: 57, facet: null }],
	['brand=TP-Link&model=archer', { rows: 57, facet: null }],
	['brand=tp-link', { facet: 'TP-Link' }],
	['brand=tp', { search: 'tp', facet: null }],
]) {
	const page = await open(1440, 900, qs);
	const got = await page.evaluate(() => ({ rows: tabuTable.getRows('active').length,
		search: document.getElementById('toh-search-input-model').value,
		facet: toh_facet_open ? toh_facet_open.value : null }));
	console.log('  ?' + qs + ' -> ' + JSON.stringify(got));
	check('a 1.80 link ?' + qs + ' still lands where it pointed',
		Object.entries(want).every(([k, v]) => got[k] === v));
	await page.close();
}

// A loaded user slot puts its features in the URL, not its slot number ------
console.log('\n--- user slot link ---');
{
	const own = await browser.newContext();
	const page = await open(1440, 900, '', own);
	await page.evaluate(() => { checkFeature('wifi_ac'); applyCheckedFeatures(); updateFilterGroupState(); });
	await page.waitForTimeout(500);
	await page.click('#toh-filters-upresets .toh-upreset-but[data-key="1"]');
	await page.fill('#toh-upreset-popup-save INPUT', 'mine');
	await page.click('#toh-upreset-popup-save BUTTON');
	await page.waitForTimeout(400);
	await page.evaluate(() => { checkAllFeatures(false); applyCheckedFeatures(); updateFilterGroupState(); });
	await page.waitForTimeout(400);
	await page.click('#toh-filters-upresets .toh-upreset-but[data-key="1"]');
	await page.waitForTimeout(700);
	const slot = await page.evaluate(() => ({ url: buildBrowserUrl(false), rows: tabuTable.getRows('active').length }));
	const again = await open(1440, 900, slot.url.split('?')[1] || '', own);
	const rows = await again.evaluate(() => tabuTable.getRows('active').length);
	console.log('  ' + slot.url + ' -> ' + slot.rows + ' rows, reopened ' + rows);
	check('a loaded user slot links to its features', /features=/.test(slot.url) && !/filter=/.test(slot.url) && rows === slot.rows);
	await own.close();
}

// Back and forward through device popups ------------------------------------
console.log('\n--- device history ---');
{
	const shown = pg => pg.evaluate(() => {
		const head = document.querySelector('.toh-details-container .toh-details-head');
		return { url: decodeURIComponent(location.search), popup: head ? head.textContent : '', open: toh_device_open,
			facet: !document.getElementById('toh-facet-panel').classList.contains('toh-hidden') };
	});
	// a context of its own: a favourite pinned earlier would reorder the rows
	const histCtx = await browser.newContext();
	const page = await open(1440, 900, '', histCtx);
	const ids = await page.evaluate(() => tabuTable.getRows('active').slice(3, 7).map(r => r.getData().deviceid));
	const cell = async i => (await page.$$('#toh-table .tabulator-row .tabulator-cell[tabulator-field="model"]'))[i];
	await (await cell(3)).click(); await page.waitForTimeout(800);
	const a = await shown(page);
	await (await cell(6)).click(); await page.waitForTimeout(800);
	const b = await shown(page);
	await page.goBack(); await page.waitForTimeout(1200);
	const back1 = await shown(page);
	await page.goBack(); await page.waitForTimeout(1800);
	const back2 = await shown(page);
	console.log('  A ' + a.url + ' | B ' + b.url + ' | Back ' + back1.url + ' | Back ' + back2.url);
	check('a second popup puts its own device in the URL', b.url.includes(ids[3]) && b.open === ids[3]);
	check('Back from it closes it, and Back again reopens the first', back1.url === '' && back1.open === null
		&& back2.url.includes(ids[0]) && back2.open === ids[0] && back2.popup !== '');

	// a chip in the popup goes to a page; one Back comes back to the popup
	await page.evaluate(() => document.querySelector('.toh-details-container .js-toh-facet')?.click());
	await page.waitForTimeout(800);
	const facet = await shown(page);
	await page.goBack(); await page.waitForTimeout(2000);
	const ret = await shown(page);
	console.log('  chip ' + facet.url + ' | Back ' + ret.url);
	check('a page opened from a popup does not keep the device in its URL', facet.facet && !/device=/.test(facet.url));
	check('one Back from that page reopens the popup', !ret.facet && ret.url.includes(ids[0]) && ret.popup !== '');

	// a link opening a second device while the first is open
	await page.evaluate(id => tohOpenDevice(id, true), ids[1]); await page.waitForTimeout(1500);
	const viaLink = await shown(page);
	check('a device opened over another keeps its id in the URL', viaLink.url.includes(ids[1]) && viaLink.open === ids[1]);
	await histCtx.close();
}

// The details sheet also opens on a desktop, from the comparison ------------
console.log('\n--- desktop sheet ---');
{
	const page = await open(1440, 900);
	await page.evaluate(() => { tabuTable.getData().slice(40, 43).forEach(d => tohCompareToggle(d.deviceid, true)); tohOpenCompare(); });
	await page.waitForTimeout(700);
	const sheetOpen = () => page.evaluate(() => !document.getElementById('toh-sheet').classList.contains('toh-hidden'));
	await page.evaluate(() => document.querySelector('.js-compare-details')?.click()); await page.waitForTimeout(600);
	const opened = await sheetOpen();
	await page.goBack(); await page.waitForTimeout(1000);
	const afterBack = await sheetOpen();
	await page.evaluate(() => document.querySelector('.js-compare-details')?.click()); await page.waitForTimeout(600);
	await page.evaluate(() => document.querySelector('#toh-sheet .js-toh-facet')?.click()); await page.waitForTimeout(800);
	const afterChip = await sheetOpen();
	check('Back closes the desktop details sheet', opened && !afterBack);
	check('a chip in the desktop sheet closes it on the way', !afterChip);
	await page.evaluate(() => tohCompareClear());
	await page.close();
}

// Opening a device the search hides empties the search box too --------------
console.log('\n--- device behind a search ---');
{
	const id = JSON.parse(toh).entries.map(e => e[0]).find(x => !/archer/i.test(x));
	const page = await open(1440, 900, 'search=archer&device=' + encodeURIComponent(id));
	await page.waitForTimeout(1500);
	const r = await page.evaluate(() => ({ rows: tabuTable.getRows('active').length,
		box: document.getElementById('toh-search-input-model').value, said: document.getElementById('toh-fav-status').textContent }));
	console.log('  ' + JSON.stringify(r));
	check('a linked device the search hides clears the search box as well', r.rows === TOTAL && r.box === '' && /cleared/.test(r.said));
	await page.close();
}

// A broken escape in a link must not stop the page loading --------------------
console.log('\n--- malformed link ---');
{
	const page = await open(1440, 900, 'search=100%25zz%');
	const r = await page.evaluate(() => getComputedStyle(document.getElementById('toh-boot-overlay')).display);
	check('a malformed escape in the URL does not stop the boot', r === 'none');
	await page.close();
}

// Pinned favourites lead the phone cards, as they lead the table -------------
console.log('\n--- pinned favourites on a phone ---');
{
	const own = await browser.newContext();
	const page = await open(390, 844, '', own);
	const id = await page.evaluate(() => tabuTable.getData().find(d => /^Z/.test(d.brand || '')).deviceid);
	await page.evaluate(id => tohFavToggle(id), id); await page.waitForTimeout(300);
	await page.evaluate(() => document.getElementById('toh-fav-pin').click()); await page.waitForTimeout(700);
	const first = await page.evaluate(() => document.querySelector('.toh-card-dev').dataset.id);
	check('a pinned favourite is the first card', first === id);
	await own.close();
}

// The comparison judges and draws the same field --------------------------------
console.log('\n--- compare rows for combined cells ---');
{
	const page = await open(1440, 900);
	const rows = await page.evaluate(() => {
		const all = tabuTable.getData();
		const a = all.find(d => parseInt(d.ethernet2_5gports, 10) > 0 && parseInt(d.ethernet1gports, 10) === 4);
		const b = all.find(d => !(parseInt(d.ethernet2_5gports, 10) > 0) && parseInt(d.ethernet1gports, 10) === 4);
		tohCompareClear();
		[a, b].forEach(d => tohCompareToggle(d.deviceid, true));
		tohOpenCompare();
		return [...document.querySelectorAll('.toh-compare-table TBODY TR')].map(tr => ({
			head: (tr.querySelector('th') || {}).textContent, diff: tr.classList.contains('is-diff'),
			cells: [...tr.querySelectorAll('td')].map(td => td.textContent.trim()) }));
	});
	const g1 = rows.find(r => r.head === 'Ethernet 1G ports');
	const g25 = rows.find(r => r.head === 'Ethernet 2.5G ports');
	console.log('  ' + JSON.stringify(g1) + ' ' + JSON.stringify(g25));
	check('the 1G row shows only 1G ports, and agrees', g1 && !g1.diff && g1.cells.every(c => c === '4'));
	check('the 2.5G difference is the row that lights up', g25 && g25.diff);
	await page.evaluate(() => tohCompareClear());
	await page.close();
}

// Keyboard: only the modal sheet holds Tab ---------------------------------------
console.log('\n--- focus ---');
{
	const page = await open(1440, 900);
	await page.evaluate(() => tohOpenStats(false)); await page.waitForTimeout(600);
	let left = false;
	for (let i = 0; i < 150 && !left; i++) {
		await page.keyboard.press('Tab');
		left = await page.evaluate(() => document.activeElement !== document.body
			&& !document.getElementById('toh-facet-panel').contains(document.activeElement));
	}
	check('Tab can leave the statistics page', left);
	await page.close();
	const phone = await open(390, 844);
	await phone.evaluate(() => tohSheetOpen(tabuTable.getData()[10].deviceid)); await phone.waitForTimeout(600);
	let stayed = true;
	for (let i = 0; i < 60 && stayed; i++) {
		await phone.keyboard.press('Tab');
		stayed = await phone.evaluate(() => document.getElementById('toh-sheet').contains(document.activeElement));
	}
	check('Tab stays inside the open details sheet', stayed);
	await phone.close();
}

// Tabulator is handed only options it knows -------------------------------------
console.log('\n--- console ---');
{
	const page = await ctx.newPage();
	const warned = [];
	page.on('console', m => { if (/Invalid column definition option/.test(m.text())) warned.push(m.text()); });
	await stub(page);
	await page.goto(BASE + '/index.html?cache=' + CACHE, { waitUntil: 'load' });
	await page.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
	await page.waitForTimeout(1000);
	console.log('  ' + warned.length + ' column option warnings');
	check('Tabulator logs no unknown column options', warned.length === 0);
	await page.close();
}

// URLs and cookies that name an inherited key ----------------------------------
// "constructor", "toString" and "__proto__" are on every object; a lookup must
// not mistake them for a preset, a view or a column.
console.log('\n--- inherited keys ---');
{
	const bad = [];
	for (const qs of ['filter=constructor', 'view=constructor', 'features=toString', 'columns=constructor,__proto__',
		'compare=constructor,toString', 'device=constructor', 'chipset=__proto__', 'target=toString', 'filter=__proto__&view=toString']) {
		const page = await open(1440, 900, qs);
		const ok = await page.evaluate(() => !document.getElementById('toh-boot-retry') && tabuTable.getRows('active').length > 0);
		if (!ok) { bad.push(qs); }
		await page.close();
	}
	const own = await browser.newContext();
	await own.addCookies([{ name: 'toh_density', value: 'constructor', url: BASE }]);
	const dense = await open(1440, 900, '', own);
	const rowH = await dense.evaluate(() => typeof tabulatorOptions.rowHeight === 'number' && !document.getElementById('toh-boot-retry'));
	await own.close();
	console.log('  ' + (bad.length ? 'broke: ' + bad.join(' | ') : 'all boot'));
	check('a URL naming an inherited key still opens the table', bad.length === 0);
	check('a density cookie naming an inherited key is ignored', rowH);
}

// What leaves the page: the CSV, and links built from wiki text -----------------
console.log('\n--- exports and built links ---');
{
	const data = JSON.parse(toh);
	const ci = Object.fromEntries(data.columns.map((c, i) => [c, i]));
	const c7 = data.entries.find(e => e[ci.model] === 'Archer C7');
	c7[ci.cpu] = '=HYPERLINK("http://x","y")';
	c7[ci.forumsearch] = 'Archer & C7 #1';
	const page = await ctx.newPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await stub(page, JSON.stringify(data));
	await page.goto(BASE + '/index.html?cache=' + CACHE, { waitUntil: 'load' });
	await page.waitForFunction(() => window.tabuTable && tabuTable.getData().length > 0, null, { timeout: 180000 });
	await page.waitForTimeout(1000);
	const grab = async type => {
		await page.click('.toh-export-but-toggle');
		const [dl] = await Promise.all([page.waitForEvent('download'),
			page.click('.toh-but-download[data-dltype="' + type + '"]')]);
		return readFileSync(await dl.path(), 'utf8');
	};
	const line = (await grab('csv')).split('\n').find(l => /"Archer C7"/.test(l)) || '';
	const json = JSON.parse(await grab('json')).find(r => r.model === 'Archer C7') || {};
	console.log('  ' + line);
	check('a CSV cell that would run as a formula is quoted', line.includes('"\'=HYPERLINK('));
	check('the wiki\'s "-" for empty is exported as it is', line.includes('"-"'));
	check('the JSON keeps the value untouched', json.cpu === '=HYPERLINK("http://x","y")');
	const links = await page.evaluate(() => {
		const r = tabuTable.getRows().find(x => x.getData().model === 'Archer C7');
		const forum = FormatterLink({ getValue: () => r.getData().forumsearch, getField: () => 'forumsearch', getRow: () => r },
			{ prefix: toh_urls.forum_search, icon: 'user', ttip: 'x' });
		tohCompareToggle(r.getData().deviceid, true);
		return { forum: (forum.match(/href="([^"]*)"/) || [])[1], url: buildBrowserUrl(false) };
	});
	console.log('  ' + links.forum);
	check('a search link carries the term encoded', /q=Archer%20%26%20C7%20%231$/.test(links.forum || ''));
	check('compared ids are encoded in the URL', /compare=tp-link%3A/.test(links.url));
	await page.evaluate(() => tohCompareClear());
	await page.close();
}

// The lightbox checks its URL and is a dialog of its own ------------------------
console.log('\n--- lightbox ---');
{
	const page = await open(1440, 900);
	await page.evaluate(() => {
		const b = document.createElement('button'); b.id = 'opener'; document.body.appendChild(b); b.focus();
		OpenImageLightbox(['javascript:alert(1)'], 0);
	});
	await page.waitForTimeout(400);
	const lb = await page.evaluate(() => ({ dialog: document.getElementById('toh-image-lightbox').getAttribute('aria-modal') === 'true',
		src: !!(document.querySelector('#toh-image-lightbox img') || {}).src,
		source: !document.querySelector('.toh-lightbox-source').classList.contains('toh-hidden') }));
	let inside = true;
	for (let i = 0; i < 5; i++) {
		await page.keyboard.press('Tab');
		inside = inside && await page.evaluate(() => document.getElementById('toh-image-lightbox').contains(document.activeElement));
	}
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	const back = await page.evaluate(() => document.activeElement.id);
	check('an unsafe picture URL loads nothing and offers no link', lb.dialog && !lb.src && !lb.source);
	check('Tab stays in the lightbox, and Escape hands the focus back', inside && back === 'opener');
	await page.close();

	// opened from the phone sheet, which holds Tab too
	const phone = await open(390, 844);
	await phone.evaluate(() => {
		tohSheetOpen(tabuTable.getData().find(d => d.model === 'Archer C7').deviceid);
		OpenImageLightbox(['https://openwrt.org/_media/a.jpg', 'https://openwrt.org/_media/b.jpg'], 0);
	});
	await phone.waitForTimeout(400);
	const seen = new Set();
	for (let i = 0; i < 6; i++) {
		await phone.keyboard.press('Tab');
		seen.add(await phone.evaluate(() => document.getElementById('toh-image-lightbox').contains(document.activeElement)
			? document.activeElement.className : 'OUTSIDE'));
	}
	check('over the sheet, Tab moves through the lightbox controls', !seen.has('OUTSIDE') && seen.size >= 2);
	await phone.close();
}

// A user slot's name is text ------------------------------------------------------
console.log('\n--- user slot name ---');
{
	const own = await browser.newContext();
	const page = await open(1440, 900, '', own);
	await page.click('#toh-filters-upresets .toh-upreset-but[data-key="2"]');
	await page.evaluate(() => { document.querySelector('#toh-upreset-popup-save INPUT').value = '<img src=x onerror=window.__slot=1>'; });
	await page.click('#toh-upreset-popup-save BUTTON');
	await page.waitForTimeout(400);
	const r = await page.evaluate(() => ({ text: document.querySelector('#toh-filters-upresets .toh-upreset-but[data-key="2"]').textContent,
		imgs: document.querySelectorAll('.toh-upresets img').length, fired: !!window.__slot,
		max: document.querySelector('#toh-upreset-popup-save INPUT').maxLength }));
	const limit = await page.evaluate(() => toh_prefs.cook_max_chars);
	check('a pasted slot name is shown as text, cut to its limit', r.imgs === 0 && !r.fired && r.text.length <= limit && r.max === limit);
	await own.close();
}

// The details and the popup ---------------------------------------------------------
console.log('\n--- details ---');
{
	const page = await open(1440, 900);
	const rows = await page.evaluate(() => {
		const keys = model => {
			const r = tabuTable.getRows().find(x => x.getData().model === model || x.getData().deviceid === model);
			const box = document.createElement('div');
			box.innerHTML = tohDeviceDetailsHtml(r);
			return [...box.querySelectorAll('.toh-details-key')].map(k => k.textContent);
		};
		const nowifi = tabuTable.getData().find(d => !d.wlan24ghz || d.wlan24ghz === '-').deviceid;
		return { c7: keys('Archer C7'), nowifi: keys(nowifi) };
	});
	check('the details name the 2.4 GHz row as such', rows.c7.includes('WLAN 2.4 GHz') && !rows.c7.includes('Wi-Fi bands'));
	check('a device without Wi-Fi gets no Wi-Fi row', !rows.nowifi.some(k => k === 'Wi-Fi bands' || k === 'WLAN 2.4 GHz'));
	const cells = await page.$$('#toh-table .tabulator-row .tabulator-cell[tabulator-field="model"]');
	await cells[2].click();
	await page.waitForTimeout(700);
	const pos = await page.evaluate(() => ({ popup: document.querySelector('.toh-details-container').getBoundingClientRect().top,
		bar: document.getElementById('toh-appbar').getBoundingClientRect().bottom }));
	check('the details popup opens below the app bar', pos.popup >= pos.bar);
	await page.close();
}

// Table polish ---------------------------------------------------------------------------
console.log('\n--- table ---');
{
	const page = await open(1440, 900);
	const shown = () => page.evaluate(() => getComputedStyle(document.querySelector('.toh-but-clearheadersorts')).display !== 'none');
	const atLoad = await shown();
	await page.evaluate(() => tabuTable.setSort('rammb', 'desc'));
	await page.waitForTimeout(300);
	const sorted = await shown();
	await page.click('.toh-but-clearheadersorts');
	await page.waitForTimeout(300);
	const back = await page.evaluate(() => tabuTable.getSorters().map(s => s.field + ' ' + s.dir).join());
	check('Sorts appears only for an order other than the default', !atLoad && sorted && !(await shown()));
	check('Sorts returns to brand and model, not to no order', /model asc/.test(back));
	const cut = await page.evaluate(() => {
		const s = [...document.querySelectorAll('#toh-table .tabulator-cell[tabulator-field="flashmb"] .toh-cell-text')]
			.find(x => x.scrollWidth > x.clientWidth + 1);
		return s ? getComputedStyle(s).textOverflow : 'none cut';
	});
	check('cut cell text ends in an ellipsis', cut === 'ellipsis');
	await page.evaluate(() => tohOpenAdvSearch());
	await page.waitForTimeout(300);
	const one = await page.evaluate(() => {
		document.querySelector('.toh-adv-check[data-key="eth_1g"]').click();
		document.querySelector('.toh-adv-check[data-key="eth_2d5g"]').click();
		return [document.querySelector('.toh-adv-check[data-key="eth_1g"]').checked, document.querySelector('.toh-adv-check[data-key="eth_2d5g"]').checked];
	});
	check('Advanced search keeps one filter per "only" group, as the rail does', !one[0] && one[1]);
	await page.close();
}

// Phone polish ------------------------------------------------------------------------------
console.log('\n--- phone ---');
{
	const phone = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	const page = await open(390, 844, '', phone);
	await page.evaluate(() => tohSheetOpen(tabuTable.getData().find(d => d.model === 'Archer C7').deviceid));
	await page.waitForTimeout(500);
	const box = await page.evaluate(() => { const r = document.querySelector('#toh-sheet-body .toh-details-border').getBoundingClientRect(); return [r.left, r.right]; });
	check('the details sheet uses the full width', box[0] === 0 && box[1] === 390);
	await page.evaluate(() => tohSheetClose());
	await page.click('#toh-sidebar-toggle');
	await page.waitForTimeout(400);
	const drawer = await page.evaluate(() => ({ locked: getComputedStyle(document.body).overflowY === 'hidden',
		slot: (r => r.width >= 30 && r.height >= 30)(document.querySelector('#toh-filters-upresets .toh-upreset-but').getBoundingClientRect()) }));
	await page.evaluate(() => tohOpenStats(false));
	await page.waitForTimeout(500);
	const after = await page.evaluate(() => ({ closed: !document.body.classList.contains('toh-sidebar-open'), summary: document.body.classList.contains('toh-summary-on') }));
	await page.evaluate(() => { tohCloseFacet(); tabuTable.getData().slice(40, 43).forEach(d => tohCompareToggle(d.deviceid, true)); tohOpenCompare(); });
	await page.waitForTimeout(500);
	const cmpSummary = await page.evaluate(() => document.body.classList.contains('toh-summary-on'));
	check('the open drawer holds the page behind it still', drawer.locked);
	check('a user slot is big enough to tap', drawer.slot);
	check('opening a page closes the drawer', after.closed);
	check('no summary row over statistics or a comparison', !after.summary && !cmpSummary);
	await phone.close();
}

// ---------------------------------------------------------------------------
console.log('\n--- results ---');
results.forEach(([n, ok]) => console.log((ok ? 'PASS' : 'FAIL') + '  ' + n));
const bad = results.filter(([, ok]) => !ok).length;
console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
