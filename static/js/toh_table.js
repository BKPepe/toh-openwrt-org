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
// toh_table.js
//
//	Everything Tabulator calls back into: row and cell formatters,
//	header filters, sorters and the details popup.

// Functions for Cell Model Popup Formatter ###################################################################################

// get my Columns definitions -----------------------------------
function getMyColumnDefinition(field){
	let cols=toh_colStyles;
	let col={};
	if(typeof(cols[field]) != 'undefined' ){
		col=cols[field];
		if(typeof(col.headerTooltip) != 'undefined' && col.headerTooltip !==''){
			col.f_title=col.headerTooltip;
		}
		else if(typeof(col.title) != 'undefined' && col.title !==''){
			col.f_title=col.title;
		}
		else{
			col.f_title=field;
		}
	}
	else{
		col.f_title=field;
	}
	return col;
}

// Row density ###############################################################

// Switch how tall the rows are ----------------------------------------------
// Tabulator sizes its rows from options.rowHeight and getTableRowHeight() reads
// the same value, so the option has to change as well as the CSS.
function tohApplyDensity(key, save=true){
	if(!toh_densities[key]){
		key=toh_prefs.def_density;
	}

	$('.toh-density-but').each(function(){
		const on=$(this).attr('data-density') === key;
		$(this).attr('aria-pressed', on ? 'true' : 'false');
	});

	tabulatorOptions.rowHeight=toh_densities[key];
	// the stylesheet gets the same number: redraw() reuses the row elements
	// Tabulator already sized inline, so the option alone does not resize them
	document.body.style.setProperty('--row-h', toh_densities[key]+'px');
	// the class lets CSS drop the brand line of the Device column in compact rows
	$('body').toggleClass('toh-density-compact', key === 'compact');

	if(typeof tabuTable !== 'undefined' && tabuTable && toh_table_inited){
		tabuTable.redraw(true);
		setTableHeight($('.tabulator-page-size').val() || tabulatorOptions.paginationSize);
	}
	if(save){
		saveCookie(toh_prefs.cook_name_density, key, false, 'string');
	}
}


// ############################################################################################################################
// Tabulator Callbacks function ###############################################################################################
// ############################################################################################################################


// Split a formatted cell into one table row per link ------------------------
function tohDetailsLinkRows(html){
	const holder=document.createElement('div');
	holder.innerHTML=html;
	const anchors=holder.querySelectorAll('a');
	if(anchors.length === 0){
		return '';
	}
	let out='';
	anchors.forEach(a => {
		out +="<tr><td class='toh-details-link' colspan='2'>" + a.outerHTML + "</td></tr>";
	});
	return out;
}


// Format Tabulator Rows -----------------------------------------------------------
function tabuRowFormatter(row){
	var data = row.getData();
	if(data.brand === "OpenWrt"){
		row.getElement().classList.add("brand-owrt");
	}
}



// "Device" : the brand above the model -------------------------------------
function FormatterDevice(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const model=cell.getValue();
	return "<span class='toh-dev'>"
		+ (row.brand ? "<span class='toh-dev-brand'>" + tohAttr(row.brand) + "</span>" : "")
		+ "<span class='toh-dev-model'>"
		+ tohAttr(model === null || model === undefined ? '' : model) + "</span>"
		+ "</span>";
}

// Header filter of the Device column ----------------------------------------
// The cell shows brand and model, so both are searched. Every word typed has to
// appear somewhere in them: "turris omnia" finds "Turris CZ.NIC" + "Omnia".
function HeaderFilterFuncDevice(headerValue, rowValue, rowData, filterParams){
	const needle=String(headerValue === null || headerValue === undefined ? '' : headerValue).trim().toLowerCase();
	if(needle === ''){
		return true;
	}
	const hay=(String(rowData.brand || '') + ' '
		+ String(rowValue === null || rowValue === undefined ? '' : rowValue)).toLowerCase();
	return needle.split(/\s+/).every(t => hay.indexOf(t) > -1);
}

// Sorter of the Device column: by brand, then by model ----------------------
// Tabulator calls a sorter once per pair of rows, so the collator is shared and
// the sort key is cached on the row data.
const toh_dev_collator=new Intl.Collator('en', {sensitivity:'base', numeric:true});

function _devSortKey(data){
	if(data.__devkey === undefined){
		data.__devkey=String(data.brand || '') + ' ' + String(data.model || '');
	}
	return data.__devkey;
}

function SorterDevice(a, b, aRow, bRow, column, dir, sorterParams){
	return toh_dev_collator.compare(_devSortKey(aRow.getData()), _devSortKey(bRow.getData()));
}


// "CPU" : the chip, and what it runs at -------------------------------------
// Cores and clock go under the chip name. Sorting and the header filter work
// on the chip name only.
function FormatterCpu(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const name=FormatterCleanWords(cell, formatterParams, onRendered);
	if(!name){
		return "";
	}
	const bits=[];
	if(row.cpucores && String(row.cpucores) !== '-'){
		bits.push(tohAttr(row.cpucores) + '×');
	}
	if(row.cpumhz && String(row.cpumhz) !== '-' && !isNaN(row.cpumhz)){
		bits.push(tohAttr(row.cpumhz) + ' MHz');
	}
	return "<span class='toh-stack'><span class='toh-stack-main'>" + name + "</span>"
		+ (bits.length ? "<span class='toh-stack-sub'>" + bits.join(' ') + "</span>" : "")
		+ "</span>";
}

// "Wi-Fi" : which bands the device has --------------------------------------
function FormatterWifi(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const has=v => v && String(v).trim() !== '' && String(v).trim() !== '-';
	const bands=[];
	if(has(row.wlan24ghz)){ bands.push('2.4'); }
	if(has(row.wlan50ghz)){ bands.push('5'); }
	if(has(row.wlan60ghz)){ bands.push('6'); }
	if(has(row.wlan600ghz)){ bands.push('60'); }
	if(!bands.length){
		return "<span class='toh-none'>&mdash;</span>";
	}
	// the per-band modes, for the second line and the tooltip
	const modes=[row.wlan24ghz, row.wlan50ghz, row.wlan60ghz, row.wlan600ghz]
		.filter(has).map(v => String(v).trim()).join(' / ');
	return "<span class='toh-stack' title='" + tohAttr(modes) + "'>"
		+ "<span class='toh-stack-main'>" + bands.join(' / ') + " GHz</span>"
		+ "<span class='toh-stack-sub'>" + tohAttr(modes) + "</span></span>";
}

// "Ethernet" : the ports, largest first -------------------------------------
function FormatterEthernet(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const parts=[];
	[['ethernet10gports','10G'], ['ethernet5gports','5G'], ['ethernet2_5gports','2.5G'],
	 ['ethernet1gports','1G'], ['ethernet100mports','100M']].forEach(([f,label]) => {
		const n=parseInt(row[f], 10);
		if(n > 0){ parts.push(n + '× ' + label); }
	});
	if(!parts.length){
		return "<span class='toh-none'>&mdash;</span>";
	}
	return "<span class='toh-stack'><span class='toh-stack-main'>" + parts[0] + "</span>"
		+ (parts.length > 1 ? "<span class='toh-stack-sub'>" + parts.slice(1).join(', ') + "</span>" : "")
		+ "</span>";
}


// "Links" : the five places this device is written about --------------------
// Fixed order: TitleLinks() draws the same icons in the column header.
const toh_link_kinds=[
	{field:'devicepage',			icon:'info',		label:'Device information page'},
	{field:'VIRT_hwdata',			icon:'database',	label:'Hardware data page'},
	{field:'oemdevicehomepageurl',	icon:'factory',		label:'Manufacturer page'},
	{field:'wikideviurl',			icon:'book-open',	label:'Wiki page'},
	{field:'owrt_forum_topic_url',	icon:'user',		label:'Forum topic'},
];

function _linkUrlFor(kind, row){
	if(kind.field === 'devicepage'){
		return row.devicepage ? toh_urls.www + String(row.devicepage).replace(/:/g,'/') : '';
	}
	if(kind.field === 'VIRT_hwdata'){
		return row.deviceid ? _maketHwDataUrl(row.deviceid) : '';
	}
	return row[kind.field] || '';
}

function FormatterLinks(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	let out='', any=false;
	toh_link_kinds.forEach(kind => {
		const url=tohSafeUrl(_linkUrlFor(kind, row));
		if(!url){
			// an empty slot, so the icons after it stay under their icon in the header
			out +="<span class='toh-link toh-link-off' aria-hidden='true'></span>";
			return;
		}
		any=true;
		out +="<a class='toh-link' href='" + tohAttr(url) + "' target='_blank' rel='noopener'"
			+ " title='" + tohAttr(kind.label) + "' aria-label='" + tohAttr(kind.label) + "'>"
			+ tohIcon(kind.icon) + "</a>";
	});
	return any ? "<span class='toh-links'>" + out + "</span>" : "";
}

// Header of the Links column: the same icons in the same order.
function TitleLinks(cell, formatterParams, onRendered){
	return "<span class='toh-links-title'>"
		+ toh_link_kinds.map(k => tohIcon(k.icon)).join('')
		+ "</span>";
}


// "Download" : which release you would actually get -------------------------
// The firmware selector is used when it has a build for the device. Otherwise
// the URL recorded on the wiki is offered, labelled with its release.
function FormatterDownload(cell, params, onRendered){
	const row=cell.getRow().getData();

	if(toh_firmwares_fetched && row.deviceid && row.target){
		const url=GetFirmwareSelectUrl(_makeFirmwareProfileId(row.deviceid),
			row.target + '/' + row.subtarget);
		if(url){
			return "<a class='toh-dl toh-dl-current' href='" + tohAttr(tohSafeUrl(url)) + "' target='_blank' rel='noopener'"
				+ " title='Get OpenWrt " + tohAttr(toh_stable_version) + " for this device from the Firmware Selector'>"
				+ tohIcon('cloud-download') + tohAttr(toh_stable_version) + "</a>";
		}
	}

	const rawRecorded=row.firmwareopenwrtinstallurl || row.firmwareopenwrtupgradeurl;
	const recorded=tohSafeUrl(Array.isArray(rawRecorded)
		? rawRecorded.find(v => v !== null && v !== '' && v !== '-')
		: rawRecorded);
	if(recorded){
		const rel=String(recorded).match(/releases\/([0-9][0-9.]*[0-9])/);
		return "<a class='toh-dl toh-dl-old' href='" + tohAttr(recorded) + "' target='_blank' rel='noopener'"
			+ " title='No current build for this device. The last image recorded on the wiki is"
			+ (rel ? " from " + rel[1] : " of unknown age") + ".'>"
			+ tohIcon('clock') + (rel ? rel[1] : 'older') + "</a>";
	}

	return "<span class='toh-dl toh-dl-none' title='No OpenWrt image for this device'>&mdash;</span>";
}


// Column header of an icon-only column ---------------------------------------
// Shows the icon the cells use; the name is in the header tooltip. `title`
// stays a word because the CSV export and the column picker use it.
function TitleIcon(cell, formatterParams, onRendered){
	const def=cell.getColumn().getDefinition();
	const icon=def.formatterParams && def.formatterParams.icon;
	return icon ? tohIcon(icon) : def.title;
}

// Header icon from an explicit `titleIcon` on the column ---------------------
// For Fav and Cmp, whose cells have no formatterParams icon to borrow.
function TitleNamedIcon(cell, formatterParams, onRendered){
	const def=cell.getColumn().getDefinition();
	return def.titleIcon ? tohIcon(def.titleIcon) : def.title;
}


// Downloads, in the details view ---------------------------------------------
// The install and upgrade URLs recorded on the wiki can point at old releases,
// so they are listed with their release under the button for the current one.
function tohDeviceDownloadsHtml(data){
	let out='';

	if(toh_firmwares_fetched && data.deviceid && data.target){
		const url=GetFirmwareSelectUrl(_makeFirmwareProfileId(data.deviceid),
			data.target + '/' + data.subtarget);
		if(url){
			out +="<a class='toh-but toh-but-primary toh-dlrow-main' href='" + tohAttr(tohSafeUrl(url)) + "'"
				+ " target='_blank' rel='noopener'>" + tohIcon('cloud-download')
				+ " Download OpenWrt " + tohAttr(toh_stable_version) + "</a>";
		}
	}

	let older='';
	[['firmwareopenwrtinstallurl','Install image'],
	 ['firmwareopenwrtupgradeurl','Upgrade image']].forEach(([field,label]) => {
		// these columns hold arrays: take the first usable URL, as FormatterLink does
		const url=tohSafeUrl(Array.isArray(data[field])
			? data[field].find(v => v !== null && v !== '' && v !== '-')
			: data[field]);
		if(!url){
			return;
		}
		const rel=String(url).match(/releases\/([0-9][0-9.]*[0-9])/);
		older +="<a class='toh-dlrow-old' href='" + tohAttr(url) + "' target='_blank' rel='noopener'>"
			+ tohIcon('file-down') + label
			+ "<span class='toh-dlrow-rel'>" + (rel ? rel[1] : 'unknown release') + "</span></a>";
	});

	if(!out && !older){
		return '';
	}
	return "<div class='toh-dlrow'>" + out
		+ (older ? "<div class='toh-dlrow-olders'>"
			+ (out ? "<span class='toh-dlrow-note'>Older images from the wiki:</span>" : "")
			+ older + "</div>" : "")
		+ "</div>";
}


// Device details #############################################################################################################

// The inside of the details view, built from a row ---------------------------
// Shared by CellPopupModel() and the phone card list, which has no cell.
function tohDeviceDetailsHtml(row){
	// Build initial popup HTML structure with brand and model title
	var data = row.getData();
	// chips under the name: chipset, target, RAM and flash
	var chips = '';
	if(data.cpu && data.cpu !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-facet' data-type='chipset' data-value='" + tohAttr(data.cpu) + "'"
			+ " title='See every device using this chipset'>"
			+ tohIcon('cpu') + "<span class='toh-details-chip-key'>Chipset</span>" + tohAttr(data.cpu) + "</a>";
	}
	if(data.target && data.target !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-facet' data-type='target' data-value='" + tohAttr(data.target) + "'"
			+ " title='Every device on this target'>"
			+ tohIcon('layers') + "<span class='toh-details-chip-key'>Target</span>" + tohAttr(data.target)
			+ (data.subtarget && data.subtarget !== '-' ? ' / ' + tohAttr(data.subtarget) : '') + "</a>";
	}
	// clicking RAM or flash filters the table to devices with at least that much
	if(data.rammb && data.rammb !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-atleast' data-field='rammb' data-value='" + tohAttr(data.rammb) + "'"
			+ " title='Devices with at least this much RAM'>"
			+ tohIcon('memory-stick') + "<span class='toh-details-chip-key'>RAM</span>" + tohAttr(data.rammb) + " MB</a>";
	}
	if(data.flashmb){
		const flash = tohArrayText(data.flashmb, 'MB');
		// `flash` is the display text ("128 MB NAND"); the filter needs the bare
		// number, so take the first digit run. A value without one ("eMMC +
		// microSDHC") gets a chip that is not a link.
		const plain = flash.match(/\d+/);
		if(flash && flash !== '-'){
			const label = tohIcon('hard-drive') + "<span class='toh-details-chip-key'>Flash</span>"
				+ tohAttr(flash);
			chips += plain
				? "<a href='#' class='toh-details-chip js-toh-atleast' data-field='flashmb' data-value='" + tohAttr(plain[0]) + "'"
					+ " title='Devices with at least this much flash'>" + label + "</a>"
				: "<span class='toh-details-chip'>" + label + "</span>";
		}
	}

	// the support state, shown as a notice above the details
	var state = tohSupportState(data);
	var avail = String(data.availability === null || data.availability === undefined ? '' : data.availability);

	// what OpenWrt cannot drive on this device - the field FormatterRelease()
	// shows as a warning triangle
	let caveat=data.unsupported_functions;
	if(Array.isArray(caveat)){ caveat=caveat.join(', '); }
	caveat=String(caveat === null || caveat === undefined ? '' : caveat).trim();
	if(caveat === '-'){ caveat=''; }
	const neverSupported=/^never supported$/i.test(caveat);

	var notice = '';
	if(neverSupported){
		// skip the release-based notices below, which would say "unknown"
		notice = "<div class='toh-notice is-dead'>" + tohIcon('triangle-alert')
			+ "<span><b>Not supported.</b> OpenWrt does not run on this device.</span></div>";
	}
	else if(state === 'eol'){
		// supportedsincerel is the first release that supported the device, so
		// it cannot be named here as the last one
		notice = "<div class='toh-notice is-dead'>" + tohIcon('triangle-alert')
			+ "<span><b>No longer maintained.</b> OpenWrt has dropped support for this device, "
			+ "so current releases cannot be installed.</span></div>";
	}
	else if(state === 'snapshot'){
		notice = "<div class='toh-notice is-pending'>" + tohIcon('triangle-alert')
			+ "<span><b>Snapshot only.</b> No stable release supports this device yet &mdash; "
			+ "the only builds are daily development snapshots, which are untested.</span></div>";
	}
	else if(state === 'unknown'){
		notice = "<div class='toh-notice is-pending'>" + tohIcon('circle-help')
			+ "<span><b>Support unknown.</b> Nobody has recorded which release supports this device.</span></div>";
	}

	// a device on a current release can still have parts OpenWrt cannot drive
	if(caveat && !neverSupported){
		notice += "<div class='toh-notice is-pending'>" + tohIcon('triangle-alert')
			+ "<span><b>Partly supported.</b> Does not work under OpenWrt: " + tohAttr(caveat) + ".</span></div>";
	}

	if(/^discontinued/i.test(avail)){
		const year = avail.match(/\d{4}/);
		notice += "<div class='toh-notice is-quiet'>" + tohIcon('info')
			+ "<span><b>Discontinued" + (year ? " in " + year[0] : "") + ".</b> "
			+ "No longer sold new; only available second-hand.</span></div>";
	}

	tohDeviceUrlSet(data.deviceid);		// the open device gets a URL

	var contents = "<div class='toh-details-border'>" +
		"<div class='toh-details-head'>" +
			"<div class='toh-details-headings'>" +
				"<b class='toth-details-title'>" +
					"<a href='#' class='js-toh-facet' data-type='brand' data-value='" + tohAttr(data.brand) + "' title='All " + tohAttr(data.brand) + " devices'>" + tohAttr(data.brand) + "</a>" +
					" - " + tohAttr(data.model) +
				"</b>" +
				(chips ? "<div class='toh-details-chips'>" + chips + "</div>" : "") +
				(data.deviceid ? "<a class='toh-details-edit' href='" + tohAttr(_maketHwDataUrl(data.deviceid)) + "' target='_blank' rel='noopener' title='Correct or complete this device on the OpenWrt wiki'>" + tohIcon('pencil') + " Edit on the wiki</a>" : "") +
			"</div>" +
			"<div class='toh-details-close'>"+tohIcon('circle-x')+"</div>" +
		"</div>" +
		(notice ? "<div class='toh-details-notices'>" + notice + "</div>" : "") +
		tohDeviceDownloadsHtml(data) +
		"<div class='toh-details-content'>";

	// Map column fields to their definitions for quick lookup
	var columns = tabuTable.getColumns();
	var columnMap = {};
	columns.forEach(col => columnMap[col.getField()] = col);

	// Iterate through column groups, excluding 'base'
	const { base, ...myColGroups } = toh_colGroups;

	// already shown by the chips above
	const inTheChips = ['cpu','target','subtarget','rammb','flashmb'];
	// already shown by tohDeviceDownloadsHtml()
	const inTheDlRow = ['VIRT_download','VIRT_firm','firmwareopenwrtinstallurl','firmwareopenwrtupgradeurl'];
	// the table's five-icon cell; here each of its links has a row of its own
	const inTheLinkRows = ['VIRT_links'];
	$.each(myColGroups, function(key, obj) {
		var done = false;
		var links = '';			// link rows, appended after the key/value rows
		$.each(obj.fields, function(f, field) {
			if(inTheChips.indexOf(field) > -1 && chips){
				return true;
			}
			if(inTheDlRow.indexOf(field) > -1 || inTheLinkRows.indexOf(field) > -1){
				return true;
			}
			// Get column definition and raw value
			var col = getMyColumnDefinition(field);
			var value = data[field];
			// A column without a formatter shows its value as text. Here that text
			// goes to innerHTML, so the fallback formatter escapes it.
			var formatter = (columnMap[field] || { getDefinition: () => col }).getDefinition().formatter || tohFormatPlain;

			// add label
			var mycol=JSON.parse(JSON.stringify(col)); //object deep copy
			if(mycol.formatterParams){
				mycol.formatterParams.label = mycol.formatterParams.ttip;
				mycol.formatterParams.short =true;
			}	

			// Apply formatter (assumes custom formatters; built-ins need lookupFormatter)
			var formattedValue = typeof formatter === "function" ?
				formatter({
					getValue: () => value,
					getField: () => field,
					getRow: () => row,
					getColumn: () => columnMap[field],
					getElement: () => document.createElement("div")
				}, mycol.formatterParams) :
				tohFormatPlain({getValue: () => value});

			// Convert to string, skip if empty or null
			formattedValue = formattedValue instanceof Node ? formattedValue.outerHTML : String(formattedValue);
			
			// exclude empty fields
			if (!formattedValue || formattedValue === 'null' || formattedValue === '-' || isGenerigImage(value) ) return true;

			if (!done) {
				contents += "<div class='toh-details-group'>\n<div class='toh-details-title'>" + obj.name + "</div>\n<table class='toh-details-table'>";
				done = true;
			}

			// link columns render their own label, so they get a full row and no key cell
			if (mycol.formatterParams && mycol.formatterParams.label) {
				// one row per link: some columns render two (origin and GitHub commit)
				links += tohDetailsLinkRows(formattedValue);
				return true;
			}

			// the full name; the column title is abbreviated
			var label = col.headerTooltip || col.title;
			contents += '<tr><td class="toh-details-key">' + label + "</td><td class='toh-details-value'>" + formattedValue + "</td></tr>";
		});
		if (done) contents += links + "</table>\n</div>";
		else if (links) {
			contents += "<div class='toh-details-group'>\n<div class='toh-details-title'>" + obj.name
				+ "</div>\n<table class='toh-details-table'>" + links + "</table>\n</div>";
		}
	});

	contents += tohSimilarHtml(data);

	contents += "</div></div><div class='toh-details-bottom'></div>";

	return contents;
}


// The cell tooltip, as text -----------------------------------------------
// Tabulator's own (tooltip:true) writes the raw cell value with innerHTML.
function TooltipText(e, cell){
	const v=cell.getValue();
	if(v === null || v === undefined || v === ''){
		return '';				// returning false would make Tabulator print the word
	}
	const el=document.createElement('div');
	el.textContent=Array.isArray(v) ? v.join(', ') : String(v);
	return el;
}

// A value shown as text, for markup built by hand --------------------------
// Used by the details view for the columns that have no formatter.
function tohFormatPlain(cell){
	const v=cell.getValue();
	if(v === null || v === undefined){
		return '';
	}
	return tohAttr(Array.isArray(v) ? v.join(', ') : v);
}


// Tabulator: Cell Popup Formatters ###########################################################################################
function CellPopupModel(e, cell, onRendered) {
	var contents = tohDeviceDetailsHtml(cell.getRow());

	// Create popup element
	var popup = document.createElement("div");
	popup.className = "toh-details-container";
	popup.innerHTML = contents;
	popup.style.opacity = 0;
	
	// make left
	const windowTopPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
	let leftMargin=246;	// 46;	
	if(window.innerWidth < 500){
		 leftMargin=7;
	}
	else if (window.innerWidth < 840){
		 leftMargin=146;
	}
	var leftPosition = Math.min(leftMargin, window.innerWidth - popup.offsetWidth - 10);
	popup.style.left = leftPosition + "px";

	// Get the row element to manage its class
	var row = cell.getRow();
	var rowElement = row.getElement();

	// Position popup after rendering
	onRendered(() => {
		setTimeout(() => {
			//Add class to the row when popup is shown
			rowElement.classList.add("popup-active");
			popup.style.left = leftPosition + "px";

			popup.style.right = "auto";
			//popup.style.top = e.clientY + "px";
			popup.style.top =(windowTopPosition +20)+'px';
			popup.style.opacity = 1;

			// Close button handler
			popup.querySelector(".toh-details-close").addEventListener("click", () => {
				if (popup.parentNode) popup.parentNode.removeChild(popup);
				rowElement.classList.remove("popup-active");			});
		}, 0);
	});

	// Restore overflow when popup is removed
	var observer = new MutationObserver((mutations) => {
		if (!document.body.contains(popup)) {
			rowElement.classList.remove("popup-active");
			tohDeviceUrlSet(null);		// the popup is closed: drop the device from the URL
			observer.disconnect();
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	return popup;
};





// Tabulator: Columns Formatters ##############################################################################################

// --------------------------------------------------------
function FormatterLink(cell, params, onRendered) {
	let		url		= params.url !=null ? params.url : cell.getValue();
	const	field	= cell.getField();
	const	row		= cell.getRow().getData();
	
	let 	device	=' ('+row.brand+' '+row.model+')';
	if(params.short){
		device='';
	}

	//specific Links
	if(field=='devicepage'){
		url= url ? toh_urls.www + url.replace(/:/g,'/') : '';
	}
	else if(field=='VIRT_hwdata'){
		const devid=cell.getRow().getData().deviceid;
		url= devid ? _maketHwDataUrl(devid) : '';
	}
	else if(field=='VIRT_firm' && !params.recursive){
		const id		= _makeFirmwareProfileId(row.deviceid);
		const target	= row.target + '/' + row.subtarget;
		if(!toh_firmwares_fetched){
			params.recursive=true;
			params.ttip="Failed to fetch firmwares";
			params.icon="triangle-alert dlerror";
			params.url='#';
			params.short=true;
			return FormatterLink(cell,params,onRendered);
		}
		url 		= GetFirmwareSelectUrl(id, target);
	}


	if (url && url.length > 0) {
		const prefix= params.prefix !=null ? params.prefix : '';
		const ttip = params.ttip !=null ? params.ttip+device : '';
		const label= params.label !=null ? params.label : '';
		const icon = params.icon !=null ? tohIcon(params.icon)+' ' : '';
		// url can be an array (wikideviurl, the firmware columns): take the first
		// usable member before the prefix is added
		const one=Array.isArray(url) ? url.find(v => v !== null && v !== '' && v !== '-') : url;
		if(one === undefined || one === null || one === ''){
			return '';
		}
		// checked after composing: for forumsearch and gitsearch the cell value is
		// a search term, and only prefix + value is a URL
		const href=tohSafeUrl(prefix + one);
		if(!href){
			return '';
		}
		return '<a href="' + tohAttr(href) + '" target="_blank" rel="noopener" title="'+tohAttr(ttip)+'" class="tlink '+field+'">' + icon + label + '</a>'
	}
	return '';
}

// --------------------------------------------------------
function FormatterLinkCommit(cell, params={}, onRendered) {
	const value = cell.getValue();
	if (value && value.length > 0) {
		var html ='';
		const label=params.label;
		const commit=value.replace(/.*?;h=/g,'');

		params.icon='git-commit-horizontal';
		params.ttip='Origin Commit';
		if(label){params.label=params.ttip;}
		params.ttip +=" "+commit;
		params.url=value;
		html +=FormatterLink(cell, params, onRendered);

		html +="<span class='toh-spacer'></span>";

		params.icon='git-branch';
		params.ttip='GitHub Commit';
		if(label){params.label=params.ttip;}
		params.ttip +=" "+commit;
		params.url=toh_urls.github_commit + commit;
		html +=FormatterLink(cell, params, onRendered);

		return html;
	} 
	return '';
}


// --------------------------------------------------------
function isGenerigImage(url){
	var tmp;
	if (typeof url === "string"){
		tmp=url;
	}
	else if(Array.isArray(url) && url.length > 0){
		tmp=url[0];
	}
	else{
		return false;
	}

	if(tmp.match(/genericrouter1.png$/)){
		return true;
	}
	return false;
}


// --------------------------------------------------------
function FormatterImages(cell, formatterParams, onRendered) {
	var arr = cell.getValue();
	var url='';
	var urls=[];
	var generic=false;
	if (Array.isArray(arr) && arr.length > 0) {
		arr.forEach((value, index) => {
			value=String(value);
			if(value.match(/^http/)){
				url=value;
			}
			else{
				value=value.replace(/:/g,'/');
				url=toh_urls.media + value;
			}
			if(isGenerigImage(value)){
				generic=true;
				return;
			}
			// data-images is a space-separated list, so a space inside one URL
			// would read back as two
			url=tohSafeUrl(url).replace(/\s/g,'%20');
			if(url === ''){
				return;
			}
			urls.push(url);

			// preload images --------
			//const img = new Image();
			//img.src = url;

			if (!toh_img_urls.includes(url)) {
				toh_img_urls.push(url);
			}

		});

		if(urls.length == 0){
			// this device has no photo, only the shared placeholder drawing.
			// Marking it is useful, offering it to open is not, so this is not
			// a link: there is nothing to preview and nothing worth opening.
			if(generic){
				return '<span class="cell-image generic" title="No picture for this device">'+tohIcon('image')+'</span> ';
			}
			return '';
		}

		// A handful of devices carry up to six pictures, and one icon each
		// overflowed the column. One icon stands for the whole set instead, with
		// the count on it, and the lightbox pages through them.
		// wiki-supplied image URLs, in an href and in an attribute the lightbox reads
		var out='<a href="' + tohAttr(urls[0]) + '" target="_blank" rel="noopener" class="cell-image"';
		out +=' data-images="' + tohAttr(urls.join(' ')) + '"';
		out +=' title="' + (urls.length > 1 ? urls.length + ' pictures' : 'Picture') + '">';
		out +=tohIcon('image');
		if(urls.length > 1){
			out +='<span class="cell-image-count">' + urls.length + '</span>';
		}
		out +='</a> ';
		return out;
	}
	return '';
}

// --------------------------------------------------------
function FormatterCleanEmpty(cell, formatterParams, onRendered) {
	var value = cell.getValue();
	if (value && value.length > 0) {
		value=value.replace(/-/g,'');
		return tohAttr(value);		// wiki text, and the caller puts it in innerHTML
	}
	return "";
}

// --------------------------------------------------------
function FormatterCleanWords(cell, formatterParams, onRendered) {
	var value = cell.getValue();
	if (value && value.length > 0) {
		// Escape before substituting: the "&gt;" below is markup, and escaping
		// afterwards would print the entity. The result goes to innerHTML.
		value=tohAttr(value);
		value=value.replace(/more than/g,'&gt;'); // for GPIOs
		value=value.replace(/Qualcomm Atheros/g,'Atheros'); //  for CPU
		return value;
	}
	return "";
}

// --------------------------------------------------------
// Plain-text form of an array value: ["8","eMMC"] -> "8 MB + eMMC" -----------
// Returns unescaped text: the caller escapes it.
function tohArrayText(arr, unit){
	if(arr === null || arr === undefined || arr === ''){
		return '';
	}
	if(!Array.isArray(arr)){
		arr=[arr];			// a scalar "8" gets its unit too
	}
	return arr.map(value => {
		value=String(value).replace(/NAND/g,' NAND'); // for Flash
		value=value.replace(/Qualcomm Atheros/g,'Atheros'); // for WLAN Hardware
		if(unit){
			// "8" -> "8 MB", "128 NAND" -> "128 MB NAND". A value without a
			// leading number (eMMC, microSD) is left alone.
			value=value.replace(/^(\d+)(?=\s|$)/, '$1 ' + unit);
		}
		return value;
	}).join(' + ');
}

function FormatterArray(cell, formatterParams, onRendered) {
	var arr = cell.getValue();
	if (Array.isArray(arr) && arr.length > 0) {
		// wiki text into innerHTML: escape it
		return tohAttr(tohArrayText(arr, formatterParams && formatterParams.unit));
	}
	// a scalar reaches innerHTML the same way, so it is escaped too
	if(arr != null && arr !== ''){
		return tohAttr(arr);
	}
	return arr;
}
// --------------------------------------------------------
// Renders a coloured status pill: green = shipping release, amber = only
// snapshot / uncertain, red = end of life.
function _formatBadge(label, kind){
	if(label === null || label === undefined || label === '' || label === '-'){
		return '<span class="toh-badge toh-badge-none">&mdash;</span>';
	}
	// no title: next to the release its tooltip would compete with the one on
	// the warning triangle
	return '<span class="toh-badge toh-badge-'+kind+'">'+tohAttr(label)+'</span>';
}

// "Supported current release" -----------------------------
function FormatterRelease(cell, formatterParams, onRendered) {
	const value=cell.getValue();
	const v=typeof value === 'string' ? value.trim() : value;

	// what does not work under OpenWrt on this device, whatever the release
	const row=typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
	let caveat=row.unsupported_functions;
	if(Array.isArray(caveat)){ caveat=caveat.join(', '); }
	caveat=String(caveat === null || caveat === undefined ? '' : caveat).trim();
	if(caveat === '-'){ caveat=''; }

	// "Never supported" is shown as its own state, whatever the release field holds
	if(/^never supported$/i.test(caveat)){
		return _formatBadge('Not supported','dead');
	}

	let badge;
	if(!v || v === '-'){
		badge=_formatBadge(null);
	}
	else if(v.toLowerCase() === 'eol'){
		badge=_formatBadge('EOL','dead');
	}
	else if(v.toLowerCase() === 'snapshot'){
		badge=_formatBadge('Snapshot','pending');
	}
	else{
		badge=_formatBadge(v,'ok');			// a numbered release
	}

	if(caveat){
		badge +="<span class='toh-caveat' title='Does not work under OpenWrt: " + tohAttr(caveat) + "'>"
			+ tohIcon('triangle-alert') + "</span>";
	}
	return badge;
}

// "Availability" ------------------------------------------
function FormatterAvailability(cell, formatterParams, onRendered) {
	const value=cell.getValue();
	const v=typeof value === 'string' ? value.trim() : value;
	if(!v || v === '-'){
		return _formatBadge(null);
	}
	const low=v.toLowerCase();
	if(low.startsWith('available')){
		return _formatBadge(v,'ok');
	}
	if(low.startsWith('discontinued')){
		return _formatBadge(v,'dead');
	}
	return _formatBadge(v,'pending');		// "unknown <year>" and anything else
}

// --------------------------------------------------------
function FormatterYesNo(cell, formatterParams, onRendered) {
	var value = cell.getValue();
	var icon;
	if (typeof value === "string") {
		value=value.toLowerCase().trim();
	}
	// an unfilled field comes back as null, which is the 'empty' case and not the
	// 'something odd is in here' one: two thirds of the JTAG column is null
	else if(value === null || value === undefined){
		value='';
	}
	if(value=='yes'){
		icon='check toh-mark-yes';
	}
	else if(value=='no'){
		icon='x toh-mark-no';
	}
	else if(value=='-'){
		icon='circle-help toh-mark-unknown dash';
	}
	else if(value==''){
		icon='circle-help toh-mark-unknown empty';
	}
	else{
		icon='circle-help toh-mark-unknown unknown';
	}
	return tohIcon(icon);
}





// Tabulator: header Filters ##################################################################################################

// Defines the custom HeaderFilter for the "flashmb" column ----------------------------
function HeaderFilterFlash(cell, onRendered, success, cancel, editorParams){
	// One input for both filters: digits set the minimum, anything else
	// searches the text ("NAND", "eMMC").
	var input = document.createElement("input");
	input.setAttribute("type", "text");
	input.style.padding		= "4px";
	input.style.width		= "100%";
	input.style.boxSizing	= "border-box";
	input.setAttribute("placeholder", "Min / text");
	input.setAttribute("title", "A number filters by minimum MB; text searches, e.g. NAND or eMMC");

	// restore what a redraw hands back: the stored value is the object below
	var prev = cell.getValue();
	if(prev && typeof prev === 'object'){
		input.value = prev.minimum || prev.search || '';
	}

	function buildValues(){
		var v = input.value.trim();
		// HeaderFilterFuncFlash, the URL restore and the saved presets all expect
		// the {minimum, search} shape
		success(/^\d+$/.test(v)
			? {minimum: v,	search: ''}
			: {minimum: '',	search: v});
		if(v === ''){
			// Tabulator does not fire 'dataFiltered' when the field is emptied, so
			// re-evaluate the rows by hand. setHeaderFilterValue() would rebuild
			// this header cell and take the focus away from the input.
			tabuTable.refreshFilter();
		}
	}

	// events ---
	input.addEventListener("change",	buildValues);
	input.addEventListener("blur", 		buildValues);
	input.addEventListener("keyup",		buildValues); // for empty

	return input;
 }

// Handle custom HeaderFilter's logic for the 'flashmb' colum ---------------------------------------------
function HeaderFilterFuncFlash(headerValue, rowValue, rowData, filterParams){
	var b_minimum=true;
	var b_search=true;
	//console.log('val='+rowValue);
	var m;
	if(headerValue =='' || headerValue==null || headerValue == undefined){
		return true;
	}
	
	if(headerValue.minimum != ""){
		b_minimum =  _getFlashArrayBestValue(rowValue) >= headerValue.minimum;
	}
	if(headerValue.search != ""){
		//console.log('---row='+rowValue);
		b_search=false;
		// A case-insensitive substring test. Compiling the typed text as a
		// regular expression would throw on input such as "(".
		const needle=String(headerValue.search).toLowerCase();
		// the cell can be a scalar or an array
		const parts=Array.isArray(rowValue) ? rowValue : [rowValue];
		for (const v of parts) {
			if(v != null && String(v).toLowerCase().indexOf(needle) > -1){
				b_search=true;
				break;
			}
		}
	}
	return b_minimum && b_search; //must return a boolean, true if it passes the filter.
}

// Numeric "at least" for the count columns ------------------------------------
// Tabulator's own ">=" compares these cells as strings, so "10" ranks below
// "2". A row whose count cannot be read is left out.
function HeaderFilterFuncMin(headerValue, rowValue, rowData, filterParams){
	if(headerValue === '' || headerValue === null || headerValue === undefined){
		return true;
	}
	const wanted=parseFloat(String(headerValue).replace(/[^\d.]/g,''));
	if(isNaN(wanted)){
		return true;				// not a number typed: do not hide anything
	}

	// an array cell ("1x 2.0", "1x 3.0") counts the entries it lists
	if(Array.isArray(rowValue)){
		const n=rowValue.filter(v => v !== null && v !== '' && v !== '-').length;
		return n >= wanted;
	}

	// "16", "more than 20", "2 (shared)" - take the first number in there
	const found=String(rowValue === null || rowValue === undefined ? '' : rowValue).match(/\d+/);
	if(!found){
		return false;
	}
	return Number(found[0]) >= wanted;
}

// What the visitor typed, in MB --------------------------------------------
// Does not add the +1 that _getCleanNumber() adds to a GB value in the data:
// typing "4 GB" means 4096 exactly.
function _parseRamQuery(v){
	const t=String(v === null || v === undefined ? '' : v).trim();
	if(t === ''){
		return null;
	}
	const m=t.match(/(\d+(?:\.\d+)?)\s*(G|M)B\b/i) || t.match(/(\d+(?:\.\d+)?)/);
	if(!m){
		return null;
	}
	const n=parseFloat(m[1]);
	if(isNaN(n)){
		return null;
	}
	return /^g$/i.test(m[2] || '') ? Math.round(n * 1024) : n;
}

// Handle custom HeaderFilter's logic for the 'RamMb' colum ---------------------------------------------
function HeaderFilterFuncRamMb(headerValue, rowValue, rowData, filterParams){
	const wanted=_parseRamQuery(headerValue);
	if(wanted === null){
		return true;					// nothing usable typed: hide nothing
	}
	// a row whose RAM cannot be read is left out, as in HeaderFilterFuncMin()
	const val=_getCleanNumber(rowValue, 'ram');
	if(typeof val !== 'number' || isNaN(val)){
		return false;
	}
	return val >= wanted;
}





// Tabulator: sorts ###########################################################################################################

// custom sorter for the 'flashmb' column----------------------------------------------
function SorterFlash(a, b, aRow, bRow, column, dir, sorterParams){
	var aa=_getFlashArrayBestValue(a);
	var bb=_getFlashArrayBestValue(b);
	return aa - bb;
}

// custom sorter for the 'RamMb' column----------------------------------------------
function SorterRam(a, b, aRow, bRow, column, dir, sorterParams){
	var aa=_getCleanNumber(a,'ram');
	var bb=_getCleanNumber(b,'ram');
	return Number(aa) - Number(bb);
}





// Tabulator: helpers #########################################################################################################

// ---------------------------------------------------------------------------------------
// function cellDebug(e, cell){
// 	console.log(cell);
// 	console.log(cell._cell.value);
// }

// --------------------------------------------------------
function _maketHwDataUrl(deviceid){
	// a brand holding a slash spans several namespaces, so a deviceid can carry more than one colon:
	// 'evaluation_boards:unbranded_boards:evaluation_boards_unbranded_boards_qualcomm_ap143_8m'
	return toh_urls.hwdata + deviceid.replace(/:/g,'/');
}

// turn a deviceid into a firmware-selector profile id ----
// 'avm:avm_fritzbox_4040' -> 'avm_fritzbox-4040'
function _makeFirmwareProfileId(deviceid){
	const parts	= deviceid.split(":");
	const brand	= parts.slice(0,-1).join('_');	// the brand may span several namespaces
	var model	= parts[parts.length-1];
	if(model.startsWith(brand+'_')){				// the page name usually repeats the brand
		model	= model.slice(brand.length+1);
	}
	// OpenWrt board names carry no dot: "gl.inet_gl-mt1300" -> "glinet_gl-mt1300"
	return (brand + '_' + model.replace(/_/g,'-')).replace(/\./g,'');
}

// get the best value to use in sort/filter of the 'flashmb' column ----------------------
function _getFlashArrayBestValue(arr){
	// ignore these, just in case (because JS is SOOOOOOO sensitive)
	if(arr == null){
		return '';
	}
	if( typeof(arr) !="object" ){
		return arr;
	}

	var target=0;	
	// now we can walk into the array of values, without throwing a fatal error (did I ever said I love JS ?) .....
	arr.forEach((v) => {
		// 'microSD' or 'SD' means(?) we have Gigas available, so we rank as 128G
		if(v.match(/microsd/i) || v.match(/^SD$/)){
			//console.log('SD found in :'+v);
			v=128*1024;
		}
		// eMMC size is unknown, but if it is alone, it maybe(?) means at least 1M(?)
		else if(v.match(/eMMC/i) && arr.length==1){
			v=1;
		}
		// else we bet on the higher array.member value. (We only keep the number, ignoring letters)
		else{
			// a size in GB is converted to MB: "more than 8GB NAND" -> 8192
			const gb=String(v).match(/(\d+)\s*GB\b/i);
			if(gb){
				v=Number(gb[1]) * 1024;
			}
			else{
				v=v.replace(/[^\d]+/g,'');
				v=Number(v);
			}
		}
		// target is the highest found value
		if(v > target){
			target=v;
		}
	});
	return target;
}

// create the 'isfav' filter operator, used on the deviceid field ------------------------
Tabulator.extendModule("filter", "filters", {
	"isfav":function(filtValue, rowValue, rowData, filterParams){
		return tohFavHas(rowValue);
	}
});

// What a cell should look like in an exported file -------------------------
// Arrays are written as the text the table shows.
function tohDownloadValue(value, data, type, params, column){
	if(!Array.isArray(value)){
		return value;
	}
	let unit;
	try {
		const def=column && column.getDefinition ? column.getDefinition() : null;
		unit=def && def.formatterParams ? def.formatterParams.unit : undefined;
	} catch(e) { unit=undefined; }
	return tohArrayText(value, unit);
}

// Read a count out of a wiki cell ------------------------------------------
// The wiki writes counts as free text - "4", "more than 20", "2 (shared)" - or
// as an array of port descriptors. Same rule as HeaderFilterFuncMin().
function tohCountOf(rowValue){
	if(Array.isArray(rowValue)){
		return rowValue.filter(v => v !== null && v !== '' && v !== '-').length;
	}
	const found=String(rowValue === null || rowValue === undefined ? '' : rowValue).match(/\d+/);
	return found ? Number(found[0]) : null;
}

// create the 'min>=' filter operator ------------------------------------------
// A plain ">=" compares strings, and "more than 20" is not >= 1.
Tabulator.extendModule("filter", "filters", {
	"min>=":function(filtValue, rowValue, rowData, filterParams){
		const n=tohCountOf(rowValue);
		return n !== null && n >= Number(filtValue);
	}
});

// create the 'ram>=' filter operator ------------------------------------------
// RAM carries units: _getCleanNumber() reads "more than 4GB" as 4097 MB.
Tabulator.extendModule("filter", "filters", {
	"ram>=":function(filtValue, rowValue, rowData, filterParams){
		const n=_getCleanNumber(rowValue, 'ram');
		return typeof n === 'number' && !isNaN(n) && n >= Number(filtValue);
	}
});

// create the 'flash>=' filter operator ----------------------------------------------
Tabulator.extendModule("filter", "filters", {
	"flash>=":function(filtValue, rowValue, rowData, filterParams){
		//console.log('-----');
		//console.log('filtValue='+filtValue+'	| rowValue='+rowValue);
		return _getFlashArrayBestValue(rowValue) >= filtValue ? true : false;
	}
});


// get a clean number from a string column----------------------------------------------
function _getCleanNumber(rowValue,type=''){
	if(rowValue ==null){
		return '';
	}
	const text=String(rowValue).trim();
	if(text==''){
		return '';
	}

	// "64, 128, 256" is a list of options: parse each part and take the largest
	if(text.indexOf(',') > -1){
		const parts=text.split(',')
			.map(part => _getCleanNumber(part, type))
			.filter(v => typeof v === 'number' && !isNaN(v));
		if(parts.length){
			return Math.max(...parts);
		}
	}

	// A number with a unit wins over a bare digit run, so "DDR3 2 GB" reads as
	// 2 GB. A comma is a list separator (see above), never a decimal point.
	const m=text.match(/(\d+(?:\.\d+)?)\s*(G|M)B\b/i)
		|| text.match(/(\d+(?:\.\d+)?)/);
	if(!m){
		return text;					// no number at all: leave it as text
	}
	const n=parseFloat(m[1]);
	if(isNaN(n)){
		return text;
	}
	if(type=='ram' && /^g$/i.test(m[2] || '')){
		return Math.round(n * 1024) + 1;	// +1 so "4 GB" ranks just above a plain 4096
	}
	return n;
}


