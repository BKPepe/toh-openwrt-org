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
// toh_favorites.js
//
//	Marking devices to keep an eye on, and pinning them above the table.
//	Kept separate from compare: compare is a scratch selection you make and
//	throw away, favourites outlive the session.

let toh_favorites=[];				// deviceids, oldest first
let toh_favorites_pinned=false;		// "always show my favourites, whatever is filtered"

const toh_fav_cookie='favorites';


// Storage ####################################################################################################################

function tohFavLoad(){
	const stored=loadCookie(toh_fav_cookie);
	// two shapes are accepted: {ids, pinned}, or a bare array of ids
	if(Array.isArray(stored)){
		toh_favorites=stored;
		toh_favorites_pinned=false;
	}
	else if(stored && Array.isArray(stored.ids)){
		toh_favorites=stored.ids;
		toh_favorites_pinned=!!stored.pinned && stored.ids.length > 0;
	}
	else{
		toh_favorites=[];
		toh_favorites_pinned=false;
	}
}

// Write the list, and say whether the browser kept it.
// A cookie is capped around 4 KB and a longer write is dropped without an
// error, so the value is read back to check.
function tohFavSave(){
	saveCookie(toh_fav_cookie, {ids: toh_favorites, pinned: toh_favorites_pinned});
	const stored=loadCookie(toh_fav_cookie);
	return !!stored && Array.isArray(stored.ids) && stored.ids.length === toh_favorites.length;
}

function tohFavHas(id){
	return toh_favorites.indexOf(id) > -1;
}

function tohFavToggle(id){
	if(!id){
		return;
	}
	const was_pinned=toh_favorites_pinned && toh_favorites.length > 0;
	const at=toh_favorites.indexOf(id);
	const adding=at === -1;
	if(adding){
		toh_favorites.push(id);
	}
	else{
		toh_favorites.splice(at,1);
	}
	// the pin cannot outlive the last favourite
	toh_favorites_pinned=toh_favorites_pinned && toh_favorites.length > 0;

	if(!tohFavSave() && adding){
		// The storage refused it: put the list back the way it is stored.
		toh_favorites.pop();
		tohFavSave();
		tohFavSync();
		tohFavStorageFull();
		return;
	}
	tohFavSync();
	tohFavRefresh(was_pinned);
}

function tohFavClear(){
	const was_pinned=toh_favorites_pinned && toh_favorites.length > 0;
	toh_favorites=[];
	toh_favorites_pinned=false;
	tohFavSave();
	tohFavSync();
	tohFavRefresh(was_pinned);
}

// Tell the visitor the list is full ----------------------------------------
// The control shakes, and the reason goes to the pin's accessible name and to
// the live region.
function tohFavStorageFull(){
	// the limit is in bytes, so the message must not name a number of devices
	const msg='There is no room to store another favourite ('
		+ toh_favorites.length + ' saved). Remove one before adding another.';
	$('#toh-favorites').shake();
	$('#toh-fav-pin').attr('aria-label', msg);
	$('#toh-fav-status').text(msg);
	myLogStr(msg, 1);
	clearTimeout(tohFavStorageFull._t);
	tohFavStorageFull._t=setTimeout(function(){
		$('#toh-fav-status').text('');
	}, 6000);
}

// When favourites are pinned, a change in membership means the filter and the
// grouping have to be rebuilt. Only then: applyCheckedFeatures() re-derives
// every filter and reveals hidden filter groups.
function tohFavRefresh(was_pinned){
	if(was_pinned || toh_favorites_pinned){
		applyCheckedFeatures();
	}
}


// The heart in the table #####################################################################################################

function FormatterFavorite(cell, formatterParams, onRendered) {
	const id=cell.getRow().getData().deviceid;
	if(!id){
		return '';
	}
	const on=tohFavHas(id);
	const label=on ? 'Remove from favourites' : 'Add to favourites';
	return '<a href="#" class="toh-fav-toggle' + (on ? ' is-on' : '') + '" data-id="' + tohAttr(id) + '"'
		+ ' role="button" aria-pressed="' + (on ? 'true' : 'false') + '"'
		+ ' title="' + label + '" aria-label="' + label + '">'
		+ tohIcon('heart') + '</a>';
}


// Pinning ####################################################################################################################

// Pinned favourites pass every filter. Tabulator ANDs the top level of a
// filter list and ORs a nested array, so adding the favourite test to every
// term turns "A AND B" into "fav OR (A AND B)".
function tohFavWrapFilters(filters){
	if(!toh_favorites_pinned || toh_favorites.length === 0 || filters.length === 0){
		return filters;
	}
	const fav={field:'deviceid', type:'isfav', value:true};
	return filters.map(term => Array.isArray(term) ? [fav, ...term] : [fav, term]);
}

// Group favourites above everything else, when pinning is on
function tohFavGrouping(){
	if(toh_favorites_pinned && toh_favorites.length > 0){
		tabuTable.setGroupBy(data => tohFavHas(data.deviceid) ? 'Favourites' : 'All devices');
	}
	else{
		tabuTable.setGroupBy(false);
	}
}


// Wiring #####################################################################################################################

function tohFavSync(){
	const n=toh_favorites.length;

	$('#toh-fav-count').text(n);
	$('#toh-favorites').toggleClass('has-any', n > 0);
	$('#toh-fav-pin').toggleClass('is-on', toh_favorites_pinned)
		.attr('title', toh_favorites_pinned
			? 'Favourites are pinned above the table'
			: 'Always show my favourites, whatever is filtered');
	$('#toh-fav-clear').toggleClass('toh-hidden', n === 0);

	// repaint the hearts without rebuilding the table
	$('#toh-table .toh-fav-toggle').each(function(){
		const on=tohFavHas($(this).attr('data-id'));
		const label=on ? 'Remove from favourites' : 'Add to favourites';
		$(this).toggleClass('is-on', on)
			.attr('aria-pressed', on ? 'true' : 'false')
			.attr('title', label)
			.attr('aria-label', label);
	});
	tohCardsSyncToggles();			// and the same hearts on the phone cards
}

// Called once the table has data. The cookie itself is read earlier, before
// the rows render, or the formatter would draw every heart empty.
function tohFavInit(){
	tohFavSync();
	if(toh_favorites_pinned){
		tohFavGrouping();
	}
}
