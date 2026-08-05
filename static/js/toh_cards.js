/*
	Copyright (c) 2024 Francois Dechery

	This program is free software: you can redistribute it and/or modify it under the
	terms of the GNU General Public License as published by the Free Software Foundation,
	either version 2 of the License, or (at your option) any later version.

	This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
	without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
	See the GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program.
	If not, see <https://www.gnu.org/licenses/>.
 */
// toh_cards.js
//
//	The phone renderer: below toh_cards_max_width the rows are drawn as cards.
//
//	Tabulator still filters, sorts and paginates, in a container CSS has
//	hidden; this file draws the rows it hands back.

const toh_cards_max_width=767;		// keep in step with the @media rule in toh.css

let toh_cards_on=false;				// is the card list the renderer right now


// Is this viewport too narrow for any table -------------------------------
function tohCardsActive(){
	return window.matchMedia
		? window.matchMedia('(max-width: '+toh_cards_max_width+'px)').matches
		: false;
}

// One spec, skipped entirely when the device has no value for it -----------
// 'wide' takes the whole row on a narrow screen. Keyed on a class rather than
// :first-child, so a device with no CPU does not promote its RAM instead.
function tohCardSpec(key, value, wide){
	if(value === null || value === undefined || value === '' || value === '-'){
		return '';
	}
	return '<div class="toh-card-spec' + (wide ? ' is-wide' : '') + '">'
		+ '<span class="toh-card-spec-key">' + key + '</span>'
		+ '<span class="toh-card-spec-val">' + tohAttr(value) + '</span>'
		+ '</div>';
}

// What a device says about its wireless, in one line ------------------------
// The data has no "Wi-Fi 6" field, only the per-band mode strings, so the card
// shows the bands it has.
function tohCardWifi(data){
	// Same fields, predicate and order as FormatterWifi in toh_table.js.
	// wlan60ghz is 6 GHz (Wi-Fi 6E), wlan600ghz is 60 GHz (WiGig).
	const has=v => v && String(v).trim() !== '' && String(v).trim() !== '-';
	const bands=[];
	if(has(data.wlan24ghz)){ bands.push('2.4'); }
	if(has(data.wlan50ghz)){ bands.push('5'); }
	if(has(data.wlan60ghz)){ bands.push('6'); }
	if(has(data.wlan600ghz)){ bands.push('60'); }
	return bands.length ? bands.join(' / ') + ' GHz' : '';
}

// One card ------------------------------------------------------------------
function tohCardHtml(row){
	const data=row.getData();
	const id=data.deviceid;

	// the support state as the table draws it. getRow is needed too: the
	// formatter reads unsupported_functions off the row.
	const state=FormatterRelease({
		getValue: () => data.supportedcurrentrel,
		getRow: () => row,
	}, undefined, undefined);

	// tohArrayText() is the rule the table cell uses: ["8","eMMC"] reads "8 MB + eMMC"
	const flash=tohArrayText(data.flashmb, 'MB');
	const mhz=parseInt(data.cpumhz, 10);
	const cpu=data.cpu && mhz > 0 ? data.cpu + ' · ' + mhz + ' MHz' : data.cpu;
	const specs=tohCardSpec('CPU', cpu, true)
		+ tohCardSpec('RAM', /^\d+$/.test(String(data.rammb).trim()) ? String(data.rammb).trim() + ' MB' : data.rammb)
		+ tohCardSpec('Flash', flash && flash !== '-' ? flash : null)
		+ tohCardSpec('Wi-Fi', tohCardWifi(data));

	const fav=tohFavHas(id);
	const cmp=tohCompareHas(id);

	return '<div class="toh-card-dev' + (fav ? ' is-fav' : '') + '" data-id="' + tohAttr(id) + '">'
		+ '<div class="toh-card-head">'
			+ '<div class="toh-card-names">'
				+ '<span class="toh-card-brand">' + tohAttr(data.brand) + '</span>'
				+ '<span class="toh-card-model">' + tohAttr(data.model) + '</span>'
			+ '</div>'
			+ '<div class="toh-card-state">' + state + '</div>'
		+ '</div>'
		+ (specs ? '<div class="toh-card-specs">' + specs + '</div>' : '')
		+ '<div class="toh-card-actions">'
			+ '<button type="button" class="toh-but toh-card-details">Details</button>'
			+ '<button type="button" class="toh-card-fav' + (fav ? ' is-on' : '') + '"'
				+ ' aria-pressed="' + (fav ? 'true' : 'false') + '"'
				+ ' title="Keep an eye on this device">' + tohIcon('heart') + '</button>'
			+ '<button type="button" class="toh-card-cmp' + (cmp ? ' is-on' : '') + '"'
				+ (tohCompareBlocked(id) ? ' disabled' : '')
				+ ' aria-pressed="' + (cmp ? 'true' : 'false') + '"'
				+ ' title="' + tohCompareLabel(id) + '" aria-label="' + tohCompareLabel(id) + '">'
				+ tohIcon('table-columns-split') + '</button>'
		+ '</div>'
	+ '</div>';
}

// Draw the current page of rows --------------------------------------------
function tohRenderCards(){
	if(typeof tabuTable === 'undefined' || !tabuTable || !toh_table_inited){
		return;
	}
	if(!tohCardsActive()){
		toh_cards_on=false;
		return;
	}
	toh_cards_on=true;

	// getRows("active") is every row that passed the filters, in sort order but
	// across all pages, so the page has to be cut out of it here
	const rows=tabuTable.getRows('active');
	const size=parseInt(tabuTable.getPageSize(), 10) || rows.length;
	const page=parseInt(tabuTable.getPage(), 10) || 1;
	const from=(page - 1) * size;
	const shown=rows.slice(from, from + size);

	$('#toh-cards-list').html(shown.length
		? shown.map(tohCardHtml).join('')
		: '<div class="toh-cards-empty">No device matches these filters.</div>');

	const max=parseInt(tabuTable.getPageMax(), 10) || 1;
	$('#toh-cards-page').text(rows.length
		? 'Page ' + page + ' of ' + max + ' · ' + rows.length.toLocaleString('en-US') + ' devices'
		: '');
	$('#toh-cards-prev').prop('disabled', page <= 1);
	$('#toh-cards-next').prop('disabled', page >= max);
	$('#toh-cards-pager').toggle(rows.length > 0);
}

// The sort menu ---------------------------------------------------------------
// Sorts the table, which the cards are drawn from. "Brand and model" is the
// order the table starts in.
function tohCardsSortApply(value){
	const [field, dir]=String(value).split(':');
	if(!field){
		return;
	}
	if(field === 'model'){
		tabuTable.setSort([{column:'model', dir:'asc'}, {column:'brand', dir:'asc'}]);
	}
	else{
		tabuTable.setSort(field, dir);
	}
	tabuTable.setPage(1);			// a new order starts from its top
}

// Show the table's current sort, also when it was set from a column header
function tohCardsSortSync(){
	const first=tabuTable.getSorters()[0];
	let value='';
	if(!first || first.field === 'model' || first.field === 'brand'){
		value='model:asc';
	}
	else{
		value=first.field + ':' + first.dir;
	}
	const $select=$('#toh-cards-sort-by');
	$select.val($select.find('option[value="' + CSS.escape(value) + '"]').length ? value : '');
}

// Repaint just the two toggles, without rebuilding the list -----------------
// Called from the favourite and compare sync, which run on every change and
// would otherwise throw away the scroll position on each tap.
function tohCardsSyncToggles(){
	if(!toh_cards_on){
		return;
	}
	$('#toh-cards-list .toh-card-dev').each(function(){
		const id=$(this).attr('data-id');
		const fav=tohFavHas(id);
		const cmp=tohCompareHas(id);
		$(this).toggleClass('is-fav', fav);
		$(this).find('.toh-card-fav').toggleClass('is-on', fav).attr('aria-pressed', fav ? 'true' : 'false');
		// disabled once the tray is full, like the row checkboxes
		$(this).find('.toh-card-cmp').toggleClass('is-on', cmp)
			.attr('aria-pressed', cmp ? 'true' : 'false')
			.prop('disabled', tohCompareBlocked(id))
			.attr('title', tohCompareLabel(id))
			.attr('aria-label', tohCompareLabel(id));
	});
}


// The details sheet ##########################################################################################################

// Open a device in the sheet ------------------------------------------------
// Uses tohDeviceDetailsHtml(), the same builder as the row popup.
function tohSheetOpen(id){
	let row=tohFindDeviceRow(id);
	if(!row || row === 'filtered'){
		// not among the active rows - a device can be compared and then filtered
		// out. tohDeviceDetailsHtml only calls row.getData(), so a synthetic row
		// over the raw data is enough.
		const data=tohRowById(id);
		if(!data){
			myLogStr('Sheet: device not found: ' + id, 1);
			return;
		}
		row={getData: () => data};
	}
	$('#toh-sheet-body').html(tohDeviceDetailsHtml(row));
	$('#toh-sheet').removeClass('toh-hidden');
	$('body').addClass('toh-sheet-open');
	$('#toh-sheet-panel').scrollTop(0);
	// the sheet declares aria-modal, so it has to hold Tab and hand focus back
	tohSetPanelHidden('#toh-sheet', false);
}

function tohSheetClose(){
	if($('#toh-sheet').hasClass('toh-hidden')){
		return;
	}
	$('#toh-sheet').addClass('toh-hidden');
	$('body').removeClass('toh-sheet-open');
	$('#toh-sheet-body').empty();
	tohSetPanelHidden('#toh-sheet', true);		// and focus goes back to the card
	tohDeviceUrlSet(null);			// the device is closed, so drop ?device=
}
