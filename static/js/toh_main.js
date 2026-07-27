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

// variables ##################################################################################################################


const toh_img_urls=[];	// holds all images urls

let toh_firmwares=[]; 				// holds all releases
let toh_firmwares_fetched=false;	// confirm if releases have been fetched

const toh_table_min_height=360;		// never shrink the table below this, however short the window
const toh_filters_visible_groups=3;	// filter groups shown before "Show more filters"

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




// Icons ######################################################################################################################

// Render a Lucide icon from the sprite inlined at the top of index.html.
// 'spec' is a sprite name, optionally followed by extra CSS classes:
//    tohIcon('download')            -> <svg class="toh-ico">…</svg>
//    tohIcon('triangle-alert error') -> <svg class="toh-ico error">…</svg>
function tohIcon(spec){
	const [name, ...extra]=String(spec).trim().split(/\s+/);
	const cls=['toh-ico', ...extra].join(' ');
	return '<svg class="'+cls+'" aria-hidden="true"><use href="#i-'+name+'"></use></svg>';
}

// Point an already rendered icon at another sprite symbol -------------------
function tohSetIcon($svg, name){
	$svg.find('use').attr('href','#i-'+name);
}




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




// Filters functions ##########################################################################################################

// Make filter Preset Button ------------------------------------------
function htmlFilterPresetButton(myclass, value){
	var icon='';
	var name=value;
	name = name.replace(/_/g,' ');
	name = name.replace(/(^\w{1})|(\s{1}\w{1})/g, match => match.toUpperCase()); // UcFirst
	return '<a href="#" class="'+myclass+'" data-key="'+value+'">'+icon+name+'</a>'+"";
}

// Make Filter Preset ------------------------------------------
function htmlFilterDiv(filt,key,is_feature=false){
	var html='';
	var myclass='preset';
	if(is_feature){
		myclass='feature';
	}
	if(filt.type=='admin'){
		myclass +=" toh-filter-admin";
	}
	html +='<div class="toh-filter toh-filter-'+myclass+'">';
	html +='<span class="toh-filter-title">';
	if(is_feature){
		var only=''
		if(typeof filt.only =='string'){
			only=filt.only;
		}
		html +='<input type="checkbox" data-key="'+key+'" data-only="'+only+'">';
	}
	html +='<a href="#" class="toh-filter-button" data-key="'+key+'" title="';
	if(is_feature){
		html +=makeFeatureDescription(key);
	}
	html +='">'+filt.title+'</a></span>';
	html +='<span class="toh-filter-description">'+filt.description+'</span>';
	html +="</div>\n";
	return html;
}

// display Filters Presets ------------------------------------------------
function buildFiltersPresets(){
	tmp_html='';
	for (const key in toh_filterPresets){
		tmp_html+=htmlFilterDiv(toh_filterPresets[key],key);
	}
	$('#toh-filters-presets .toh-filters-list').html(tmp_html);
}

// display Filters Features ------------------------------------------------
function buildFiltersFeatures(){
	tmp_html='';
	let index=0;
	let hidden=0;
	for (const group in toh_filterGroups){
		tmp_html +=htmlGroup(toh_filterGroups[group].title,group,'filt',index);
		toh_filterGroups[group].members.forEach(filt => {
			tmp_html +=htmlFilterDiv(toh_filterFeatures[filt],filt,true);
		});
		tmp_html +="</ul>\n</div>\n";
		if(index >= toh_filters_visible_groups){
			hidden +=toh_filterGroups[group].members.length;
		}
		index++;
	}
	if(hidden > 0){
		tmp_html +='<a href="#" class="toh-filters-more">'
			+ tohIcon('chevron-down')
			+ '<span class="toh-filters-more-show">Show ' + hidden + ' more filters</span>'
			+ '<span class="toh-filters-more-hide">Show fewer filters</span>'
			+ '</a>';
	}
	$('#toh-filters-features-content').html(tmp_html);
}

// Formats one Filter description -------------------------------------
function formatFilterDesc(filter){
	var title=toh_colStyles[filter.field].title;
	return title + " " + filter.type + " '" +filter.value + "'"; 
}

// Makes the Feature Tooltip ------------------------------------------
function makeFeatureDescription(key){
	var features=toh_filterFeatures[key];
	var desc='';
	var done_and=false;
	var done_or=false;
	$.each(features.filters,function(i,filter){
		if(Array.isArray(filter)){
			desc +="(";
			$.each(filter,function(j,orfilter){
				if(done_or){
					desc +=" OR ";
				}
				desc +=formatFilterDesc(orfilter);
				done_or=true;
			});
			desc +=") ";
			done_or=false;
		}
		else{
			if(done_and){
				desc +=" AND ";
			}
			desc +=formatFilterDesc(filter);
		}
		done_and=true;
	});
	return desc;
}

// Check on/off ALL features checkboxes -------------------------
function checkAllFeatures(state=true){
	$(".toh-filter-feature INPUT").prop('checked',state);
}

// Check on/off a feature checkbox ------------------------------
function checkFeature(key,state=true){
	if(state){
		var group=$(".toh-filter-feature INPUT[data-key="+key+"]").attr('data-only');
		//myLogStr(group,1);
		if(group.length > 0){
			$(".toh-filter-feature INPUT[data-only="+group+"]").prop('checked',false);
		}
	}
	$(".toh-filter-feature INPUT[data-key="+key+"]").prop('checked',state);
}

// Show or Hide ALL features --------------------------------------
function clearAllFeatures() {
	tabuTable.clearFilter();
}

// Return a (flatted) list of the current filtered fields ------------------
function getTableFiltersFields(type='filters'){
	var fields=[];
	if(type=='filters'){
		var filters	=tabuTable.getFilters();
	}
	else if(type=='headerfilters'){
		var filters	=tabuTable.getHeaderFilters();
	}
	else{ // all
		var filters	=tabuTable.getFilters(true);
	}
	myLogFunc('getTableFiltersFields type='+type+' ----');
	myLogObj(filters,'filters');
	$.each(filters,function(i,f){
		if(Array.isArray(f)){
			$.each(f,function(j,ff){
				if (!fields.includes(ff.field)){
					fields.push(ff.field);					
				}
			});
		}
		else{
			if (!fields.includes(f.field)){
				fields.push(f.field);					
			}
		}

	});
	myLogObj(fields,'fields');
	return fields;
}

// Apply a Filter Preset ----------------------------------------------------
function applyFilterPreset(key){
	myLogFunc();
	var set=getFilterSet('preset',key);
	if(Object.keys(set).length > 0 ){
		myLogStr('key: '+key);
		myLogObj(set.filters,'Filter Set');
		myLogObj(tabuTable.getFilters(),'Tabu Filters (before)');

		setPresetSelectedClass('features',key);
		showLoading();

		tabuTable.clearFilter();			// needed?
		tabuTable.setFilter(set.filters ); //,  {matchAll:true}

		myLogObj(tabuTable.getFilters(),'Tabu Filters (after)');

		checkAllFeatures(false);
		if(set.features.length > 0 ){		
			$.each(set.features,function(j,feat){
				checkFeature(feat);
			});	
		}
	}
}

// Check a Filter Feature and clear current preset -------------------------
function checkFeatureAndClearPreset(key,bool){
	myLogFunc('checkFeatureAndClearPreset : '+key+' / '+bool);
	var set=getFilterSet('feature',key);
	if(typeof(set.filters) !='object'){
		return false;
	}
	myLogObj(set.filters,'filter set');
	if(set.filters.length > 0){
		myLogObj('Set feature '+key+' DONE!');
		setPresetSelectedClass('features','custom');	
		checkFeature(key,bool);
		//applyCheckedFeatures();
	}
}

// set tabulator filters from checked features --------------------------------------
function applyCheckedFeatures(){
	myLogFunc();
	var features=getCheckedFeatures();
	myLogObj(features,'checked features');
	var filters=[];
	features.forEach(feat => {
		var feat_filters=toh_filterFeatures[feat].filters;
		feat_filters.forEach(filt => {
			if(typeof filt === 'object'){
				filters.push(filt);
			}
		});
	});
	showLoading();
	filters=reorderFilters(filters); // certainly not needed, but eases debug
	tabuTable.setFilter(filters);
	updateFilterGroupState(true);	// open whichever groups ended up active
}


// reorder filters : objects, then arays-----------------------------------------------
function reorderFilters(filters) {
	myLogFunc();
	const simpleFilters = [];
	const arrayFilters = [];

	filters.forEach(filter => {
		if(Array.isArray(filter)) {
			arrayFilters.push(filter);
		} 
		else if(typeof filter === 'object' && filter !== null) {
			simpleFilters.push(filter);
		}
	});
	return [...simpleFilters, ...arrayFilters];
}


// get filters array (also merge features filters for Presets)--------------------
function getFilterSet(type, key){
	myLogFunc();
	if(type=='preset' && key in toh_filterPresets){
		var set=JSON.parse(JSON.stringify(toh_filterPresets[key])); // makes a clone
	}
	else if(type=='feature' && key in toh_filterFeatures){
		var set=JSON.parse(JSON.stringify(toh_filterFeatures[key])); // makes a clone
	}
	else{
		myLogStr('getFilterSet - Type: '+ type +', Unknown key: "'+key+'"');
		return {};
	}

	//merge filters with features.filters
	if(type=='preset'){
		if( typeof(set.features) =='object'){ // cant we write it shorter ?
			$.each(set.features,function(i,fv){
				// myLogStr(i+'->'+fv,4);
				$.each(toh_filterFeatures[fv].filters,function(j,filt){
					set.filters.push(filt);
				});
			});
		}
		else{
			set.features={};
		}
	}
	// myLogObj(set,'Filter Set');
	return set;
}

// preload DB images -----------------------------------------------
function PreLoadImagesCache(){
	if(!toh_prefs.preload){
		return;
	}
	toh_img_urls.forEach(url => {
		const img = new Image();
		img.src = url;
	});
}




// Views functions ############################################################################################################

// Make a column line -------------------------------------------
function htmlColumnLine(field,col,checked){
	let html='';
	let title	=col.title;
	let tip		=col.headerTooltip;
	if(tip==true){tip='';}
	html +='<div class="toh-col toh-col-column">';
	html +='<input type="checkbox" data-key="'+field+'"';
	if( checked ){html +=' checked="true"';} 
	html +='> <a href="#" title="'+tip+'">'+title+"</a>\n";
	html +="</div>";
	return html;
}

// Make a column Group  ------------------------------------------
// 'index' is the group's position, used to decide what starts hidden behind
// the "Show more filters" toggle.
function htmlGroup(title,group,type,index=0){
	let html='';
	let names={
		view: 'toh-viewgroup',
		filt: 'toh-filtgroup',
	};
	let icons={
		view: 'square',			// swapped for the tri-state box by updateColGroupIcons()
		filt: 'filter',
	};
	let ttip={
		view: 'Toggle group visibility',
		filt: '',
	};
	// filter groups carry their own icon (Wi-Fi, memory, ports, ...)
	let icon=icons[type];
	let extra='';
	if(type=='filt'){
		if(toh_filterGroups[group] && toh_filterGroups[group].icon){
			icon=toh_filterGroups[group].icon;
		}
		// 40-odd rows at once make the rail far too long to scan, so everything
		// past the first few groups hides behind "Show more filters"
		if(index >= toh_filters_visible_groups){
			extra=' toh-filtgroup-extra';
		}
	}
	html +='<div class="toh-group '+names[type]+extra+'" data-group="'+group+'">'+"\n"+'<div class="toh-group-title '+names[type]+'-title"><a href="#" class="view-link" title="'+ttip[type]+'">'+tohIcon(icon)+' '+title+'<span class="toh-filtgroup-count"></span></a></div>'+"\n";
	html +='<ul>'+"\n";
	return html;
}

// Display the views presets ---------------------------------
function buildViewsPresets(){
	var tmp_html='';
	tmp_html+=htmlFilterPresetButton('toh-view toh-view-custom','custom');
	tmp_html+=htmlFilterPresetButton('toh-view','all');
	tmp_html+=htmlFilterPresetButton('toh-view','none');
	for (const key in toh_colPresets){
		tmp_html+=htmlFilterPresetButton('toh-view',key);
	}
	$('#toh-cols-presets').html(tmp_html);
}

// Displays the views Columns ---------------------------------
function buildViewsColumns(){
	let columns = tabuTable.getColumnDefinitions();  
	let view="";
	let col={};

	// display known (on Prefs) fields
	$.each(toh_colGroups,function(key,arr){
		view +=htmlGroup(arr.name,key,'view');
		$.each(arr.fields,function(k,field){
			col=tabuTable.getColumn(field);
			view +=htmlColumnLine(field, col.getDefinition(), col.isVisible())
			//remove from colums
			const index = columns.findIndex(item => item.field === field);
			if (index !== -1) {columns.splice(index, 1)[0];}
		});
		view +="</ul>\n</div>\n";
	});

	// handle remaining unsorted fields (not defined in Prefs)
	if(columns.length > 0){
		view +=htmlGroup('Unsorted','unsorted','view');
		$.each(columns,function(key,arr){
			// if(arr.field === undefined){
			// 	return;
			// }
			col=tabuTable.getColumn(arr.field);
			var def=col.getDefinition();
			def.headerTooltip +=' ('+arr.field+')'; //auto column dont have a tootil (only 'true')
			view +=htmlColumnLine(arr.field, def , col.isVisible())
		});
		view +="</ul>\n</div>\n";
	}

	$("#toh-cols-columns-content").html(view);
	updateColGroupIcons();
}

// Check on/off a Column checkbox ------------------------------
function checkColumn(key,state=true){
	$(".toh-col-column INPUT[data-key="+key+"]").prop('checked',state);
	updateColGroupIcons();
}

// Check on/off ALL Columns checkboxes -------------------------
function checkAllColumns(state=true){
	$(".toh-col-column INPUT").prop('checked',state);
	updateColGroupIcons();
}

//  Show and Check on/off Column checkbox ------------------------------
function showAndCheckColumn(col,state=true){
	myLogFunc('showAndCheckColumn : '+col+' / '+state);
	showLoading();
	if(state){
		tabuTable.showColumn(col);
	}
	else{
		tabuTable.hideColumn(col);
	}
	UpdateCountCols();
	checkColumn(col,state);
}

//  Show and Check Persistent Columns ------------------------------
function showAndCheckPersistentColumns(){
	showAndCheckColumn('VIRT_edit');
	showAndCheckColumn('brand');
	showAndCheckColumn('model');
}

// Show or Hide ALL columns --------------------------------------
function showAllColumns(bool) {
	myLogFunc();
	var columnDefs = tabuTable.getColumnDefinitions();  
	columnDefs.forEach(function(column) {
		if(bool){
			tabuTable.showColumn(column.field);
		}
		else{
			tabuTable.hideColumn(column.field);
		}
	});
	UpdateCountCols();
}

// Apply a View Preset : show/hide columns -----------------------
function applyColumnPreset(key){
	myLogFunc();
	showLoading();
	//tabuTable.blockRedraw();
	setTimeout(function(){
		if(key=='all'){
			setPresetSelectedClass('columns',key);
			checkAllColumns(true);
			showAllColumns(true);
		}
		else if(key=='none'){
			setPresetSelectedClass('columns',key);
			checkAllColumns(false);
			showAllColumns(false);
		}
		else{
			var set=getColumnSet(key);
			if(set.length > 0){
				setPresetSelectedClass('columns',key);
				checkAllColumns(false);
				showAllColumns(false);
				set.forEach(col => {
					showAndCheckColumn(col);
				});	
			}
		}
	},0);
	//tabuTable.redraw(true);
	//tabuTable.restoreRedraw();
}

// Apply a (single) Column : show/hide -----------------------
function applyColumCol(key,state){
	myLogFunc();
	setPresetSelectedClass('columns','custom');	
	showAndCheckColumn(key,state);
}

// get filters array (also merge features filters for Presets)--------------------------
function getColumnSet(key){
	myLogFunc();
	set=[];
	if(key=='all'){
		$.each(toh_colPresets,function(k,col){
			if(!set.includes(col)){
				set.push(col);
			}
		});
	}
	else if (key=='none'){
		set=[];
	}
	else if(typeof(toh_colPresets[key]) !='undefined'){
		set=toh_colPresets[key];
	}
	return set;
}

// set columns view depending on the selected Filter option ---------------------------------
function applyColumnsFromFilters(){
	myLogFunc();
	var opt=$("#toh-filters-options INPUT[name='filtcol']:checked").val();
	var fields	=getTableFiltersFields('all');
	showLoading();
	setTimeout(function(){
		if(opt=='add'){
			setPresetSelectedClass('columns','custom');
			$.each(fields,function(i,col){
				showAndCheckColumn(col);
			});
			showAndCheckPersistentColumns();
		}
		else if(opt=='repl'){
			setPresetSelectedClass('columns','custom');
			showAllColumns(false);
			checkAllColumns(false);
			$.each(fields,function(i,col){
				showAndCheckColumn(col);
			});
			showAndCheckPersistentColumns();
		}
	},0);
}

// Badge each group with how many of its filters are on ---------------------
// If an active filter sits in a group that is hidden behind "Show more
// filters", reveal the rest so it is never silently applied out of sight.
function updateFilterGroupState(reveal_active=false){
	var hidden_active=false;
	$('.toh-filtgroup').each(function(){
		const $group=$(this);
		const checked=$group.find('.toh-filter-feature INPUT:checked').length;
		$group.find('.toh-filtgroup-count').text(checked ? checked : '');
		$group.toggleClass('has-active', checked > 0);
		if(checked > 0 && $group.hasClass('toh-filtgroup-extra')){
			hidden_active=true;
		}
	});
	if(reveal_active && hidden_active){
		$('#toh-filters-features-content').addClass('show-all');
	}
}

// Update group Icons in the columns block ------------------
function updateColGroupIcons(){
	myLogFunc();
	$('.toh-viewgroup').each(function(i){
		var total=$(this).find('.toh-col-column').length;
		var checked=$(this).find('.toh-col-column INPUT:checked').length;
		var icon ="";
		if(checked==total){
			icon='square-check';
		}
		else if(checked==0){
			icon='square';
		}
		else{
			icon='square-minus';
		}
		tohSetIcon($(this).find('.toh-viewgroup-title .toh-ico'), icon);
	});
}

//
function setPresetSelectedClass(type,key=''){
	myLogFunc('setPresetSelectedClass : '+type+'/'+key);
	var myclass='toh-selected';
	if(type=='features'){
		var sel='.toh-filters-presets';
	}
	else if(type=='columns'){
		var sel='#toh-cols-title .toh-top-title-presets';

	}
	else{
		myLogStr('setPresetSelectedClass - Unkwnon type:'+type,1);
		return false;
	}
	if(key !=''){
		$(sel+' A').removeClass(myclass);
		$(sel+' A[data-key='+key+']').addClass(myclass);
		//toh_current_preset.columns=key;
	}
	else{
		$(sel+' A').removeClass(myclass);
		//toh_current_preset.columns='';
	}
}




// URL functions ##############################################################################################################

// Get Url parameter -----------------------------------------------
function getUrlParameter(name) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	var results = regex.exec(location.search);
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Get Url parameter or default value -----------------------------
function getUrlParameterOrDefault(name, defaultValue='') {
	var value = getUrlParameter(name);
	return value !== '' ? value : defaultValue;
}

// update the browser Url (without reloading the page) ------------
function updateBrowserUrl(newURL) {
	const state = {}; // State object
	const title = ''; // Title (ignored by most browsers)
	history.replaceState(state, title, newURL);
}

// get the currently checked features ---------------
function getCheckedFeatures(){
	var checked=[];
	$('.toh-filters-list INPUT').each(function(i){
		if($(this).is(':checked')){
			checked.push($(this).attr('data-key'));
		}
	});
	return checked;
}

// get the currently checked columns ---------------
function getCheckedColumns(){
	var checked=[];
	$('.toh-col-column INPUT').each(function(i){
		if($(this).is(':checked')){
			checked.push($(this).attr('data-key'));
		}
	});
	// myLogObj(checked,'checked');
	return checked;
}

// build, then update the browser Url  ------------------------------
function buildBrowserUrl(and_update=true){
	myLogFunc();
	var url=window.location.pathname;
	var params=[];
	var tmp_list;
	var tmp_preset;

	// make features
	tmp_preset=$('#toh-filters-presets A.toh-selected').attr('data-key');
	if(tmp_preset !=undefined){
		params.push(toh_prefs.p_filter+'='+tmp_preset);
	}
	else{
		tmp_list= getCheckedFeatures();
		if(tmp_list.length>0){
			params.push( toh_prefs.p_features+'='+tmp_list.join(",") );
		}
	}

	// make colums
	tmp_preset=$('#toh-cols-presets A.toh-selected').attr('data-key');
	if(tmp_preset !=undefined && tmp_preset !='custom'){
		params.push(toh_prefs.p_view+'='+tmp_preset);
	}
	else{
		tmp_list= getCheckedColumns();
		if(tmp_list.length>0){
			params.push( toh_prefs.p_columns+'='+tmp_list.join(",") );
		}  
	}

	// compared devices, so a comparison can be linked to
	if(toh_compare.length > 0){
		params.push('compare=' + toh_compare.join(','));
	}

	// the manufacturer / chipset page currently open
	if(toh_facet_open){
		params.push(toh_facets[toh_facet_open.type].param + '=' + encodeURIComponent(toh_facet_open.value));
	}

	if(and_update){
		url +="?";
		url +=params.join('&');
		updateBrowserUrl(url);
	}
	//myLogStr('URL: '+url);
	return url + '?' + params.join('&');
}




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


// Manufacturer / chipset pages ###############################################################################################
// Both are the same shape - group the data by one field, then describe the
// group - so they share a renderer and differ only in what they measure.

const toh_facets={
	brand:  {param:'brand',   field:'brand', title:'Manufacturer', related:{field:'target', label:'Targets'}},
	chipset:{param:'chipset', field:'cpu',   title:'Chipset',      related:{field:'brand',  label:'Manufacturers'}},
};

let toh_facet_open=null;			// {type, value} while a facet page is showing
let toh_facet_pending=null;			// read from the URL before the table exists

// How a device stands with regard to OpenWrt releases -----------------------
function tohSupportState(row){
	const v=String(row.supportedcurrentrel === null || row.supportedcurrentrel === undefined ? '' : row.supportedcurrentrel).trim().toLowerCase();
	if(v === '' || v === '-' || v === '?'){
		return 'unknown';
	}
	if(v === 'eol'){
		return 'eol';
	}
	if(v === 'snapshot'){
		return 'snapshot';
	}
	return 'supported';
}

function tohFacetRows(type, value){
	const f=toh_facets[type];
	return tabuTable.getData().filter(d => String(d[f.field]) === String(value));
}

// Count values of a field, most common first -------------------------------
function tohCountBy(rows, field){
	const counts={};
	rows.forEach(r => {
		let v=r[field];
		if(Array.isArray(v)){ v=v[0]; }
		if(v === null || v === undefined || v === '' || v === '-'){ return; }
		counts[v]=(counts[v]||0)+1;
	});
	return Object.entries(counts).sort((a,b) => b[1]-a[1]);
}

// Open a manufacturer or chipset page --------------------------------------
function tohOpenFacet(type, value){
	const f=toh_facets[type];
	if(!f || !value){
		return;
	}
	const rows=tohFacetRows(type, value);
	if(rows.length === 0){
		return;
	}
	toh_facet_open={type:type, value:value};

	const states={supported:0, snapshot:0, eol:0, unknown:0};
	rows.forEach(r => states[tohSupportState(r)]++);

	let html='';

	// headline -------------------------------------------------------------
	html +='<div class="toh-facet-title">'
		+ '<span class="toh-facet-kind">' + f.title + '</span>'
		+ '<h2>' + value + '</h2>'
		+ '<p class="toh-facet-count"><b>' + rows.length.toLocaleString('en-US') + '</b> devices</p>'
		+ '</div>';

	// what we can say about the group itself -------------------------------
	let facts=[];
	if(type === 'chipset'){
		const arch=tohCountBy(rows,'packagearchitecture');
		const mhz=rows.map(r => parseInt(r.cpumhz,10)).filter(n => !isNaN(n) && n > 0);
		const since=rows.map(r => r.supportedsincerel).filter(v => v && v !== '-').sort();
		if(arch.length){
			facts.push(['Architecture', arch[0][0]]);
		}
		if(mhz.length){
			const lo=Math.min(...mhz), hi=Math.max(...mhz);
			facts.push(['Clock', lo === hi ? lo + ' MHz' : lo + '–' + hi + ' MHz']);
		}
		if(since.length){
			facts.push(['First supported', 'OpenWrt ' + since[0]]);
		}
		facts.push(['Still on a release', states.supported > 0 ? 'Yes, ' + states.supported + ' devices' : 'No']);
	}
	else {
		const targets=tohCountBy(rows,'target');
		facts.push(['On a current release', String(states.supported)]);
		facts.push(['Snapshot only', String(states.snapshot)]);
		facts.push(['End of life', String(states.eol)]);
		facts.push(['Targets', String(targets.length)]);
	}
	html +='<div class="toh-facet-facts">';
	facts.forEach(([k,v]) => {
		html +='<div class="toh-fact"><span class="toh-fact-label">' + k + '</span><span class="toh-fact-value">' + v + '</span></div>';
	});
	html +='</div>';

	// support breakdown ----------------------------------------------------
	html +='<div class="toh-facet-block"><h3>Support status</h3>' + tohSupportBar(states, rows.length) + '</div>';

	// the related dimension, as links to the other kind of page ------------
	const rel=tohCountBy(rows, f.related.field);
	if(rel.length){
		const other=(type === 'chipset') ? 'brand' : null;
		html +='<div class="toh-facet-block"><h3>' + f.related.label + '</h3><div class="toh-facet-chips">';
		rel.slice(0,24).forEach(([k,n]) => {
			const inner='<span>' + k + '</span><b>' + n + '</b>';
			html += other
				? '<a href="#" class="toh-facet-chip js-toh-facet" data-type="' + other + '" data-value="' + tohAttr(k) + '">' + inner + '</a>'
				: '<span class="toh-facet-chip">' + inner + '</span>';
		});
		html +='</div></div>';
	}

	// the devices themselves -----------------------------------------------
	html +='<div class="toh-facet-block"><h3>Devices</h3>' + tohFacetDeviceList(rows, type) + '</div>';

	$('#toh-facet-body').html(html);
	$('#toh-facet-panel').removeClass('toh-hidden');
	$('#toh-main, #toh-hero, #toh-compare-panel').addClass('toh-hidden');
	$('body').removeClass('toh-sidebar-open');
	window.scrollTo(0,0);
	tohFacetUrl();
}

// Escape a value for use in an HTML attribute -------------------------------
function tohAttr(v){
	return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Stacked bar of the four support states ------------------------------------
function tohSupportBar(states, total){
	const parts=[
		['supported','On a current release',states.supported],
		['snapshot','Snapshot only',states.snapshot],
		['eol','End of life',states.eol],
		['unknown','Unknown',states.unknown],
	].filter(p => p[2] > 0);

	let bar='<div class="toh-supportbar">';
	parts.forEach(([k,label,n]) => {
		bar +='<span class="toh-supportbar-part is-' + k + '" style="width:' + (100*n/total) + '%" title="' + label + ': ' + n + '"></span>';
	});
	bar +='</div><div class="toh-supportbar-legend">';
	parts.forEach(([k,label,n]) => {
		bar +='<span class="toh-legend is-' + k + '"><i></i>' + label + ' <b>' + n + '</b></span>';
	});
	bar +='</div>';
	return bar;
}

// Compact device table on a facet page --------------------------------------
function tohFacetDeviceList(rows, type){
	// newest first where we can tell, so "latest devices" is at the top
	const sorted=rows.slice().sort((a,b) => {
		const ya=String(a.availability||'').match(/\d{4}/);
		const yb=String(b.availability||'').match(/\d{4}/);
		const na=ya?parseInt(ya[0],10):0, nb=yb?parseInt(yb[0],10):0;
		if(na !== nb){ return nb-na; }
		return String(a.model).localeCompare(String(b.model));
	});

	let html='<table class="toh-facet-table"><thead><tr>'
		+ (type === 'chipset' ? '<th>Brand</th>' : '')
		+ '<th>Model</th><th>Target</th><th>RAM</th><th>Flash</th><th>Release</th><th></th>'
		+ '</tr></thead><tbody>';

	// values like "128NAND" or "microSD" already carry their own unit
	const withMb=(v) => {
		if(v === null || v === undefined || v === '' || v === '-'){ return ''; }
		const s=Array.isArray(v) ? v.join(', ') : String(v);
		return /^\d+$/.test(s.trim()) ? s + ' MB' : s;
	};

	sorted.forEach((d,i) => {
		html +='<tr' + (i >= 25 ? ' class="toh-facet-more-row"' : '') + '>'
			+ (type === 'chipset' ? '<td>' + (d.brand||'') + '</td>' : '')
			+ '<td class="toh-facet-model">' + (d.model||'') + '</td>'
			+ '<td>' + (d.target||'') + '</td>'
			+ '<td>' + withMb(d.rammb) + '</td>'
			+ '<td>' + withMb(d.flashmb) + '</td>'
			+ '<td>' + FormatterRelease({getValue:() => d.supportedcurrentrel}) + '</td>'
			+ '<td class="toh-facet-go"><a href="' + tohAttr(_maketHwDataUrl(d.deviceid)) + '" target="_blank" rel="noopener" title="Hardware data page">'
			+ tohIcon('external-link') + '</a></td>'
			+ '</tr>';
	});
	html +='</tbody></table>';

	if(sorted.length > 25){
		html +='<a href="#" class="toh-facet-showall">Show all ' + sorted.length + ' devices</a>';
	}
	return html;
}

function tohCloseFacet(){
	toh_facet_open=null;
	$('#toh-facet-panel').addClass('toh-hidden');
	$('#toh-main, #toh-hero').removeClass('toh-hidden');
	tohFacetUrl();
}

// Keep the address bar in step so a facet page can be linked to ------------
function tohFacetUrl(){
	buildBrowserUrl();
}

function tohFacetReadUrl(){
	for(const type in toh_facets){
		const v=getUrlParameter(toh_facets[type].param);
		if(v){
			return {type:type, value:v};
		}
	}
	return null;
}


// Cookie functions ###########################################################################################################

// save a cookie ---------------------------------------------------
function saveCookie(c_name, content, do_delete=false, type='json'){
	myLogFunc();
	var c_path=toh_prefs.cook_path;
	if(c_path==''){
		c_path=window.location.pathname;
	}
	var c_content=content;
	if(type=='json'){
		c_content=JSON.stringify(content);
	}
	var dur=toh_prefs.cook_duration;
	if(do_delete){
		dur=0;
	}
	document.cookie = toh_prefs.cook_prefix + c_name + "=" + encodeURIComponent(c_content) + "; max-age="+dur+"; path="+c_path;
}

// extract a cookie from the list---------------------------------------------------
function _extractCookie(name) {
	myLogFunc();
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) return parts.pop().split(';').shift();
  }

// load a cookie ---------------------------------------------------
function loadCookie(c_name, type='json'){
	myLogFunc('loadCookie name: '+c_name);
	var cookie=_extractCookie(toh_prefs.cook_prefix + c_name);
	myLogStr('result: '+cookie);

	if(cookie){
		var c_content=decodeURIComponent(cookie);
		if(type=='json'){
			return JSON.parse(c_content);
		}
		else{
			return c_content;
		}
	}
	else{
		return false;
	}
}

// Load All Preset Cookies -----------------------------
function loadPresetCookies(type){ //'features' or 'columns'
	myLogFunc('loadCookie name: '+type);
	var c_value	='';

	for (let i = 1; i <= toh_prefs.cook_preset_count; i++) {
		c_value=loadCookie(toh_prefs['cook_name_'+type]+i);
		myLogStr('p'+i+' / '+c_value,4);
		if(typeof(toh_cookies[type]) !='object'){
			myLogStr('create type:'+type,4);
			toh_cookies[type]={};
		}
		if(c_value !=undefined || c_value==''){
			myLogStr('save: '+c_value,4);
			toh_cookies[type][i]=c_value;
		}
		else{
			myLogStr('create index: '+i,4);
			toh_cookies[type][i]={};
		}		
	}
	myLogObj(toh_cookies,'result',4);
}

// Store User Preset in Cookie -----------------------------
function storePresetCookie(type, number=0, name='user'){ // type= 'features' or 'columns'
	myLogFunc('storePresetCookie: '+type+', '+number+', '+name);
	if(name==''){
		name=number;
	}
	var preset={
		name: name,
		list: []
	};
	if(type=='features'){
		preset.list=getCheckedFeatures();
		saveCookie(toh_prefs.cook_name_features+number, preset);
		toh_cookies[type][number]=preset;
	}
	else if(type=='columns'){
		preset.list=getCheckedColumns();
		saveCookie(toh_prefs.cook_name_columns+number, preset);
		toh_cookies[type][number]=preset;
	}
	myLogObj(preset.list,'preset.list',4);
}

// Delete User Preset Cookie --------------------------
function deletePresetCookie(type, number){
	if(type=='features'){
		saveCookie(toh_prefs.cook_name_features+number, false,true);
	}
	else if(type=='columns'){
		saveCookie(toh_prefs.cook_name_columns+number, false,true);
	}
}

// Build User Preset Menu -----------------------------
function buildUserPresets(type){// type= 'features' or 'columns'
	myLogFunc('buildUserPresets: '+type);
	var sel='';
	var name='';
	var html='';
	if(type=='features'){
		sel="#toh-filters-upresets .toh-upresets-content";
	}
	else if(type=='columns'){
		sel="#toh-cols-upresets .toh-upresets-content";
	}
	else{
		return false;
	}
	for (let i = 1; i <= toh_prefs.cook_preset_count; i++) {
		myLogStr('pr'+i,4);
		var myclass='';
		if(typeof(toh_cookies[type][i])=='object'){
			if(typeof(toh_cookies[type][i].name) =='string'){
				name=toh_cookies[type][i].name;
				myclass="toh-used";
			}
			else{
				name=i;
			}
		}
		else{
			name=+i;
		}
		html +='<a href="#" class="toh-upreset-but '+myclass+'" data-key="'+i+'" data-type="'+type+'">'+name+'</a>';
	}
	$(sel).html(html);
}

// Appy a User Preset -----------------------------------------------
function applyUserPreset(type,num){
	myLogFunc();
	var preset=toh_cookies[type][num];
	if(preset==false){
		myLogStr('empty preset: '+type+'/'+num,1);
	}
	if(type=='features'){
		setPresetSelectedClass(type,'custom');
		clearAllFeatures();
		checkAllFeatures(false);
	}
	else if(type=='columns'){
		setPresetSelectedClass(type,'custom');
		showAllColumns(false);
		checkAllColumns(false);
	}
	else{
		return false;
	}
	$.each(preset.list,function(i,key){
		if(type=='features'){
			checkFeatureAndClearPreset(key,true);
		}
		else if(type=='columns'){
			applyColumCol(key,true);
		}
		else{
			return false;
		}
	});
	if(type=='features'){
		applyCheckedFeatures();
	}
}

// Load Cookies and Build User Preset menu -----------------------------
function loadCookiesAndBuildUserPresets(){
	loadPresetCookies('features');
	loadPresetCookies('columns');
	buildUserPresets('features');
	buildUserPresets('columns');
	$(".toh-upresets-title A").prop('title',toh_prefs.tooltip_upreset);
	
}




// Log functions ##############################################################################################################

// custom log String -----------------------------------------------------
function myLogStr(line=null, level=2, is_title=false) { // levels: 1=info, 2=debug, 3=verbose, 4=full

	if(level > toh_debug_level){
		return;
	}
	const pad_lenght=80;
	const p='-';
	if(is_title){
		line =p+p+" "+ line + " ";
		line =line.padEnd(pad_lenght,p);
	}
	else{
		line= " - "+line;
	}

	console.log(line);
}
// custom log Function -----------------------------------------------------
function myLogFunc(custom_title=null,level=3){
	if(level > toh_debug_level){
		return;
	}
	if(custom_title==null){
		//custom_title= arguments.callee.caller.name;
		custom_title=getCallerName();
	}
	myLogStr(custom_title,level,true);
}
// custom log Object -------------------------------------------------------
function myLogObj(obj,desc='',level=3) {
	if(level > toh_debug_level){
		return;
	}
	if(desc.length>0){
		desc=desc + ": ";
	}

	console.log(" * "+desc+": ",obj);
}
// get the Calling func name
function getCallerName() {
	try {
		throw new Error();
	} catch (e) {
		const stack = e.stack.split('\n');
		// The caller is typically the third item in the stack
		const callerLine = stack[2];
		//myLogObj(callerLine,'Stack');
		// Extract the function name using regex
		const match = callerLine.match(/(at)?\s*([^@]+)/);
		//myLogStr('found: '+match[2]);
		return match ? match[2] : 'anonymous';
	}
  }




// Misc functions #############################################################################################################

async function FetchReleases() {
	try {
		const versionData = await $.ajax({
			url: toh_urls.firm_versions,
			method: 'GET'
		});
		const cur_url = toh_urls.firm_releases.replace('VERSION', versionData.stable_version);

		const releaseData = await $.ajax({
			url: cur_url,
			method: 'GET'
		});

		toh_firmwares = releaseData.profiles;
		toh_firmwares_fetched =true;
	} 
	catch (error) {
		myLogObj(error,'Error fetching releases', 1);
	}
}

function GetFirmwareSelectUrl(id, target) {
	const found= toh_firmwares.some(item => item.id == id && item.target == target);
	if(found){
		return toh_urls.firm_select + '?target='+ target + "&id=" + id;
	}
	return false;
}

// Position the Image Preview div -------------------------------
function positionPreview($link, $container) {
	var linkOffset = $link.offset();
	var linkWidth = $link.outerWidth();
	var linkHeight = $link.outerHeight();
	var containerWidth = $container.outerWidth();
	var containerHeight = $container.outerHeight();
	var windowWidth = $(window).width();
	var windowHeight = $(window).height();
	var scrollTop = $('BODY').scrollTop();

	var left = linkOffset.left + linkWidth + 10; // 10px to the right of the link
	var top = linkOffset.top + scrollTop;

	// Check if the preview would go off the right edge of the window
	if (left + containerWidth > windowWidth) {
		left = linkOffset.left - containerWidth - 10; // 10px to the left of the link
	}

	// Check if the preview would go off the bottom of the viewport
	if (top + containerHeight > scrollTop + windowHeight) {
		top = Math.max(scrollTop, top + linkHeight - containerHeight);
	}

	// Ensure the preview doesn't go above the top of the viewport
	top = Math.max(scrollTop, top);

	$container.css({
		left: left,
		top: top
	});
}



var loading_is_running	= false;
var loading_last_time 		= 0;
const loading_duration	= 400;
// Show Loading --------------------------------------------------------
function showLoading(){
	myLogFunc();
	if(!loading_is_running){
		loading_is_running	=true;
		loading_last_time	= Date.now();
		ChangeFavicon('anim');
		$('#toh-header-loading').show();
		$('BODY').addClass('toh-loading');
	}
}
// Hide Loading --------------------------------------------------------
function hideLoading() {
	myLogFunc();
	if(loading_is_running){
		const timeSinceShow = Date.now() - loading_last_time;
		if (timeSinceShow < loading_duration) {
			setTimeout(hideLoading, loading_duration - timeSinceShow);
		}
		else {
			ChangeFavicon('trans');
			$('#toh-header-loading').hide();
			$('BODY').removeClass('toh-loading');
			loading_is_running = false;
		}
	}
}

// Change the favicon  --------------------------------------------------
function ChangeFavicon(type){
	//myLogStr('START fav='+type,1);
	var el=$('link[rel=icon]');
	
	var icon='static/img/favicon_trans.png';
	if(type=='anim'){
		icon='static/img/favicon_anim.gif';
	}

	if(el.attr('href') == icon ){
		//myLogStr('fav ALREADY set',1);
		return;
	}
	el.prop('href',icon);
	return;

	// el.remove(); // Remove the old favicon
	// el = $('<link>', {
	// 	rel: 'icon',
	// 	href: icon
	// });
	// $('head').append(el);
	// el[0].offsetHeight; 

	// Force browser favicon repaint
	// document.title = document.title + ' '; // Trigger tab repaint
	// setTimeout(() => document.title = document.title.trim(), 50); // Reset title
}


// Set default Filters & View -------------------------------------------
function SetDefaults(){
	myLogFunc();

	//show presets
	if(toh_prefs.def_show_filters){
		$(".toh-filters-but-toggle").trigger('click');
	}

	//show views
	if(toh_prefs.def_show_views){
		$(".toh-cols-but-toggle").trigger('click');
	}

	var tmp_value;
	var tmp_arr;
		
	//columns or columns preset
	tmp_value=getUrlParameter(toh_prefs.p_columns);
	if(tmp_value == ''){
		// set preset
		tmp_value=getUrlParameterOrDefault(toh_prefs.p_view, toh_prefs.def_view);
		if(getColumnSet(tmp_value).length == 0){
			tmp_value=toh_prefs.def_view;
		}
		applyColumnPreset(tmp_value);
	}
	else{
		tmp_arr=tmp_value.split(',');
		$.each(tmp_arr,function(i,key){
			applyColumCol(key,true);
		});
	}
		
	//features or filter preset
	tmp_value=getUrlParameter(toh_prefs.p_features);
	if(tmp_value == ''){
		myLogStr('Set Filter Preset',4);
		// set preset
		tmp_value=getUrlParameterOrDefault(toh_prefs.p_filter, toh_prefs.def_filter);
		applyFilterPreset(tmp_value);
		//myLogStr('DONE',4);
	}
	else{
		myLogStr('Set Filter Features',4);
		tmp_arr=tmp_value.split(',');
		$.each(tmp_arr,function(i,key){
			checkFeatureAndClearPreset(key,true);
		});
		applyCheckedFeatures();
	}

	//myLogStr('SetDefaults URL',4);
	buildBrowserUrl();
	toh_table_inited=true;
}

// Display filtered / total count ------------------------------------------
function UpdateCountRows(){
	var html='';
	selected	=tabuTable.getDataCount("active");
	total		=tabuTable.getDataCount();
	if(selected < total){
		html='<b>'+selected+"</b> / ";
	}
	html +="<i>"+total+"</i>";
	$('.toh-count-rows-full').html(html);
	
	//$('.toh-count-rows').html(selected);
	$('#toh-bot-buttons OPTION[value=all]').html(total + " total");
	$('#toh-bot-buttons OPTION[value=active]').html(selected + " filtered");
}

// Display filtered / total count ------------------------------------------
function UpdateCountCols(){
	var html='';
	selected	=tabuTable.getColumns().filter(col => col.isVisible()).length;
	total		=tabuTable.getColumns().length;
	if(selected < total){
		html='<b>'+selected+"</b> / ";
	}
	html +="<i>"+total+"</i>";
	$('.toh-count-cols-full').html(html);
	//$('.toh-count-cols').html(selected);
}

// Fill the four figures in the page header --------------------------------
// 'data' is the raw toh.json payload: rows are arrays indexed by data.columns.
function UpdatePageStats(data){
	myLogFunc();
	const rows=data.entries;
	const col =(name) => data.columns.indexOf(name);

	const i_brand	=col('brand');
	const i_target	=col('target');
	const i_release	=col('supportedcurrentrel');

	// a value that is missing, '-' or '?' means "we don't know", not "none"
	const known=(v) => typeof v === 'string' && v.length > 0 && v !== '-' && v !== '?';

	const brands	=new Set();
	const targets	=new Set();
	let   supported	=0;

	rows.forEach(function(row){
		if(i_brand  > -1 && known(row[i_brand]))	{brands.add(row[i_brand]);}
		if(i_target > -1 && known(row[i_target]))	{targets.add(row[i_target]);}
		// 'EOL' means the device dropped off the supported releases
		if(i_release > -1 && known(row[i_release]) && row[i_release] !== 'EOL'){supported++;}
	});

	const num=(n) => n.toLocaleString('en-US');
	$('#toh-stat-devices').text(num(rows.length));
	$('#toh-stat-supported').text(num(supported));
	$('#toh-stat-targets').text(num(targets.size));
	$('#toh-stat-brands').text(num(brands.size));
}

// Size the table container -------------------------------------------------
// Two constraints. It should be tall enough for one page of rows, so the
// pagination is not fighting a half-visible row - every part is measured, since
// the header grows with the filter inputs and a rendered row is taller than
// tabulatorOptions.rowHeight by its border. But it must also never be taller
// than the viewport can show, or a 30-row page runs off a laptop screen; past
// that the rows scroll inside the table and the header stays put.
function tohSetTableHeight(size){
	const $container=$('#toh-table-container');
	// a row element can exist before it has been laid out, and would measure 0
	let h_row		=$('#toh-table .tabulator-row').first().outerHeight();
	if(!h_row || h_row < 8){
		h_row=tabulatorOptions.rowHeight + 1;	// +1 for the row border
	}
	const h_head	=$('#toh-table .tabulator-header').outerHeight()	|| 53;
	const h_foot	=$('#toh-table .tabulator-footer').outerHeight()	|| 50;
	const h_scroll	=17;								// horizontal scrollbar
	const h_chrome	=h_head + h_foot + h_scroll;

	// how much room is left below the toolbar once the card is scrolled up
	// under the app bar, minus a little breathing space
	const h_appbar	=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--appbar-h'),10) || 48;
	const h_toolbar	=$('#toh-toolbar').outerHeight() || 0;
	const h_avail	=Math.max(toh_table_min_height, window.innerHeight - h_appbar - h_toolbar - 48);

	let rows=parseInt(size,10);
	if(size === true || size === 'true' || isNaN(rows)){	// "show all rows"
		rows=tabuTable ? tabuTable.getDataCount("active") : 0;
	}

	const wanted=Math.ceil(h_chrome + (h_row * rows));
	const height=Math.min(wanted, Math.ceil(h_avail));

	myLogStr('Table Set height: ' + height + ' (wanted ' + wanted + ', row ' + h_row + ')', 2);
	$container.height(height);
	// only let the rows scroll when we actually had to clip the page
	$('#toh-table .tabulator-tableholder').css('overflow-y', height < wanted ? 'auto' : 'hidden');
	return height;
}

// jquery shake effect -----------------------------------------------------
$.fn.shake = function(interval = 100, distance = 10, times = 3) {
	this.css('position', 'relative');
	for (let i = 0; i < times + 1; i++) {
		this.animate({left: (i % 2 == 0 ? distance : distance * -1)}, interval);
	}
	return this.animate({left: 0}, interval);
};


/*
//create indexed object  ---------------------------------------
function createIndexedObject(arrayOfObjects, key) {
	return arrayOfObjects.reduce((acc, obj) => {
		if (obj.hasOwnProperty(key)) {
			acc[obj[key]] = obj;
		}
		return acc;
	}, {});
}
*/
// get Vitual Columns ------------------------------------------------------
function getVirtualColumns() {
	return Object.entries(toh_colStyles)
		.filter(([key]) => key.startsWith("VIRT_"))
		.map(([f, value]) => ({
			field: f,			// needed to allow col.getDefinition() to work
			visible: false,     // Hodden by default
			...value            // Spread existing properties
		}));
}

// --Fetch and Display the Changelog ----------------------------------------------------------------
function FetchAndPrintChangelog(){
	fetch('CHANGELOG.md')
    .then(response => response.text())
    .then(data => {
        const lines = data.split('\n');
        const result = [];
        let currentObject = null;
        
        // Process each line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check for subtitle
            if (line.startsWith('##')) {
                if (currentObject) {
                    result.push(currentObject);
                }
                currentObject = {
                    title: line.substring(2).trim(), // Remove '##' and trim
                    list: ''
                };
            }
            // Check for bullet points if we have a current object
            else if (currentObject && line.startsWith('*')) {
                currentObject.list += (currentObject.list ? '\n' : '') + line;
            }
        }
        
        // Push the last object if it exists
        if (currentObject) {
            result.push(currentObject);
        }
        
        if (result.length > 0) {
    	    // Insert the first result 
			$('#toh-changelog-latest').html('<div class="toh-changelog-release"><h5>' + result[0].title + ' <span class="badge">v'+ toh_app.version +'</span></h5>' + snarkdown(result[0].list)) +'</div>';

			// then the others results
			var html='';
			for (let i = 1; i < result.length; i++) {
				html +='<div class="toh-changelog-release"><h5>' + result[i].title + '</h5>' + snarkdown(result[i].list) +'</div>';
            }
			$('#toh-changelog-previous').html(html);

			$("#toh-changelog").show();

        }
    })
    .catch(error => myLogStr('Cannot load CHANGELOG! Error: '+ error));
}













// ############################################################################################################################
// ## MAIN ####################################################################################################################
// ############################################################################################################################

var tabuTable;
var toh_table_inited=false;
var toh_cookies={};
// var toh_current_preset={
// 	features:	'',
// 	columns:	''
// };

$(document).ready(function () {
	// update html variables placeholders -----------------------------------
	$('.js-toh-app').each(function() {
		var prop = $(this).data('prop');	// Get the property name from data-prop attribute
		$(this).text(toh_app[prop]);		// Set the text content to the corresponding value from toh_app
	});
	// Add branch-dev class to body if branch is 'dev'
	if (toh_app.branch === 'dev') {
		$('body').addClass('branch-dev');
		FetchAndPrintChangelog();
	}

	//set title Link URL ----------------------------------------------------
	$('#toh-header-title H1 A').attr('href',window.location.pathname);

	// initialize table  -----------------------------------------------------
	tabuTable = new Tabulator("#toh-table", tabulatorOptions);

	// handles Image Preview on hover ----------------------------------------
	var $container = $('#toh-image-preview');
	$(document).on({
		mouseenter: function(e) {
			var $link = $(this);
			var imageUrl = $link.attr('href');
			$container.html('<img src="' + imageUrl + '" alt="Image Preview">');
		
			// Wait for the image to load before positioning
			$container.find('img').on('load', function() {
				positionPreview($link, $container);
			});

			$container.show();
		},
		mouseleave: function() {
			$container.hide().empty();
		}
	}, 'a.cell-image');


	// Observe the DOM to show/hide the loading icon  --------------------------
	// (because i've not found a Tabulator event to do that, ie when changing a large amount of column visibility)
	var observer = new MutationObserver(function(mutations) {
		// Debounce the callback to avoid multiple triggers
		clearTimeout(window.domChangeTimer);
		window.domChangeTimer = setTimeout(function() {
			// Trigger a custom event when DOM changes are complete
			$(document).trigger('table-change-complete');
		}, 100);
	});

	// Start observing the document body
	observer.observe(document.getElementById('toh-table'), { childList: true, subtree: true });

	// Bind to the custom event
	$(document).on('table-change-complete', function() {
		myLogStr('EVENT: table-change-complete');
		hideLoading();
		tableLoadingHide();
	});
	

	// make column order from the toh_colGroups ------------------------------
	let columnOrder=[];
	$.each(toh_colGroups,function(key,obj){
		$.each(obj.fields,function(f,field){
			columnOrder.push(field);
		});
	});

	//  Click: Toggle the sidebar Filters section ---------------------
	$('.toh-filters-but-toggle').on('click',function(e){
		e.preventDefault();
		$('#toh-filters-container').toggle();
		$(this).toggleClass('is-open');
	});

	//  Click: Toggle the Columns toolbar menu -----------------------
	$('.toh-cols-but-toggle').on('click',function(e){
		e.preventDefault();
		e.stopPropagation();
		closeToolbarMenus('#toh-cols-container');
		$('#toh-cols-container').toggle();
		$(this).toggleClass('is-open');
	});

	//  Click: Toggle the Export toolbar menu ------------------------
	$('.toh-export-but-toggle').on('click',function(e){
		e.preventDefault();
		e.stopPropagation();
		closeToolbarMenus('#toh-bot');
		$('#toh-bot').toggle();
		$(this).toggleClass('is-open');
	});

	// Only one toolbar menu open at a time; 'except' is the panel being toggled.
	function closeToolbarMenus(except=''){
		$('.toh-menu').each(function(){
			const $panel=$(this).find('.toh-menu-panel');
			if(except && $panel.is(except)){
				return;
			}
			$panel.hide();
			$(this).find('.toh-menu-but').removeClass('is-open');
		});
	}

	$(document).on('click',function(e){
		if($(e.target).closest('.toh-menu').length === 0){
			closeToolbarMenus();
		}
	});
	$(document).on('keydown',function(e){
		if(e.key === 'Escape'){
			closeToolbarMenus();
			tohCloseSidebar();
		}
	});

	//  Click: Toggle the sidebar drawer (narrow viewports) ----------
	$('#toh-sidebar-toggle').on('click',function(e){
		e.preventDefault();
		$('body').toggleClass('toh-sidebar-open');
	});
	$('#toh-sidebar-scrim').on('click',tohCloseSidebar);

	function tohCloseSidebar(){
		$('body').removeClass('toh-sidebar-open');
	}

	//  Resize: keep the table inside the viewport -------------------
	var toh_resize_timer=null;
	$(window).on('resize',function(){
		if(!toh_table_inited){
			return;
		}
		clearTimeout(toh_resize_timer);
		toh_resize_timer=setTimeout(function(){
			tohSetTableHeight($('.tabulator-page-size').val() || tabulatorOptions.paginationSize);
		},150);
	});

	// Compare ################################################################################################################

	// tick a device in the table
	$('#toh-table').on('click','.toh-compare-check',function(e){
		e.stopPropagation();				// the cell click would open the details popup
		const id=$(this).attr('data-id');
		if(!tohCompareToggle(id, $(this).is(':checked'))){
			$(this).prop('checked', false);
			$('#toh-compare-tray').shake();
		}
	});
	// the checkbox sits in a cell that opens the popup on click
	$('#toh-table').on('mousedown touchstart','.toh-compare-check',function(e){
		e.stopPropagation();
	});

	// drop one from the tray
	$('#toh-compare-chips').on('click','.toh-compare-drop',function(e){
		e.preventDefault();
		tohCompareToggle($(this).attr('data-id'), false);
	});

	$('#toh-compare-reset').on('click',function(e){
		e.preventDefault();
		tohCompareClear();
	});
	$('#toh-compare-open').on('click',function(e){
		e.preventDefault();
		tohOpenCompare();
	});
	$('#toh-compare-close').on('click',function(e){
		e.preventDefault();
		tohCloseCompare();
	});

	// only rows that differ - the point when comparing two near-identical revisions
	$('#toh-compare-diffonly').on('change',function(){
		tohBuildCompare();
	});


	// Manufacturer / chipset pages ###########################################################################################

	// anything marked js-toh-facet opens one, wherever it lives
	$(document).on('click','.js-toh-facet',function(e){
		e.preventDefault();
		e.stopPropagation();
		tohOpenFacet($(this).attr('data-type'), $(this).attr('data-value'));
	});


	$('#toh-facet-close').on('click',function(e){
		e.preventDefault();
		tohCloseFacet();
	});

	$('#toh-facet-body').on('click','.toh-facet-showall',function(e){
		e.preventDefault();
		$('#toh-facet-panel').addClass('show-all-devices');
		$(this).remove();
	});
	// judge every device against the first one
	$('#toh-compare-ref').on('change',function(){
		tohBuildCompare();
	});


	//  Click: Toggle light / dark ----------------------------------
	// The initial value is applied by the inline script in index.html; here we
	// only flip it and remember the choice.
	$('#toh-theme-toggle').on('click',function(e){
		e.preventDefault();
		const dark=document.documentElement.getAttribute('data-theme') === 'dark';
		const next=dark ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		try { localStorage.setItem('toh_theme', next); } catch(err) {}
		// Tabulator caches row heights against the old metrics
		if(typeof tabuTable !== 'undefined' && toh_table_inited){
			tabuTable.redraw();
		}
	});

	// Fetch content and build table ----------------------------------
	$('#toh-load-text').html('Fetching TOH devices...');
	FetchReleases().then(() => {
		$.getJSON( toh_urls.toh_json, function( data ){ 
			//Makes columns
			var columns = data.columns.map((value, index) => ({
				field: value,
				title: data.captions[index],
				visible: false,
				...toh_colStyles[value]
			}));

			// add vitual (not linked to existing fields) columns
			var virtualColumns = getVirtualColumns();
			columns=[...columns, ...virtualColumns];

			// page header figures
			UpdatePageStats(data);

			// read before SetDefaults() rewrites the address bar
			tohCompareReadUrl();
			toh_facet_pending=tohFacetReadUrl();

			//init table with data
			showLoading();
			tabuTable.setColumns(columns);
			tabuTable.setData(data.entries).then(() =>{
				// order columns			
				columns.sort((a, b) => {
					const indexA = columnOrder.indexOf(a.field);
					const indexB = columnOrder.indexOf(b.field);
					if (indexA === -1 && indexB === -1) return 0; // Both names not in order, keep original order
					if (indexA === -1) return 1; // a's name not in order, move to end
					if (indexB === -1) return -1; // b's name not in order, move to end
					return indexA - indexB;
				});
				tabuTable.setColumns(columns);
		
				// display Filters & views 
				buildFiltersPresets();
				buildFiltersFeatures();
				buildViewsColumns();
				buildViewsPresets();
					
				//set default views
				SetDefaults();

				loadCookiesAndBuildUserPresets();

				// sort columns						
				tabuTable.setSort([
					{column:"model", dir:"asc"}, //then sort by this second
					{column:"brand", dir:"asc"} //sort by this first
				]);

			}).then(() =>{
				if(toh_prefs.boot_hide){
					$('#toh-boot-overlay').slideUp(500);
				}

				// the header is only measurable once the columns have rendered,
				// and the rows only once they have been laid out
				tohSetTableHeight(tabulatorOptions.paginationSize);
				requestAnimationFrame(() => tohSetTableHeight(tabulatorOptions.paginationSize));

				tohCompareApply();
				if(toh_facet_pending){
					tohOpenFacet(toh_facet_pending.type, toh_facet_pending.value);
					toh_facet_pending=null;
				}
				ObserveHeaderFiltersAndInitSearch();
				PreLoadImagesCache();
			});
		});
	});






	// Dev badge ##############################################################################################################

	$('#toh-dev-badge').on('click',function (e) {
		$('body').removeClass('branch-dev');
		$('#toh-changelog').hide();
	});






	// Toolbar Search #########################################################################################################

	// Function to toggle clear button visibility
	function toggleSearchClearButton(field) {
		const input=$('#toh-search-input-'+field);
		const clear=$('#toh-search-clear-'+field);
		if (input.val().length > 0) {
			clear.show();
		} else {
			clear.hide();
		}
	}

	// Clear input when clear button is clicked
	$('.toh-search-clear').on('click', function() {
		const field=$(this).parent().find('.toh-search-input').attr('data-field');
		$('#toh-search-input-'+field).val('').trigger('keyup');
		$(this).hide();
	});
	
	
	// input search on keyup
	$('.toh-search-input').on('keyup', function() {
		const field=$(this).attr('data-field');
		toggleSearchClearButton(field);

		// Clear any existing timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}
		
		// Set new timeout
		this.timeoutId = setTimeout(() => {
			tabuTable.setHeaderFilterValue(field,$(this).val());
			tabuTable.refreshFilter();
		}, 300);

	});

	function ObserveHeaderFiltersAndInitSearch(){
		$('.toh-search-input').trigger('keyup'); // needed when manually relaoding a page that already have a search query

		// mirror the model/brand header filters back into the toolbar search
		$('.tabulator-col .tabulator-header-filter INPUT').bind('keyup', function() {
			const field=$(this).closest('.tabulator-col').attr('tabulator-field');
			const target=$('.toh-search-input[data-field='+field+']')
			target.val($(this).val());
			toggleSearchClearButton(field);
		});
	}






	// User Presets ###########################################################################################################

	$('.toh-upresets-content').on('click','.toh-upreset-but',function(e){
		e.preventDefault();
		e.stopPropagation();
		var $preset=$(this);
		var num=$preset.attr('data-key');
		var type=$preset.attr('data-type');
		myLogFunc("Click user preset:"+type+' / '+num);
		if(e.shiftKey){
			myLogStr('save');
			var name="user"+num;

			$preset.addClass('toh-saving');

			// show popup
			var $popupDiv	=$('#toh-upreset-popup-save');
			var $input			=$popupDiv.find('INPUT');
			var $but_save		=$popupDiv.find('BUTTON');
			$input.val('');
			$popupDiv.show();
			
			// Position the popup div
			var cellOffset = $(this).offset();
			$popupDiv.css({
				top: cellOffset.top +20,
				left: cellOffset.left -90
			});
			$input.focus(); // nedd to be AFTER popup.show
			
			//set max
			var max=toh_prefs.cook_max_chars;
			$('#toh-upreset-popup-max').html(max);
			$input.attr('size',max);
		
			//clean events and exit
			function exit(){
				$input.off();
				$but_save.off();
				$popupDiv.off();
				$preset.removeClass('toh-saving');
				$popupDiv.hide();
			}

			//keyboard
			$input.on('keyup',function(e){
				var val=$input.val();
				if(e.keyCode==13){		//return
					$but_save.trigger('click');
				}
				if(e.keyCode==27){		//esc
					exit();
				}
				if(val.length > max){
					$input.val(val.substring(0, max)).shake(50,2,1);
				}
				myLogObj(e,'keyup event');
			});

			//save on click, if name not empty
			$but_save.on('click', function(e) {
				e.preventDefault();
				//e.stopPropagation();
				name=$input.val();
				if(name==''){
					$input.shake(50,4,2);
				}
				else{
					$preset.fadeOut(50).fadeIn(250);	// .shake(50,5,2);
					storePresetCookie(type,num,name);
					exit();
					$preset.html(name).removeClass('toh-used').addClass('toh-used');
					setPresetSelectedClass(type,num)
					myLogStr('saved');
				}
			});	

			// Prevent the click event from propagating to the document
			$popupDiv.on('click', function(e) {
				e.stopPropagation();
			});

		}
		else if(e.altKey){
			myLogStr('delete');
			deletePresetCookie(type,num);
			$preset.html(num).removeClass('toh-used').fadeOut(150).fadeIn(50);
			if(type=='features'&& $preset.hasClass('toh-selected')){
				setPresetSelectedClass(type,'');
			}
			if(type=='columns'&& $preset.hasClass('toh-selected')){
				setPresetSelectedClass(type,'custom');
			}
		}
		else{
			myLogStr('load');
			applyUserPreset(type,num);
			if(type=='features' && $preset.hasClass('toh-used')){
				setPresetSelectedClass(type,num);
			}
			if(type=='columns' && $preset.hasClass('toh-used')){
				setPresetSelectedClass(type,num);
			}
		}
	
	});
	// exit save preset when clicking elsewhere
	$(document).on('click', function(e){
		myLogFunc('on Click document');
		if(!$('#toh-upreset-popup-save').is(':visible')) return;
		myLogStr('Click document USED');
		$('#toh-upreset-popup-save').hide();
		$('.toh-upreset-but').removeClass('toh-saving');

	});






	// Top Filters ############################################################################################################

	//  Click: Filter Preset ------------------------------------------
	$('#toh-top-filters').on('click','.toh-filter-preset .toh-filter-button',function(e){
		myLogFunc("on Click filter preset");
		e.preventDefault();
		var key=$(this).attr('data-key');
		//setPresetSelectedClass('features',key);
		applyFilterPreset(key);
	});

	// Click: Feature CheckBox -------------------------------------------
	$('#toh-top-filters').on('click','.toh-filter-feature INPUT',function(e){
		myLogFunc("on Click checkbox feature");
		var key=$(this).attr('data-key');
		//setPresetSelectedClass('features');
		checkFeatureAndClearPreset(key, $(this).is(":checked") );
		applyCheckedFeatures();
		updateFilterGroupState();
	});

	// Click: Feature link ----------------------
	$('#toh-top-filters').on('click','.toh-filter-title A',function(e){
		e.preventDefault();
		var cb=$(this).parent().find('INPUT').trigger('click');
	});

	// Click: Show / hide the less used filter groups ----------------
	$('#toh-top-filters').on('click','.toh-filters-more',function(e){
		e.preventDefault();
		$('#toh-filters-features-content').toggleClass('show-all');
	});

	// Click: Replace Option immediately populates columns ----------------------
	$('#toh-filters-options INPUT[value=repl]').on('click',function(e){
		myLogFunc('on Click replace option');
		applyColumnsFromFilters();
	});






	// Top Views (columns) ####################################################################################################

	// Click: View Preset ---------------------------------------------------
	$('#toh-cols-presets').on('click','A',function(e){
		e.preventDefault();
		let view=$(this).attr('data-key');
		myLogFunc('on Click Col Preset');
		myLogStr('Apply view: '+view);
		if(view=='custom'){
			$(".toh-cols-but-toggle").trigger('click');
		}
		else{
			applyColumnPreset(view);
		}
	});

	// Click (or viewchanged): one view CheckBox ----------------------
	$('#toh-cols-columns-content').on('click viewchanged','INPUT',function(e){
		var key=$(this).attr('data-key');
		myLogFunc('on Click Checkbox Col: '+key);
		//setPresetSelectedClass('columns','custom');
		applyColumCol(key, $(this).is(":checked") );
	});

	// Click: one view link ----------------------
	$('.toh-cols-list').on('click','A',function(e){
		myLogFunc('on Click Checkbox Link');
		e.preventDefault();
		var cb=$(this).parent().find('INPUT').trigger('click');
	});

	//  Click: View Group ---------------------------------------------------
	$('#toh-cols-columns-content').on('click','.toh-viewgroup-title A',function(e){
		myLogFunc('on Click Column Preset');
		e.preventDefault();
		//e.stopPropagation();
		showLoading();
		var checked	=$(this).parents('.toh-viewgroup').find('.toh-col-column INPUT:checked').length;
		var inputs	=$(this).parents('.toh-viewgroup').find('.toh-col-column INPUT');
		if(checked==0){
			inputs.prop('checked', true).trigger('viewchanged');
		}
		else{
			inputs.prop('checked', false).trigger('viewchanged');
		}
		updateColGroupIcons();
	});





	// Top Buttons ############################################################################################################

	// Toolbar buttons are shown/hidden with a class, not with .show()/.hide():
	// jQuery would set display:block and break the inline-flex that keeps them
	// aligned with the Columns and Export buttons next to them.
	function toggleBut($but, visible){
		$but.toggleClass('toh-but-shown', !!visible);
	}

	// -------------------------------------------
	function toggleFilterClearButVisibility(){
		myLogFunc();
		var $but_clear_filt	=$('.toh-but-clearfilters');
		var $but_clear_head	=$('.toh-but-clearheaderfilters');
		var $but_clear_all	=$('.toh-but-clearallfilters');

		var $div_filters_title	=$('#toh-filters-title');

		// filters
		var cur_filters		=tabuTable.getFilters();
		toggleBut($but_clear_filt, cur_filters.length>0);
		$div_filters_title.toggleClass('active', cur_filters.length>0);

		// header filters
		var cur_headfilters	=tabuTable.getHeaderFilters();
		toggleBut($but_clear_head, cur_headfilters.length>0);

		// ALL filters
		toggleBut($but_clear_all, cur_filters.length>0 && cur_headfilters.length>0);
	}

	// -------------------------------------------
	function toggleSortClearButVisibility(){
		myLogFunc();
		myLogObj(tabuTable.getSorters(), 'tabu Sorters');
		toggleBut($('.toh-but-clearheadersorts'), tabuTable.getSorters().length>0);
	}

	// Click: clear header sorts ----------------
	$(".toh-but-clearheadersorts").on('click', function (e) {
		myLogFunc('on Click But ClearSort');
		e.preventDefault();
		tabuTable.clearSort();
	});

	// Click: clear filters ----------------
	$(".toh-but-clearfilters").on('click', function (e) {
		myLogFunc('on Click But ClearFilters');
		e.preventDefault();
		tabuTable.clearFilter();
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		buildBrowserUrl();	
	});

	// Click: clear header filters ----------------
	$(".toh-but-clearheaderfilters").on('click', function (e) {
		myLogFunc('on Click But ClearHeaderFilters');
		e.preventDefault();
		tabuTable.clearHeaderFilter();
		$('.toh-search-input').val('');
		$('.toh-search-clear').hide();
	});

	// Click: clear all filters ----------------
	$(".toh-but-clearallfilters").on('click', function (e) {
		myLogFunc('on Click But ClearAllFilters');
		e.preventDefault();
		tabuTable.clearHeaderFilter();
		tabuTable.clearFilter();
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		buildBrowserUrl();	
	});



	// Click: Download ----------------
	$(".toh-but-download").on('click', function (e) {
		myLogFunc('on Click But Download');
		e.preventDefault();
		let type=$(this).data('dltype');
		let range=$('SELECT[name=dlrange] OPTION:selected').val();
		myLogStr(type+' / '+range);
		DownloadTable(type, range);
	});

	function DownloadTable(type, mode) {
		type = type ? type : 'csv';
		mode = mode ? mode : 'all';
		const dl_types = {
			csv: {
				ext: 'csv',
			},
			xlsx: {
				ext: 'xlsx',
			},
			json: {
				ext: 'json',
			},
		};
		const dl_modes = {
			all: {
				range: 'all',
				suffix: '_all',
			},
			active: {
				range: 'active',
				suffix: '_filtered',
			}
		};

		if (!dl_types[type] || !dl_modes[mode] ) {
			return false;
		}

		const file_name = 'OpenWrt_ToH' + dl_modes[mode].suffix + '.' + dl_types[type].ext;
		tabuTable.download(type, file_name, {}, dl_modes[mode].range);
	}

	// Header Filters #########################################################################################################

	// Set Colum Headers Color-------------------------------------------------
	function setColumHeaderColors(){
		myLogFunc();
		var allfilters	=getTableFiltersFields('all');
		var filters		=getTableFiltersFields('filters');
		var headfilters	=getTableFiltersFields('headerfilters');
		var myclass='';
		$(".tabulator-col").removeClass('toh-col-allfilter toh-col-filter toh-col-headerfilter');
		$.each(allfilters,function(i,f){
			if(filters.includes(f) && headfilters.includes(f)){
				myclass='toh-col-allfilter';
			}
			else if(filters.includes(f)){
				myclass='toh-col-filter';
			}
			else if(headfilters.includes(f)){
				myclass='toh-col-headerfilter';
			}

			if(myclass !=''){
				//myLogStr('apply header class: '+myclass+' to '+f);
				$(".tabulator-col[tabulator-field='"+f+"']").addClass(myclass);
			}			

		});
	}
	
	// Expand header-filter INPUT on focus -----------------------------------
	$('#toh-table').on('focus','.tabulator-header-filter INPUT', function() {
		var w=$(this).outerWidth();
		if (w < 50) {
			var pw=$(this)[0].style.width;
			$(this).attr('data-orig-pwidth',pw);
			$(this).css('position','absolute');
			$(this).parents('.tabulator-col').css('overflow','visible');
			$(this).animate({
				width: '100px',
			}, 100);
		}
	});

	// Restore header-filter INPUT on blur ---------------------------------
	$('#toh-table').on('blur','.tabulator-header-filter INPUT', function() {
		var pw=$(this).attr('data-orig-pwidth');
		if (pw !='' || pw > 0) {
			$(this).css('position','static');
			$(this).parents('.tabulator-col').css('overflow','hidden');
			$(this).animate({width: pw}, 100);
		}
		setColumHeaderColors();
	});





	// tabuTable events #######################################################################################################

	// Resfresh column color on header-filter INPUT' blur ---------------------------------
	tabuTable.on("dataFiltered", function(filters, rows){
		//myLogFunc('on dataFiltered Event');
		//myLogObj(getTableFiltersFields('filters'),'Filters');
		//myLogObj(tabuTable.getFilters(), 'Tabu Filters');
		applyColumnsFromFilters();
		setColumHeaderColors();
		toggleFilterClearButVisibility();
		if(toh_table_inited){
			buildBrowserUrl();
		}

	});


	// Update the counter when 'dataFiltered' event is REALLY finished --------------------
	tabuTable.on("renderComplete", function(){
		myLogStr('EVENT: table-change-complete', 4);
		UpdateCountRows();
		UpdateCountCols();
	});

	// Resfresh column color on header-filter INPUT' blur ---------------------------------
	tabuTable.on("columnVisibilityChanged", function(column, visible){
		myLogStr('EVENT: columnVisibilityChanged', 4);
		if(toh_table_inited){
			buildBrowserUrl();
		}
	});

	// Resfresh column color on header-filter INPUT' blur ---------------------------------
	tabuTable.on("dataSorted", function(sorters, rows){
		myLogStr('EVENT: dataSorted', 4);
		toggleSortClearButVisibility();
	});
	
	// Overrides Tabulator pageSizeChange ----------------------------------------------------
	var last_table_height=tabulatorOptions.rowHeight * tabulatorOptions.paginationSize;

	document.addEventListener("change", function (e) {
		if (e.target.matches(".tabulator-page-size")) {
			e.preventDefault();
			e.stopPropagation();

			myLogStr('EVENT: pageSizeChange');
			tableLoadingShow();
			const size = e.target.value; // Get the selected value from the <select> element
			last_table_height = tabulatorOptions.rowHeight * size;
			myLogStr('Wanted Table Height: '+ last_table_height,4);

			if (toh_table_inited) { // we dont need it when page loads
				showLoading();

				setTimeout(() => {
					tohSetTableHeight(size);
					//myLogStr('Tabulator Set pagesize ' + size);
					tabuTable.setPageSize(size == "true" ? true : size);
					tabuTable.setPage(1);
				}, 50);
			}
		}
	}, { capture: true });

	// tabulator bugfix -----
	tabuTable.on("pageLoaded", function(pageno){
		myLogStr('EVENT: pageLoaded: '+pageno);
		//this is needed to prevent border (rows height) being smaller (because the row height are NOT corrects)
		//ie : change page size to 100, click page2, click page1 (bug)
		const cur_table_height=$('.tabulator-table').height();
		//myLogStr('Cur Table Height: '+cur_table_height);

		if(toh_table_inited && cur_table_height < last_table_height -1 ){
			myLogStr('Tabulator REDRAW HACK - Changing Height from: '+cur_table_height+' to: '+last_table_height,1);
			tabuTable.redraw();
		}
	});


	// handles Loading icon when changing pages, pageSize -------------------------------------------------------------------
	var toh_loading_class="toh-table-loading";
	// insert spinner icon div
	tabuTable.on("tableBuilt", function(){
		myLogStr('EVENT: tableBuilt');
		$('.tabulator-paginator LABEL').before('<span class="'+toh_loading_class+'">'+tohIcon('loader-circle toh-ico-spin')+' </span>');
	});	

	// Intercept click in capture phase
	document.addEventListener("click", function(e) {
		if ($(e.target).hasClass("tabulator-page")) {
			e.preventDefault();
			e.stopPropagation();
			var pageNumber = $(e.target).attr("data-page");
			myLogStr('EVENT: Page button clicked: ' + pageNumber);

			tableLoadingShow();
			//showLoading();

			// Defer setPage to allow repaint
			setTimeout(() => {
				myLogStr('Set page: ' + pageNumber);
				tabuTable.setPage(pageNumber);
			}, 50);
		}
	}, { capture: true });

	function tableLoadingShow(){
		const el = $('.'+toh_loading_class);
		if (el.length === 0) {
			return;
		}
		el.css({
			'display': 'inline-block',
			'visibility': 'visible'
		});
		el[0].offsetHeight; // Force immediate repaint
		//myLogStr('->tableLoadingShow');
	}

	function tableLoadingHide(){
		const el = $('.'+toh_loading_class);
		if (el.length === 0) {
			return;
		}
		el.css('display', 'none');
	}


});







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



// Tabulator: Cell Popup Formatters ###########################################################################################
function CellPopupModel(e, cell, onRendered) {
	// Build initial popup HTML structure with brand and model title
	var data = cell.getData();
	var contents = "<div class='toh-details-border'>" +
		"<div class='toh-details-head'>" +
			"<b class='toth-details-title'>" +
				"<a href='#' class='js-toh-facet' data-type='brand' data-value='" + tohAttr(data.brand) + "' title='All " + tohAttr(data.brand) + " devices'>" + data.brand + "</a>" +
				" - " + data.model +
				(data.cpu && data.cpu !== '-' ? " <a href='#' class='toh-details-chipset js-toh-facet' data-type='chipset' data-value='" + tohAttr(data.cpu) + "' title='All devices with this chipset'>" + tohIcon('cpu') + data.cpu + "</a>" : "") +
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
			// again in abbreviated form ("HwData"). Give them the full row.
			if (mycol.formatterParams && mycol.formatterParams.label) {
				// the flex layout goes on an inner div: making the TD itself a
				// flex container takes it out of the table and voids the colspan
				contents += "<tr><td class='toh-details-link' colspan='2'><div class='toh-details-linkrow'>" + formattedValue + "</div></td></tr>";
				return true;
			}

			// the popup has room for the real name, unlike the column header
			var label = col.headerTooltip || col.title;
			contents += '<tr><td class="toh-details-key"><a href="#" title="'+ col.headerTooltip +'">' + label + "</a></td><td class='toh-details-value'>" + formattedValue + "</td></tr>";
		});
		if (done) contents += "</table>\n</div>";
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
		params.ttip='Github Commit';
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


