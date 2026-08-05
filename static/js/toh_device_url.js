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
// toh_device_url.js
//
//	Gives the open device a URL: ?device=<deviceid>.
//
//	This does not turn the popup into a page - it makes the popup addressable,
//	which is the part people actually wanted: a link you can send, a Back button
//	that closes it, and a reload that puts you back where you were.

let toh_device_open=null;			// deviceid whose popup is showing
let toh_device_pending=null;		// read from the URL before the table exists
let toh_device_restoring=false;		// suppresses the history push while we replay a URL


// Find a device's row, wherever it is -----------------------------------------
// It may be filtered out or on another page, so this clears what is in the way
// rather than silently doing nothing.
function tohFindDeviceRow(id){
	// "active" matters: getRows() with no argument hands back rows the filter
	// has hidden too, and clicking a row that was never rendered does nothing
	const shown=tabuTable.getRows('active').filter(r => r.getData().deviceid === id);
	if(shown.length){
		return shown[0];
	}
	if(!tabuTable.getData().some(d => d.deviceid === id)){
		return null;				// not in the data at all
	}
	return 'filtered';
}

// Open a device by id --------------------------------------------------------
function tohOpenDevice(id, push=true){
	if(!id || !tabuTable){
		return false;
	}
	let row=tohFindDeviceRow(id);

	if(row === 'filtered'){
		// the link should win over whatever filter happens to be set
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		toh_extra_filters=[];
		tabuTable.clearFilter();
		tabuTable.clearHeaderFilter();
		updateFilterGroupState();
		row=tohFindDeviceRow(id);
	}
	if(!row || row === 'filtered'){
		myLogStr('Device not found: ' + id, 1);
		return false;
	}

	toh_device_restoring=!push;
	if(tohCardsActive()){
		// the table is not rendered down here, so there is no cell to click and
		// no popup to position against one: the sheet shows the same content
		tohSheetOpen(id);
	}
	else{
		tabuTable.scrollToRow(row, 'center', false).catch(() => {});
		// Tabulator owns the popup and its placement, so ask for it the way a
		// visitor would rather than rebuilding it here
		const cell=row.getCell('model');
		if(cell){
			cell.getElement().click();
		}
	}
	toh_device_restoring=false;
	return true;
}

// Called when a popup opens or closes ----------------------------------------
function tohDeviceUrlSet(id){
	toh_device_open=id || null;
	if(toh_device_restoring){
		return;
	}
	const url=new URL(window.location.href);
	if(id){
		url.searchParams.set('device', id);
		history.pushState({device:id}, '', url);
	}
	else if(url.searchParams.has('device')){
		url.searchParams.delete('device');
		history.pushState({device:null}, '', url);
	}
}

function tohDeviceReadUrl(){
	const id=getUrlParameter('device');
	if(id){
		toh_device_pending=id;
		myLogStr('Device from URL: ' + id, 2);
	}
}

function tohDeviceApply(){
	if(!toh_device_pending){
		return;
	}
	const id=toh_device_pending;
	toh_device_pending=null;
	tohOpenDevice(id, false);
}

// Back and forward -----------------------------------------------------------
function tohDevicePopState(){
	const id=getUrlParameter('device');
	if(id === toh_device_open){
		return;
	}
	if(id){
		tohOpenDevice(id, false);
	}
	else if(toh_device_open){
		$('.toh-details-close').trigger('click');
	}
}
