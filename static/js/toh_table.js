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


// Format Tabulator Rows -----------------------------------------------------------
function tabuRowFormatter(row){
	var data = row.getData();
	if(data.brand === "OpenWrt"){
		row.getElement().classList.add("brand-owrt");
	}
}



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


// Tabulator: Cell Popup Formatters ###########################################################################################
function CellPopupModel(e, cell, onRendered) {
	// Build initial popup HTML structure with brand and model title
	var data = cell.getData();
	var contents = "<div class='toh-details-border'>" +
		"<div class='toh-details-head'>" +
			"<b class='toth-details-title'>" +
				"<a href='#' class='js-toh-facet' data-type='brand' data-value='" + tohAttr(data.brand) + "' title='All " + tohAttr(data.brand) + " devices'>" + data.brand + "</a>" +
				" - " + data.model +
				// spelled out, because an unlabelled part number next to the model
				// name reads as noise unless you already know it is the SoC
				(data.cpu && data.cpu !== '-' ? " <a href='#' class='toh-details-chipset js-toh-facet' data-type='chipset' data-value='" + tohAttr(data.cpu) + "' title='See every device using this chipset'>" + tohIcon('cpu') + "<span class='toh-details-chipset-label'>Chipset</span>" + data.cpu + "</a>" : "") +
			"</b>" +
			"<div class='toh-details-close'>"+tohIcon('circle-x')+"</div>" +
		"</div>" +
		"<div class='toh-details-content'>";

	// Map column fields to their definitions for quick lookup
	var columns = cell.getTable().getColumns();
	var columnMap = {};
	columns.forEach(col => columnMap[col.getField()] = col);

	// Iterate through column groups, excluding 'base'
	const { base, ...myColGroups } = toh_colGroups;
	$.each(myColGroups, function(key, obj) {
		var done = false;
		var links = '';			// link rows, appended after the key/value rows
		$.each(obj.fields, function(f, field) {
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
					getRow: () => cell.getRow(),
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
			// again in abbreviated form ("HwData"). Give them the full row -
			// and hold them back so they land together at the end of the group
			// instead of breaking up the key/value rows.
			if (mycol.formatterParams && mycol.formatterParams.label) {
				// One row per link. Some columns render two at once (origin and
				// GitHub commit), which otherwise left the group with rows of
				// uneven length.
				links += tohDetailsLinkRows(formattedValue);
				return true;
			}

			// the popup has room for the real name, unlike the column header
			var label = col.headerTooltip || col.title;
			contents += '<tr><td class="toh-details-key"><a href="#" title="'+ col.headerTooltip +'">' + label + "</a></td><td class='toh-details-value'>" + formattedValue + "</td></tr>";
		});
		if (done) contents += links + "</table>\n</div>";
		else if (links) {
			contents += "<div class='toh-details-group'>\n<div class='toh-details-title'>" + obj.name
				+ "</div>\n<table class='toh-details-table'>" + links + "</table>\n</div>";
		}
	});

	contents += "</div></div><div class='toh-details-bottom'></div>";

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
		let [brand, id]	= row.deviceid.split(":");
		id 				= brand + '_' + id.split('_').slice(1).join('-');
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
	var tmp='';
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
	var out='';
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
				out +='<a href="' + url + '" target="_blank" class="cell-image generic">'+tohIcon('image')+'</a> ';
			}
			else{
				out +='<a href="' + url + '" target="_blank" class="cell-image">'+tohIcon('image')+'</a> ';
			}

			// preload images --------
			//const img = new Image();
			//img.src = url;

			if (!toh_img_urls.includes(url)) {
				toh_img_urls.push(url);
			}

		});
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
function FormatterArray(cell, formatterParams, onRendered) {
	var arr = cell.getValue();
	var out='';
	var done=false;
	if (Array.isArray(arr) && arr.length > 0) {
		arr.forEach((value, index) => {
			value=value.replace(/NAND/g,' NAND'); // for Flash
			value=value.replace(/Qualcomm Atheros/g,'Atheros'); // for WLAN Hardware
			if(done){
				out +=" + ";
			}
			out +=value;
			done=true;
		});
		return out;
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
	return '<span class="toh-badge toh-badge-'+kind+'" title="'+label+'">'+label+'</span>';
}

// "Supported current release" -----------------------------
function FormatterRelease(cell, formatterParams, onRendered) {
	const value=cell.getValue();
	const v=typeof value === 'string' ? value.trim() : value;
	if(!v || v === '-'){
		return _formatBadge(null);
	}
	if(v.toLowerCase() === 'eol'){
		return _formatBadge('EOL','dead');
	}
	if(v.toLowerCase() === 'snapshot'){
		return _formatBadge('Snapshot','pending');
	}
	return _formatBadge(v,'ok');			// a numbered release: it ships
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
	var icon='';
	if (typeof value === "string") {
		value=value.toLowerCase().trim();
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
	var container = document.createElement("span");

	//create and style inputs
	var minimum = document.createElement("input");
	minimum.setAttribute("type", "text");
	minimum.style.padding	= "4px";
	minimum.style.width		= "50%";
	minimum.style.boxSizing = "border-box";
	var search=minimum.cloneNode();
	
	minimum.setAttribute("placeholder", "Minimum");
	search.setAttribute("placeholder", "Search");

	minimum.value = cell.getValue();
	search.value = cell.getValue();

	function buildValues(){
		success({
			minimum:	minimum.value,
			search:		search.value,
		});
		if(minimum.value=='' && search.value==''){
			console.log('gotcha')
			// this fixes the Tabulator Bug, who never fires the 'dataFiltered' event when emptying the field
			tabuTable.setHeaderFilterValue('flashmb',null);
		}	
	}

	// events ---
	minimum.addEventListener("change",	buildValues);
	minimum.addEventListener("blur", 	buildValues);
	minimum.addEventListener("keyup",	buildValues); // for empty
	//minimum.addEventListener("input",	buildValues); // for empty
	search.addEventListener("change",	buildValues);
	search.addEventListener("blur",		buildValues);
	search.addEventListener("keyup",	buildValues); // for empty

	container.appendChild(minimum);
	container.appendChild(search);
	
	return container;
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
					//console.log('v='+v);
					m=reg.test(v);
					console.log(m);
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
	const [brand, model] = deviceid.split(":");
	return toh_urls.hwdata + brand + '/' + model;
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
