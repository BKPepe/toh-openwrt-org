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

let toh_density=toh_prefs.def_density;

// Switch how tall the rows are ----------------------------------------------
// Tabulator sizes its virtual rows from options.rowHeight, and getTableRowHeight()
// reads the same value to work out how tall the container has to be, so the
// option is the one place to change: CSS alone would leave both of them sizing
// for the old height.
function tohApplyDensity(key, save=true){
	if(!toh_densities[key]){
		key=toh_prefs.def_density;
	}
	toh_density=key;

	$('.toh-density-but').each(function(){
		const on=$(this).attr('data-density') === key;
		$(this).attr('aria-pressed', on ? 'true' : 'false');
	});

	tabulatorOptions.rowHeight=toh_densities[key];
	// and the same number to the stylesheet: redraw() reuses the row elements
	// Tabulator already sized inline, so changing the option alone only takes
	// effect on the next full page load
	document.body.style.setProperty('--row-h', toh_densities[key]+'px');
	// the class as well: the Device column drops its brand line at this height,
	// which is a layout decision CSS has to make, not a number
	$('body').toggleClass('toh-density-compact', key === 'compact');

	if(typeof tabuTable !== 'undefined' && tabuTable && toh_table_inited){
		tabuTable.redraw(true);
		setTableHeight($('.tabulator-page-size').val() || tabulatorOptions.paginationSize);
	}
	if(save){
		saveCookie(toh_prefs.cook_name_density, key, false, 'string');
	}
}

// makes an A tag from an URL ----------------------------------------------
function formatLinkToHtml(url, name='link', target_blank=true){
	let pattern = /^http(s)?:\/\//;
	let target='';
	if(target_blank){
		target='_blank';
	}
	if(pattern.test(url)){
		return '<a href="'+url+'" target="'+target+'" title="'+url+'">'+name+'</a>';
	}
	return url;
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



// "Device" : the brand above the model, as one identity ---------------------
// A separate Brand column repeated a string that belongs with the name, and the
// two are genuinely distinct - only 25 of 3,007 models carry their brand, and 13
// model names are used by more than one manufacturer, so neither identifies a
// device on its own. Stacked they read as one thing and cost ~85px less.
function FormatterDevice(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const model=cell.getValue();
	return "<span class='toh-dev'>"
		+ (row.brand ? "<span class='toh-dev-brand'>" + tohAttr(row.brand) + "</span>" : "")
		+ "<span class='toh-dev-model'>"
		+ tohAttr(model === null || model === undefined ? '' : model) + "</span>"
		+ "</span>";
}

// ... and filtered against what it shows -------------------------------------
// The cell says "Turris CZ.NIC / Omnia", so typing "Turris" has to match it.
// Filtering the model string alone found the two devices with Turris in the
// model name and silently missed the Omnia, the MOX and the Shield. Every
// space-separated word must appear somewhere in brand + model, so "turris
// omnia" works even though the words are not adjacent in the haystack.
function HeaderFilterFuncDevice(headerValue, rowValue, rowData, filterParams){
	const needle=String(headerValue === null || headerValue === undefined ? '' : headerValue).trim().toLowerCase();
	if(needle === ''){
		return true;
	}
	const hay=(String(rowData.brand || '') + ' '
		+ String(rowValue === null || rowValue === undefined ? '' : rowValue)).toLowerCase();
	return needle.split(/\s+/).every(t => hay.indexOf(t) > -1);
}

// ... and sorted the way the Brand column used to sort ----------------------
// Clicking a column headed "Device" should group the manufacturers, not scatter
// them by whatever their models happen to be called.
function SorterDevice(a, b, aRow, bRow, column, dir, sorterParams){
	const key=(row, model) => String(row.getData().brand || '') + ' ' + String(model || '');
	return key(aRow, a).localeCompare(key(bRow, b), 'en', {sensitivity:'base', numeric:true});
}


// "CPU" : the chip, and what it runs at -------------------------------------
// Cores and MHz were two 40-50px columns holding one number each, next to the
// chip they describe. Stacked under the name they cost nothing and read as one
// fact. Sorting and the header filter still work on the chip name, which is
// what anyone types; sorting by clock is a tick away in the column picker.
function FormatterCpu(cell, formatterParams, onRendered){
	const row=cell.getRow().getData();
	const name=FormatterCleanWords(cell, formatterParams, onRendered);
	if(!name){
		return "";
	}
	const bits=[];
	if(row.cpucores && String(row.cpucores) !== '-'){
		bits.push(tohAttr(row.cpucores) + '×');		// "4x", against the clock below
	}
	if(row.cpumhz && String(row.cpumhz) !== '-' && !isNaN(row.cpumhz)){
		bits.push(tohAttr(row.cpumhz) + ' MHz');
	}
	return "<span class='toh-stack'><span class='toh-stack-main'>" + name + "</span>"
		+ (bits.length ? "<span class='toh-stack-sub'>" + bits.join(' ') + "</span>" : "")
		+ "</span>";
}

// "Wi-Fi" : which bands the device has --------------------------------------
// Three columns of "b/g/n" and "a/n/ac" said less between them than one line
// naming the bands. The per-band modes stay in the details view, and the rail
// already filters by Wi-Fi generation.
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
	// the modes, so the detail is a hover away rather than gone
	const modes=[row.wlan24ghz, row.wlan50ghz, row.wlan60ghz]
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
// Five 35-40px columns holding one icon each. Folded into one cell they cost
// ~70px less and four fewer headers - but deliberately still icons side by
// side, not a menu: whether a device has a forum thread or a wiki page is
// information you read by running an eye down the column, and a menu hides it
// behind a click. Fixed order, so the wiki icon is always in the same place.
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
		const url=_linkUrlFor(kind, row);
		if(!url){
			// an empty slot, not a missing one: the icons have to stay under the
			// matching icon in the header, or the legend means nothing and running
			// an eye down the column no longer tells you who has a forum thread
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

// The header names them in the order they appear, so the icons can be learned
// once rather than guessed at every time.
function TitleLinks(cell, formatterParams, onRendered){
	return "<span class='toh-links-title'>"
		+ toh_link_kinds.map(k => tohIcon(k.icon)).join('')
		+ "</span>";
}


// "Download" : which release you would actually get -------------------------
// The table used to carry three download icons side by side - the firmware
// selector, an install URL and an upgrade URL - drawn identically and saying
// nothing about what they hand you. The two URLs come from the wiki page, so
// they point at whatever release somebody last recorded there: across the 3,000
// devices they span 17.01 to 25.12, and clicking one could quietly fetch a build
// from 2017.
//
// One column instead, and it names the release. The firmware selector is the
// live source and wins whenever it has a build; the recorded URL is the
// fallback, and says plainly that it is not current.
function FormatterDownload(cell, params, onRendered){
	const row=cell.getRow().getData();

	// the selector, for the release openwrt.org is shipping right now
	if(toh_firmwares_fetched && row.deviceid && row.target){
		const url=GetFirmwareSelectUrl(_makeFirmwareProfileId(row.deviceid),
			row.target + '/' + row.subtarget);
		if(url){
			return "<a class='toh-dl toh-dl-current' href='" + url + "' target='_blank' rel='noopener'"
				+ " title='Get OpenWrt " + tohAttr(toh_stable_version) + " for this device from the Firmware Selector'>"
				+ tohIcon('cloud-download') + tohAttr(toh_stable_version) + "</a>";
		}
	}

	// nothing current: fall back to whatever the wiki recorded, labelled with
	// the release parsed out of the URL so nobody installs 19.07 by accident
	const recorded=row.firmwareopenwrtinstallurl || row.firmwareopenwrtupgradeurl;
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
// "Forum" needs 38px and the column is 40px wide, of which 23px is text: the
// header rendered as "Foru", chopped mid-word with no ellipsis (the title's
// text-overflow is clip). Widening the eight of them to fit their words costs
// about 180px, which puts the horizontal scrollbar back on a 1600px screen.
//
// So the header shows the same icon the cells below it do, and the name lives
// in the tooltip. `title` stays a plain word on purpose: it is what the CSV
// export writes as the header and what the column picker falls back to.
function TitleIcon(cell, formatterParams, onRendered){
	const def=cell.getColumn().getDefinition();
	const icon=def.formatterParams && def.formatterParams.icon;
	return icon ? tohIcon(icon) : def.title;
}

// Header icon from an explicit `titleIcon` on the column ---------------------
// For Fav and Cmp, whose cells are a heart / checkbox with no formatterParams
// icon to borrow. "Fav" and "Cmp" did not fit their 32px columns and rendered
// as "Fa" / "Cm"; the icon does, and matches what the cells below show.
function TitleNamedIcon(cell, formatterParams, onRendered){
	const def=cell.getColumn().getDefinition();
	return def.titleIcon ? tohIcon(def.titleIcon) : def.title;
}


// Downloads, in the details view ---------------------------------------------
// The mockup drew "Install Firmware" and "Upgrade Firmware" as two big equal
// buttons. Those are the wiki-recorded URLs - the ones spanning 17.01 to 25.12 -
// so drawn like that they would hand out six-year-old builds with the most
// prominent control on the page. One primary button for the current release
// instead, and the recorded images listed under it with their release named.
function tohDeviceDownloadsHtml(data){
	let out='';

	// the live build first: the firmware selector knows this exact device
	if(toh_firmwares_fetched && data.deviceid && data.target){
		const url=GetFirmwareSelectUrl(_makeFirmwareProfileId(data.deviceid),
			data.target + '/' + data.subtarget);
		if(url){
			out +="<a class='toh-but toh-but-primary toh-dlrow-main' href='" + url + "'"
				+ " target='_blank' rel='noopener'>" + tohIcon('cloud-download')
				+ " Download OpenWrt " + tohAttr(toh_stable_version) + "</a>";
		}
	}

	// then whatever the wiki recorded, each naming its release: still worth
	// having (a device dropped after 19.07 has nothing newer), but never dressed
	// up as current
	let older='';
	[['firmwareopenwrtinstallurl','Install image'],
	 ['firmwareopenwrtupgradeurl','Upgrade image']].forEach(([field,label]) => {
		const url=data[field];
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

// The inside of the details view, built from a row rather than a cell --------
// Split out of CellPopupModel so the phone card list can show the same content:
// there is no rendered cell down there for Tabulator to hang a popup on, and a
// second description of a device would be a second thing to keep correct.
function tohDeviceDetailsHtml(row){
	// Build initial popup HTML structure with brand and model title
	var data = row.getData();
	// The name, then the few facts you look for first. They sit on the left
	// under the name rather than being pushed to the far side of the bar.
	var chips = '';
	if(data.cpu && data.cpu !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-facet' data-type='chipset' data-value='" + tohAttr(data.cpu) + "'"
			+ " title='See every device using this chipset'>"
			+ tohIcon('cpu') + "<span class='toh-details-chip-key'>Chipset</span>" + data.cpu + "</a>";
	}
	if(data.target && data.target !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-facet' data-type='target' data-value='" + tohAttr(data.target) + "'"
			+ " title='Every device on this target'>"
			+ tohIcon('layers') + "<span class='toh-details-chip-key'>Target</span>" + data.target
			+ (data.subtarget && data.subtarget !== '-' ? ' / ' + data.subtarget : '') + "</a>";
	}
	// RAM and flash are quantities, not groups: clicking one filters the table
	// to everything with at least that much
	if(data.rammb && data.rammb !== '-'){
		chips += "<a href='#' class='toh-details-chip js-toh-atleast' data-field='rammb' data-value='" + tohAttr(data.rammb) + "'"
			+ " title='Devices with at least this much RAM'>"
			+ tohIcon('memory-stick') + "<span class='toh-details-chip-key'>RAM</span>" + data.rammb + " MB</a>";
	}
	if(data.flashmb){
		const flash = tohArrayText(data.flashmb, 'MB');
		const plain = flash.match(/\d+/);
		if(flash && flash !== '-'){
			const label = tohIcon('hard-drive') + "<span class='toh-details-chip-key'>Flash</span>"
				+ tohAttr(flash);
			chips += plain
				? "<a href='#' class='toh-details-chip js-toh-atleast' data-field='flashmb' data-value='" + plain[0] + "'"
					+ " title='Devices with at least this much flash'>" + label + "</a>"
				: "<span class='toh-details-chip'>" + label + "</span>";
		}
	}

	// How this device stands, said plainly. A row in a table three screens down
	// saying "EOL" is not the same as being told before anything else.
	var state = tohSupportState(data);
	var avail = String(data.availability === null || data.availability === undefined ? '' : data.availability);

	// what, if anything, OpenWrt cannot drive on this device - the same field
	// behind the warning triangle next to the release in the table
	let caveat=data.unsupported_functions;
	if(Array.isArray(caveat)){ caveat=caveat.join(', '); }
	caveat=String(caveat === null || caveat === undefined ? '' : caveat).trim();
	if(caveat === '-'){ caveat=''; }
	const neverSupported=/^never supported$/i.test(caveat);

	var notice = '';
	if(neverSupported){
		// a real state, not "nobody filled it in": say so plainly and skip the
		// release-based notices below, which would read as "unknown"
		notice = "<div class='toh-notice is-dead'>" + tohIcon('triangle-alert')
			+ "<span><b>Not supported.</b> OpenWrt does not run on this device.</span></div>";
	}
	else if(state === 'eol'){
		// Not "the last release to support it was <supportedsincerel>": that field
		// is the FIRST release that supported it, and the sentence was claiming a
		// device supported since 14.07 was last supported by 14.07.
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

	// a device can be on a current release and still have a radio, modem or
	// switch OpenWrt cannot drive. This is what the ⚠ in the table points at.
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
				// the wiki editor, offered here rather than as a column on every row
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

	// The chips above already state these, and repeating them a few rows later
	// just makes the popup longer.
	const inTheChips = ['cpu','target','subtarget','rammb','flashmb'];
	// ... and the download row already carries these - see tohDeviceDownloadsHtml()
	const inTheDlRow = ['VIRT_download','VIRT_firm','firmwareopenwrtinstallurl','firmwareopenwrtupgradeurl'];
	$.each(myColGroups, function(key, obj) {
		var done = false;
		var links = '';			// link rows, appended after the key/value rows
		$.each(obj.fields, function(f, field) {
			if(inTheChips.indexOf(field) > -1 && chips){
				return true;
			}
			if(inTheDlRow.indexOf(field) > -1){
				return true;
			}
			// Get column definition and raw value
			var col = getMyColumnDefinition(field);
			var value = data[field];
			var formatter = (columnMap[field] || { getDefinition: () => col }).getDefinition().formatter || ((cell) => cell.getValue());

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
				value;

			// Convert to string, skip if empty or null
			formattedValue = formattedValue instanceof Node ? formattedValue.outerHTML : String(formattedValue);
			
			// exclude empty fields
			if (!formattedValue || formattedValue === 'null' || formattedValue === '-' || isGenerigImage(value) ) return true;

			if (!done) {
				contents += "<div class='toh-details-group'>\n<div class='toh-details-title'>" + obj.name + "</div>\n<table class='toh-details-table'>";
				done = true;
			}

			// Link columns already render a descriptive label ("Hardware Data
			// Page"), so a key cell next to them would just say the same thing
			// again in abbreviated form ("HwData"). Give them the full row.
			if (mycol.formatterParams && mycol.formatterParams.label) {
				// One row per link. Some columns render two at once (origin and
				// GitHub commit), which otherwise left the group with rows of
				// uneven length.
				links += tohDetailsLinkRows(formattedValue);
				return true;
			}

			// the popup has room for the real name, unlike the column header
			var label = col.headerTooltip || col.title;
			contents += '<tr><td class="toh-details-key">' + label + "</td><td class='toh-details-value'>" + formattedValue + "</td></tr>";
		});
		if (done) contents += links + "</table>\n</div>";
		else if (links) {
			contents += "<div class='toh-details-group'>\n<div class='toh-details-title'>" + obj.name
				+ "</div>\n<table class='toh-details-table'>" + links + "</table>\n</div>";
		}
	});

	// "devices like this one", last because it is a suggestion, not a fact
	contents += tohSimilarHtml(data);

	contents += "</div></div><div class='toh-details-bottom'></div>";

	return contents;
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
			tohDeviceUrlSet(null);		// gone from the page, gone from the URL
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
		return '<a href="' + prefix+url + '" target="_blank" title="'+ttip+'" class="tlink '+field+'">' + icon + label + '</a>'
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
function FormatterEditHwData(cell, formatterParams, onRendered) {
	var value = cell.getRow().getData().deviceid;
	var title = "Edit " + cell.getRow().getData().model;
	if (value && value.length > 0) {
		return '<a href="' + _maketHwDataUrl(value)  + '" target="_blank" title="'+title+'">'+tohIcon('pencil')+'</a>';
	} 
	return value;
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
			return arr;
		}

		// A handful of devices carry up to six pictures, and one icon each
		// overflowed the column. One icon stands for the whole set instead, with
		// the count on it, and the lightbox pages through them.
		var out='<a href="' + urls[0] + '" target="_blank" class="cell-image"';
		out +=' data-images="' + urls.join(' ') + '"';
		out +=' title="' + (urls.length > 1 ? urls.length + ' pictures' : 'Picture') + '">';
		out +=tohIcon('image');
		if(urls.length > 1){
			out +='<span class="cell-image-count">' + urls.length + '</span>';
		}
		out +='</a> ';
		return out;
	}
	return arr;
}

// --------------------------------------------------------
function FormatterCleanEmpty(cell, formatterParams, onRendered) {
	var value = cell.getValue();
	if (value && value.length > 0) {
		value=value.replace(/-/g,'');
		return value;
	} 
	return "";
}

// --------------------------------------------------------
function FormatterCleanWords(cell, formatterParams, onRendered) {
	var value = cell.getValue();
	if (value && value.length > 0) {
		value=value.replace(/more than/g,'&gt;'); // for GPIOs
		value=value.replace(/Qualcomm Atheros/g,'Atheros'); //  for CPU
		return value;
	} 
	return "";
}

// --------------------------------------------------------
// Plain-text form of an array value: ["8","eMMC"] -> "8 MB + eMMC" -----------
// One place for the rule, because the table cell, the phone card and the
// details chip each grew their own copy and two of them printed "8, eMMC MB".
// Returns unescaped text: every caller escapes at its own HTML boundary.
function tohArrayText(arr, unit){
	if(arr === null || arr === undefined || arr === ''){
		return '';
	}
	if(!Array.isArray(arr)){
		arr=[arr];			// a scalar "8" deserves its unit too
	}
	return arr.map(value => {
		value=String(value).replace(/NAND/g,' NAND'); // for Flash
		value=value.replace(/Qualcomm Atheros/g,'Atheros'); // for WLAN Hardware
		if(unit){
			// a bare size reads oddly next to the "+": "8" -> "8 MB",
			// "128 NAND" -> "128 MB NAND". Anything without a leading number
			// (eMMC, microSD) is left alone.
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
	return arr;
}
// --------------------------------------------------------
// Renders a coloured status pill: green = shipping release, amber = only
// snapshot / uncertain, red = end of life.
function _formatBadge(label, kind){
	if(label === null || label === undefined || label === '' || label === '-'){
		return '<span class="toh-badge toh-badge-none">&mdash;</span>';
	}
	// no title: it only repeated the visible text, and next to the release its
	// tooltip competed with the warning triangle's own "what does not work"
	return '<span class="toh-badge toh-badge-'+kind+'">'+tohAttr(label)+'</span>';
}

// "Supported current release" -----------------------------
function FormatterRelease(cell, formatterParams, onRendered) {
	const value=cell.getValue();
	const v=typeof value === 'string' ? value.trim() : value;

	// Whether anything on the device does not work is a separate axis from which
	// release supports it, and the release alone was overstating things: 376
	// devices sit on a current release with a radio, a modem or a switch that
	// OpenWrt cannot drive. A green pill on its own said they were fine.
	const row=typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
	let caveat=row.unsupported_functions;
	if(Array.isArray(caveat)){ caveat=caveat.join(', '); }
	caveat=String(caveat === null || caveat === undefined ? '' : caveat).trim();
	if(caveat === '-'){ caveat=''; }

	// "Never supported" is not a release state at all. Left to fall through it
	// rendered as the empty one, which reads as "nobody has filled this in yet".
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
		badge=_formatBadge(v,'ok');			// a numbered release: it ships
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
	// One input, not the Minimum/Search pair: side by side in a 90px column
	// their placeholders rendered as "Mi" and "Se", which nobody could read.
	// What was typed decides which filter it is - digits set the minimum,
	// anything else searches the text ("NAND", "eMMC").
	var input = document.createElement("input");
	input.setAttribute("type", "text");
	input.style.padding		= "4px";
	input.style.width		= "100%";
	input.style.boxSizing	= "border-box";
	input.setAttribute("placeholder", "Min or text");
	input.setAttribute("title", "A number filters by minimum MB; text searches, e.g. NAND or eMMC");

	// restore what a redraw hands back: the stored value is the object below
	var prev = cell.getValue();
	if(prev && typeof prev === 'object'){
		input.value = prev.minimum || prev.search || '';
	}

	function buildValues(){
		var v = input.value.trim();
		// still the {minimum, search} shape: HeaderFilterFuncFlash, the URL
		// restore and the saved presets all expect it
		success(/^\d+$/.test(v)
			? {minimum: v,	search: ''}
			: {minimum: '',	search: v});
		if(v === ''){
			// this fixes the Tabulator Bug, who never fires the 'dataFiltered' event when emptying the field
			tabuTable.setHeaderFilterValue('flashmb',null);
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
		if(Array.isArray(rowValue)){
			var reg		= new RegExp(headerValue.search,'i');
			for (const v of rowValue) {
				if(v !=null){
					// no logging here: this runs per array item, per row, per keystroke
					m=reg.test(v);
					if(m){
						b_search=true;
						break;	
					}
				}
			};
		}
	}
	return b_minimum && b_search; //must return a boolean, true if it passes the filter.
}

// Handle custom HeaderFilter's logic for the 'RamMb' colum ---------------------------------------------
// Numeric "at least" for the count columns ------------------------------------
// Two bugs in one: the plain ">=" operator compared strings, so "10" sorted
// below "2" and asking for 10 ports returned everything with 1 or more.
// github.com/openwrt/toh-openwrt-org/issues/57
//
// A row whose count cannot be read is left out rather than let through. These
// are counts: "at least 10 ports" is a question about a number, and answering
// it with a thousand devices whose port count nobody wrote down is no answer.
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

function HeaderFilterFuncRamMb(headerValue, rowValue, rowData, filterParams){
	//console.log(typeof(rowValue) + rowValue);
	if(headerValue =='' || headerValue==null || headerValue == undefined){
		return true;
	}
	var val=_getCleanNumber(rowValue,'ram');
	if(val ==''){
		return true;
	}

	// if we have something else than number, consider true;
	if(String(val).match(/[^\d]+/g)){
		return true;
	}

	return Number(val) >= Number(headerValue);
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
	return brand + '_' + model.replace(/_/g,'-');
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
			v=v.replace(/[^\d]+/g,'');
			v=Number(v);
		}
		// target is the highest found value
		if(v > target){
			target=v;
		}
	});
	return target;
}

// the 'isfav' filter operator, so pinned favourites can ride along with any
// filter list without a second code path ---------------------------------------------
Tabulator.extendModule("filter", "filters", {
	"isfav":function(filtValue, rowValue, rowData, filterParams){
		return tohFavHas(rowValue);
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
	rowValue=rowValue.trim();
	if(rowValue==''){
		return '';
	}

	// if we have a sring like "64, 128, 256",  we keep the max
	if(rowValue.match(/,/i)){
		rowValue= rowValue.replace(/ /g,'');
		const numbers = rowValue.split(',').map(Number);
  		rowValue= Math.max(...numbers);
	}

	// specific to Ram column
	if(type=='ram'){
		if(String(rowValue).match(/[^\d]+/g)){
			//remove letter at start
			rowValue=rowValue.replace(/.*?(\d+)/g,'$1');
			// do we have GB ?
			if(rowValue.match(/[\d]+\s*GB/i)){
				rowValue=rowValue.replace(/[^\d]+/g,'');
				rowValue=Number(rowValue) * 1024 +1; //we add 1 to be sorted , ie for 4GB, just after 4096
			}
		}
	}

	// if we have letters, dont cast to number
	if(String(rowValue).match(/[^\d]+/g)){
		return rowValue;
	}
	else{
		return Number(rowValue);
	}
}


