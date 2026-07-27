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
// toh_util.js
//
//	Icons, URL parameters, cookies, logging and small shared helpers.

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
