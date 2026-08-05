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
//	The phone renderer. A table of twenty-five columns is the wrong shape for a
//	360px screen, and narrowing it only trades one problem for another, so below
//	toh_cards_max_width the same rows are drawn as cards instead.
//
//	Tabulator is still the only thing that filters, sorts and paginates: it keeps
//	running in a container CSS has hidden, and this file draws whatever it hands
//	back. There is deliberately no second filter engine - two of them would
//	disagree, and the count in the toolbar would stop matching what is on screen.

const toh_cards_max_width=700;		// keep in step with the @media rule in toh.css

let toh_cards_on=false;				// is the card list the renderer right now


// Is this viewport too narrow for any table -------------------------------
function tohCardsActive(){
	return window.matchMedia
		? window.matchMedia('(max-width: '+toh_cards_max_width+'px)').matches
		: false;
}

// One spec, skipped entirely when the device has no value for it -----------
function tohCardSpec(key, value){
	if(value === null || value === undefined || value === '' || value === '-'){
		return '';
	}
	return '<div class="toh-card-spec">'
		+ '<span class="toh-card-spec-key">' + key + '</span>'
		+ '<span class="toh-card-spec-val">' + tohAttr(value) + '</span>'
		+ '</div>';
}

// What a device says about its wireless, in one line ------------------------
// The data has no "Wi-Fi 6" field, only the per-band mode strings, so the card
// shows the bands it has rather than inventing a generation for it.
function tohCardWifi(data){
	const bands=[];
	if(data.wlan24ghz && data.wlan24ghz !== '-'){ bands.push('2.4'); }
	if(data.wlan50ghz && data.wlan50ghz !== '-'){ bands.push('5'); }
	if(data.wlan60ghz && data.wlan60ghz !== '-'){ bands.push('6'); }
	return bands.length ? bands.join(' / ') + ' GHz' : '';
}

// One card ------------------------------------------------------------------
function tohCardHtml(row){
	const data=row.getData();
	const id=data.deviceid;

	// the support state as the table draws it, so the two cannot disagree.
	// getRow as well as getValue: the formatter reads unsupported_functions off
	// the row to mark a device whose radio or modem OpenWrt cannot drive.
	const state=FormatterRelease({
		getValue: () => data.supportedcurrentrel,
		getRow: () => row,
	}, undefined, undefined);

	// tohArrayText, the same rule the table cell uses: joining with ", " and
	// appending one unit printed ["8","eMMC"] as "8, eMMC MB"
	const flash=tohArrayText(data.flashmb, 'MB');
	const specs=tohCardSpec('CPU', data.cpu)
		+ tohCardSpec('RAM', data.rammb ? data.rammb + ' MB' : null)
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
				+ ' aria-pressed="' + (cmp ? 'true' : 'false') + '"'
				+ ' title="Pick this device to compare">' + tohIcon('table-columns-split') + '</button>'
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
		$(this).find('.toh-card-cmp').toggleClass('is-on', cmp).attr('aria-pressed', cmp ? 'true' : 'false');
	});
}


// The details sheet ##########################################################################################################

// Open a device in the sheet ------------------------------------------------
// Uses tohDeviceDetailsHtml(), the same builder behind the row popup, so the
// phone shows the desktop's description rather than a shorter retelling of it.
function tohSheetOpen(id){
	let row=tohFindDeviceRow(id);
	if(!row || row === 'filtered'){
		// not among the active rows - a device can be compared and then filtered
		// out. tohDeviceDetailsHtml only calls row.getData(), so a synthetic row
		// over the raw data is enough.
		const data=tabuTable.getData().find(d => d.deviceid === id);
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
	$('#toh-sheet-close').trigger('focus');
}

function tohSheetClose(){
	if($('#toh-sheet').hasClass('toh-hidden')){
		return;
	}
	$('#toh-sheet').addClass('toh-hidden');
	$('body').removeClass('toh-sheet-open');
	$('#toh-sheet-body').empty();
	tohDeviceUrlSet(null);			// the device is no longer open, so drop ?device=
}
