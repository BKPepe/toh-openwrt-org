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
// toh_views.js
//
//	The column picker: which columns are shown, presets, and the
//	user-saved column sets.

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
	// the row carries its own on/off class, so the styling does not depend on
	// the native checkbox we hide
	$('.toh-filter-feature').each(function(){
		$(this).toggleClass('is-on', $(this).find('INPUT').is(':checked'));
	});

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
