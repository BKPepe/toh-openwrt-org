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
	toh_favorites=Array.isArray(stored) ? stored : [];
}

function tohFavSave(){
	saveCookie(toh_fav_cookie, toh_favorites);
}

function tohFavHas(id){
	return toh_favorites.indexOf(id) > -1;
}

function tohFavToggle(id){
	if(!id){
		return;
	}
	const at=toh_favorites.indexOf(id);
	if(at > -1){
		toh_favorites.splice(at,1);
	}
	else{
		toh_favorites.push(id);
	}
	tohFavSave();
	tohFavSync();
}

function tohFavClear(){
	toh_favorites=[];
	toh_favorites_pinned=false;
	tohFavSave();
	tohFavSync();
	applyCheckedFeatures();
}


// The heart in the table #####################################################################################################

function FormatterFavorite(cell, formatterParams, onRendered) {
	const id=cell.getRow().getData().deviceid;
	if(!id){
		return '';
	}
	const on=tohFavHas(id);
	return '<a href="#" class="toh-fav-toggle' + (on ? ' is-on' : '') + '" data-id="' + id + '"'
		+ ' title="' + (on ? 'Remove from favourites' : 'Add to favourites') + '">'
		+ tohIcon('heart') + '</a>';
}


// Pinning ####################################################################################################################

// Favourites ride along with whatever is filtered, so a device you are tracking
// does not vanish the moment you tick a filter it fails. Tabulator ANDs the
// top level of a filter list and ORs a nested array, so distributing the
// favourite test across every term turns "A AND B" into "fav OR (A AND B)".
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
		$(this).toggleClass('is-on', tohFavHas($(this).attr('data-id')));
	});
	tohCardsSyncToggles();			// and the same hearts on the phone cards

	if(toh_favorites.length === 0){
		toh_favorites_pinned=false;
	}
}

// Called once the table has data. The cookie itself is read earlier, before
// the rows render, or the formatter would draw every heart empty.
function tohFavInit(){
	tohFavSync();
	if(toh_favorites_pinned){
		tohFavGrouping();
	}
}
