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
//	Gives the open device a URL, ?device=<deviceid>, so that it can be linked
//	to, Back closes it and a reload reopens it.

let toh_device_open=null;			// deviceid whose popup is showing
let toh_device_pending=null;		// read from the URL before the table exists
let toh_device_restoring=false;		// suppresses the history push while we replay a URL


// Find a device's row, wherever it is -----------------------------------------
// Returns the row, 'filtered' when the device exists but the filters hide it,
// or null when it is not in the data.
function tohFindDeviceRow(id){
	// "active" matters: getRows() with no argument hands back rows the filter
	// has hidden too, and clicking a row that was never rendered does nothing
	const shown=tabuTable.getRows('active').filter(r => r.getData().deviceid === id);
	if(shown.length){
		return shown[0];
	}
	if(!tohRowById(id)){
		return null;				// not in the data at all
	}
	return 'filtered';
}

// Open a device by id --------------------------------------------------------
function tohOpenDevice(id, push=true){
	if(!id || !tabuTable){
		return false;
	}
	// The phone sheet renders from the row data, so it needs no row on screen and
	// no filter is cleared. Only the desktop popup needs a rendered cell.
	if(tohCardsActive()){
		const data=tohRowById(id);
		if(!data){
			myLogStr('Device not found: ' + id, 1);
			return false;
		}
		toh_device_restoring=!push;
		tohSheetOpen(id);
		toh_device_restoring=false;
		return true;
	}

	let row=tohFindDeviceRow(id);

	if(row === 'filtered'){
		// The link wins over the filters, or a shared URL would open nothing. Every
		// filter dropped is counted, header filters included, and the count is
		// announced in #toh-fav-status, a visually hidden screen-reader status region.
		let dropped=getCheckedFeatures().length + tohThresholdFilters().length;
		$('#toh-table .tabulator-header-filter INPUT').each(function(){
			if(String($(this).val() || '').trim() !== ''){
				dropped++;
			}
		});
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		tohResetThresholds();
		tabuTable.clearFilter();
		tabuTable.clearHeaderFilter();
		updateFilterGroupState();
		row=tohFindDeviceRow(id);
		if(row && row !== 'filtered' && dropped > 0){
			tohAnnounceFiltersCleared(dropped);
		}
	}
	if(!row || row === 'filtered'){
		myLogStr('Device not found: ' + id, 1);
		return false;
	}

	toh_device_restoring=!push;
	// The row may be on another page. Move to its page, let the scroll settle,
	// and only then look the cell up: both steps re-render rows, so an element
	// taken beforehand has been recycled by the virtual DOM.
	Promise.resolve(tabuTable.setPageToRow(row))
		.catch(() => {})
		.then(() => tabuTable.scrollToRow(row, 'center', false).catch(() => {}))
		// Changing the page schedules a render, so the cell can still be detached
		// when the promises settle. Wait until the element is connected.
		.then(() => new Promise(done => {
			let frames=0;
			(function wait(){
				const cell=row.getCell('model');
				const el=cell ? cell.getElement() : null;
				if(el && el.isConnected){
					done(el);
				}
				else if(++frames > 60){
					done(null);				// about a second; give up quietly
				}
				else{
					requestAnimationFrame(wait);
				}
			})();
		}))
		.then(el => {
			// Tabulator owns the popup and positions it against the pointer. A
			// bare el.click() carries no coordinates, so aim the event at the cell.
			if(el){
				const box=el.getBoundingClientRect();
				el.dispatchEvent(new MouseEvent('click', {
					bubbles: true,
					cancelable: true,
					view: window,
					clientX: box.left + box.width / 2,
					clientY: box.top + box.height / 2,
				}));
			}
			else{
				myLogStr('Could not reach the row for: ' + id, 1);
			}
			toh_device_restoring=false;
		});
	return true;
}

// Say that a filter set was thrown away to reach this device ----------------
function tohAnnounceFiltersCleared(n){
	const msg=n + (n === 1 ? ' filter was' : ' filters were')
		+ ' cleared so this device could be shown.';
	$('#toh-fav-status').text(msg);
	myLogStr(msg, 2);
	clearTimeout(tohAnnounceFiltersCleared._t);
	tohAnnounceFiltersCleared._t=setTimeout(function(){
		$('#toh-fav-status').text('');
	}, 8000);
}

// Called when a popup opens or closes ----------------------------------------
// The URL comes from buildBrowserUrl(), which composes the whole query from
// state, `device` included.
function tohDeviceUrlSet(id){
	const was=toh_device_open;
	toh_device_open=id || null;
	if(toh_device_restoring || was === toh_device_open){
		return;
	}
	history.pushState({device: toh_device_open}, '', buildBrowserUrl(false));
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
		tohCloseDevice();
	}
}

// Close whichever of the two renderers is showing the device ------------------
// In the phone sheet the close button of the details markup is hidden and
// has no handler, so the sheet is closed directly.
function tohCloseDevice(){
	if(tohCardsActive() && !$('#toh-sheet').hasClass('toh-hidden')){
		toh_device_restoring=true;		// tohSheetClose() would push a second entry
		tohSheetClose();
		toh_device_restoring=false;
		toh_device_open=null;
	}
	else{
		$('.toh-details-close').trigger('click');
	}
}
