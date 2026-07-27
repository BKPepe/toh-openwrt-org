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
// toh_pages.js
//
//	Manufacturer and chipset pages - the data grouped by one field.

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
