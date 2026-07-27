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
// toh_compare.js
//
//	Side-by-side device comparison.

// Compare ####################################################################################################################

let toh_compare=[];					// deviceids picked for comparison, in pick order
const toh_compare_max=4;			// more than this and the columns stop being readable

// The rows of the comparison, in the order they are shown. 'diff' marks the
// fields worth highlighting when they differ - free text like the power supply
// string differs on almost every device, so highlighting it says nothing.
const toh_compare_rows=[
	{group:'Overview',	fields:['devicetype','availability','supportedcurrentrel','supportedsincerel','target','subtarget','packagearchitecture'], diff:true},
	{group:'CPU',		fields:['cpu','cpucores','cpumhz'], diff:true},
	{group:'Memory',	fields:['rammb','flashmb'], diff:true},
	{group:'Wireless',	fields:['wlan24ghz','wlan50ghz','wlan60ghz','wlanhardware','detachableantennas'], diff:true},
	{group:'Network',	fields:['ethernet100mports','ethernet1gports','ethernet2_5gports','ethernet5gports','ethernet10gports','sfp_ports','sfp_plus_ports','vlan','modem'], diff:true},
	{group:'Ports',		fields:['usbports','sataports','audioports','videoports','phoneports','serial','jtag','gpios'], diff:true},
	{group:'Other',		fields:['bootloader','installationmethods','recoverymethods','powersupply','outdoor','unsupported_functions'], diff:false},
];


// Compare functions ##########################################################################################################

function tohCompareHas(id){
	return toh_compare.indexOf(id) > -1;
}

// Add / remove a device. Returns false when the pick was refused. -----------
function tohCompareToggle(id, wanted){
	if(!id){
		return false;
	}
	const at=toh_compare.indexOf(id);
	if(wanted && at === -1){
		if(toh_compare.length >= toh_compare_max){
			return false;
		}
		toh_compare.push(id);
	}
	else if(!wanted && at > -1){
		toh_compare.splice(at,1);
	}
	tohCompareSync();
	return true;
}

function tohCompareClear(){
	toh_compare=[];
	tohCompareSync();
	tohCloseCompare();
}

// Reflect the current selection into the checkboxes, the tray and the URL ---
function tohCompareSync(){
	myLogFunc();
	$('#toh-table .toh-compare-check').each(function(){
		const on=tohCompareHas($(this).attr('data-id'));
		$(this).prop('checked', on);
		// a full tray must not look clickable on the rows that are not in it
		$(this).prop('disabled', !on && toh_compare.length >= toh_compare_max);
	});

	const n=toh_compare.length;
	$('#toh-compare-count').text(n);
	$('#toh-compare-tray').toggleClass('toh-hidden', n === 0);
	$('#toh-compare-open').prop('disabled', n < 2);

	// the chips naming what is currently picked
	let chips='';
	toh_compare.forEach(id => {
		const row=tohCompareRowData(id);
		const name=row ? (row.brand + ' ' + row.model) : id;
		chips +='<span class="toh-compare-chip">' + name
			+ '<a href="#" class="toh-compare-drop" data-id="' + id + '" title="Remove">' + tohIcon('x') + '</a></span>';
	});
	$('#toh-compare-chips').html(chips);

	buildBrowserUrl();
	if($('#toh-compare-panel').is(':visible')){
		tohBuildCompare();				// keep an open comparison in step
	}
}

// Find a device's row by its id --------------------------------------------
function tohCompareRowData(id){
	const rows=tabuTable.getRows().filter(r => r.getData().deviceid === id);
	if(rows.length){
		return rows[0].getData();
	}
	// the device may be filtered out of the active rows
	const all=tabuTable.getData().filter(d => d.deviceid === id);
	return all.length ? all[0] : null;
}

// The checkbox in the table -------------------------------------------------
function FormatterCompare(cell, formatterParams, onRendered) {
	const id=cell.getRow().getData().deviceid;
	if(!id){
		return '';
	}
	const on=tohCompareHas(id);
	const full=!on && toh_compare.length >= toh_compare_max;
	return '<input type="checkbox" class="toh-compare-check" data-id="' + id + '"'
		+ (on ? ' checked' : '') + (full ? ' disabled' : '')
		+ ' title="Compare this device">';
}

// Render one field for the comparison --------------------------------------
// Reuses the column's own formatter so badges and icons look like the table.
function tohCompareCell(field, data){
	const col=getMyColumnDefinition(field);
	if(!col){
		return '';
	}
	const value=data[field];
	let column=null;
	try { column=tabuTable.getColumn(field); } catch(e) {}
	const formatter=(column ? column.getDefinition().formatter : col.formatter) || null;

	let out=value;
	if(typeof formatter === 'function'){
		const params=col.formatterParams ? JSON.parse(JSON.stringify(col.formatterParams)) : undefined;
		out=formatter({
			getValue: () => value,
			getField: () => field,
			getRow: () => ({getData: () => data}),
			getColumn: () => column,
			getElement: () => document.createElement('div'),
		}, params);
	}
	out=out instanceof Node ? out.outerHTML : (out === null || out === undefined ? '' : String(out));
	if(out === '' || out === 'null' || out === '-'){
		return '<span class="toh-compare-none">&mdash;</span>';
	}
	return out;
}

// Are these values all the same? -------------------------------------------
function tohCompareSame(values){
	const norm=values.map(v => JSON.stringify(v === undefined ? null : v));
	return norm.every(v => v === norm[0]);
}

// Build the comparison matrix ----------------------------------------------
function tohBuildCompare(){
	myLogFunc();
	const devices=toh_compare.map(tohCompareRowData).filter(Boolean);
	if(devices.length < 2){
		$('#toh-compare-body').html('<p class="toh-compare-empty">Pick at least two devices to compare.</p>');
		return;
	}

	const by_ref=$('#toh-compare-ref').is(':checked');
	const diff_only=$('#toh-compare-diffonly').is(':checked');

	let html='<table class="toh-compare-table"><thead><tr><th class="toh-compare-rowhead"></th>';
	devices.forEach((d,i) => {
		const is_ref=by_ref && i === 0;
		html +='<th' + (is_ref ? ' class="is-ref"' : '') + '>'
			+ '<span class="toh-compare-brand">' + d.brand + '</span>'
			+ '<span class="toh-compare-model">' + d.model + '</span>'
			+ (is_ref ? '<span class="toh-compare-reftag">Reference</span>' : '')
			+ '</th>';
	});
	html +='</tr></thead><tbody>';

	toh_compare_rows.forEach(section => {
		let rows='';
		section.fields.forEach(field => {
			const col=getMyColumnDefinition(field);
			if(!col){
				return;
			}
			const raw=devices.map(d => d[field]);
			// a row where nobody has a value tells you nothing
			if(raw.every(v => v === null || v === undefined || v === '' || v === '-')){
				return;
			}
			const differs=section.diff && !tohCompareSame(raw);
			if(diff_only && !differs){
				return;					// "only rows that differ"
			}
			rows +='<tr' + (differs ? ' class="is-diff"' : '') + '>'
				+ '<th class="toh-compare-rowhead">' + (col.headerTooltip || col.title) + '</th>';
			const first=JSON.stringify(raw[0] === undefined ? null : raw[0]);
			devices.forEach((d,i) => {
				// in reference mode every cell is judged against the first device,
				// rather than only flagging that the row differs somewhere
				let cls='';
				if(by_ref && section.diff){
					if(i === 0){
						cls=' class="is-ref"';
					}
					else if(JSON.stringify(raw[i] === undefined ? null : raw[i]) !== first){
						cls=' class="is-off-ref"';
					}
				}
				rows +='<td' + cls + '>' + tohCompareCell(field, d) + '</td>';
			});
			rows +='</tr>';
		});
		if(rows){
			html +='<tr class="toh-compare-section"><th class="toh-compare-rowhead">' + section.group + '</th>'
				+ '<td colspan="' + devices.length + '"></td></tr>' + rows;
		}
	});

	html +='</tbody></table>';
	$('#toh-compare-body').html(html);

	const diffs=$('#toh-compare-body tr.is-diff').length;
	$('#toh-compare-diffcount').text(diffs);
	if(diff_only && diffs === 0){
		$('#toh-compare-body').html('<p class="toh-compare-empty">These devices match on every compared field.</p>');
	}
}

function tohOpenCompare(){
	if(toh_compare.length < 2){
		return;
	}
	tohBuildCompare();
	$('#toh-compare-panel').removeClass('toh-hidden');
	$('#toh-main, #toh-hero').addClass('toh-hidden');
	$('body').removeClass('toh-sidebar-open');
	window.scrollTo(0,0);
}

function tohCloseCompare(){
	$('#toh-compare-panel').addClass('toh-hidden');
	$('#toh-main, #toh-hero').removeClass('toh-hidden');
}

// Restore a comparison from the URL ----------------------------------------
// Split in two on purpose: SetDefaults() rewrites the address bar from the
// filter and column state, which would drop a compare= it does not know about.
// So read the parameter before that runs, and apply it once the table exists.
function tohCompareReadUrl(){
	const raw=getUrlParameter('compare');
	if(!raw){
		return;
	}
	toh_compare=raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, toh_compare_max);
	myLogStr('Compare from URL: ' + toh_compare.join(', '), 2);
}

function tohCompareApply(){
	if(toh_compare.length === 0){
		return;
	}
	// drop ids that are not in the data at all, rather than showing blank columns
	toh_compare=toh_compare.filter(id => tohCompareRowData(id) !== null);
	tohCompareSync();
	if(toh_compare.length >= 2){
		tohOpenCompare();
	}
}
