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
	let tip		=col.headerTooltip;
	if(tip==true){tip='';}		// auto columns carry `true` instead of a string

	// The label is the full name and the abbreviated column header goes in the
	// tooltip. pickerLabel replaces a headerTooltip that is not a name.
	const label	=col.pickerLabel || tip || col.title;
	const alt	=tip && col.title && tip !== col.title ? col.title : field;

	html +='<div class="toh-col toh-col-column">';
	// aria-label, because the visible name is in the sibling anchor, which is
	// not a <label>
	html +='<input type="checkbox" aria-label="'+tohAttr(label)+'" data-key="'+tohAttr(field)+'"';
	if( checked ){html +=' checked="true"';}
	// label is escaped: for a column that toh_colStyles does not describe it is
	// the caption shipped in toh.json
	html +='> <a href="#" title="'+tohAttr(alt)+'">'+tohAttr(label)+"</a>\n";
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
		if(index >= toh_filters_visible_groups){
			extra=' toh-filtgroup-extra';
		}
	}
	html +='<div class="toh-group '+names[type]+extra+'" data-group="'+tohAttr(group)+'">'+"\n"+'<div class="toh-group-title '+names[type]+'-title"><a href="#" class="view-link" title="'+tohAttr(ttip[type])+'">'+tohIcon(icon)+' '+tohAttr(title)+'<span class="toh-filtgroup-count"></span></a></div>'+"\n";
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
			// These have no entry in toh_colStyles, so headerTooltip is Tabulator's
			// own `true` and the title stands in for the name.
			var known=(typeof def.headerTooltip === 'string' && def.headerTooltip !== '')
				? def.headerTooltip : def.title;
			def={...def, headerTooltip: known + ' (' + arr.field + ')'};
			view +=htmlColumnLine(arr.field, def , col.isVisible())
		});
		view +="</ul>\n</div>\n";
	}

	$("#toh-cols-columns-content").html(view);
	updateColGroupIcons();
}

// Check on/off a Column checkbox ------------------------------
function checkColumn(key,state=true){
	$('.toh-col-column INPUT[data-key="'+CSS.escape(key)+'"]').prop('checked',state);
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
	// Tick first: showColumn/hideColumn fire columnVisibilityChanged, which
	// rebuilds the URL from the checkboxes.
	checkColumn(col,state);
	if(state){
		tabuTable.showColumn(col);
	}
	else{
		tabuTable.hideColumn(col);
	}
	UpdateCountCols();
}

//  Show and Check Persistent Columns ------------------------------
// Only the Device column ('model') is persistent.
function showAndCheckPersistentColumns(){
	showAndCheckColumn('model');
}

// Show or Hide ALL columns --------------------------------------
// Redraw is blocked: each show/hide would otherwise re-lay out the whole table.
function showAllColumns(bool) {
	myLogFunc();
	tabuTable.blockRedraw();
	try {
		tabuTable.getColumns().forEach(function(col){
			const field=col.getField();
			if(!field || col.isVisible() === bool){
				return;
			}
			if(bool){ col.show(); } else { col.hide(); }
		});
	}
	finally {
		tabuTable.restoreRedraw();		// in finally: a table left blocked stays frozen
	}
	UpdateCountCols();
}

// Make exactly these fields the visible columns ------------------
// One blocked pass that changes only the columns whose visibility differs.
function applyColumnSet(fields){
	myLogFunc();
	const want=new Set(fields);
	tabuTable.blockRedraw();
	try {
		tabuTable.getColumns().forEach(function(col){
			const field=col.getField();
			if(!field){
				return;
			}
			const on=want.has(field);
			if(col.isVisible() !== on){
				if(on){ col.show(); } else { col.hide(); }
			}
		});
	}
	finally {
		tabuTable.restoreRedraw();
	}
	$('.toh-col-column INPUT').each(function(){
		$(this).prop('checked', want.has($(this).attr('data-key')));
	});
	updateColGroupIcons();
	UpdateCountCols();
	relayoutColumns();
}

// Apply a View Preset : show/hide columns -----------------------
function applyColumnPreset(key){
	myLogFunc();
	toh_current_view=key;
	showLoading();
	setTimeout(function(){
		let set;
		if(key=='all'){
			set=tabuTable.getColumns().map(c => c.getField()).filter(Boolean);
		}
		else if(key=='none'){
			set=[];
		}
		else{
			set=getColumnSet(key);
			if(set.length === 0){
				return;					// not a preset we know; leave the columns alone
			}
		}
		setPresetSelectedClass('columns',key);
		applyColumnSet(set);
	},0);
}

// Re-run the column layout ------------------------------------
// showColumn()/hideColumn() do not re-run it, so the leftover width would not
// be handed to the last column.
function relayoutColumns(){
	tabuTable.redraw(true);
}

// Apply a (single) Column : show/hide -----------------------
function applyColumCol(key,state){
	myLogFunc();
	toh_current_view=null;			// with one column toggled it is not a named view
	toh_view_chosen=true;			// ... and resizing must not take it back
	setPresetSelectedClass('columns','custom');
	showAndCheckColumn(key,state);
	relayoutColumns();
}

// get filters array (also merge features filters for Presets)--------------------------
function getColumnSet(key){
	myLogFunc();
	let set=[];
	if(key=='all'){
		// toh_colPresets maps a name to an array of fields
		$.each(toh_colPresets,function(k,fields){
			fields.forEach(function(field){
				if(!set.includes(field)){
					set.push(field);
				}
			});
		});
	}
	else if (key=='none'){
		set=[];
	}
	else if(typeof(toh_colPresets[key]) !='undefined'){
		set=toh_colPresets[key].slice();	// a copy: the preset is shared config
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
		if(opt=='add' || opt=='repl'){
			toh_current_view=null;	// columns chosen by the filters are not a named view
			toh_view_chosen=true;
		}
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
		if(opt=='add' || opt=='repl'){
			relayoutColumns();
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
		const on=$(this).find('INPUT').is(':checked');
		$(this).toggleClass('is-on', on);
		$(this).find('.toh-filter-title A').attr('aria-pressed', on ? 'true' : 'false');
	});

	var hidden_active=false;
	$('.toh-filtgroup').each(function(){
		const $group=$(this);
		const checked=$group.find('.toh-filter-feature INPUT:checked').length;
		$group.find('.toh-filtgroup-count').text(checked ? checked : '');
		if(checked > 0 && $group.hasClass('toh-filtgroup-extra')){
			hidden_active=true;
		}
	});
	if(reveal_active && hidden_active){
		$('#toh-filters-features-content').addClass('show-all');
	}
	tohUpdateSummary();
}

// Update group Icons in the columns block ------------------
function updateColGroupIcons(){
	myLogFunc();
	$('.toh-viewgroup').each(function(i){
		var total=$(this).find('.toh-col-column').length;
		var checked=$(this).find('.toh-col-column INPUT:checked').length;
		var icon;
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
	var sel;
	if(type=='features'){
		sel='.toh-filters-presets';
	}
	else if(type=='columns'){
		// by id: the user-preset slots next to it carry the same class
		sel='#toh-cols-presets';
	}
	else{
		myLogStr('setPresetSelectedClass - Unknown type:'+type,1);
		return false;
	}
	if(key !=''){
		$(sel+' A').removeClass(myclass);
		// CSS.escape() output is also valid inside a quoted string; it keeps a key
		// holding a space, a quote or "]" from breaking the selector
		$(sel+' A[data-key="'+CSS.escape(key)+'"]').addClass(myclass);
	}
	else{
		$(sel+' A').removeClass(myclass);
	}
}
