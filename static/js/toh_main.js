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
// toh_main.js
//
//	Boot: wires the DOM up and starts the table.

// variables ##################################################################################################################


const toh_img_urls=[];	// holds all images urls

let toh_firmwares=[]; 				// holds all releases
let toh_firmwares_index=new Set();	// "id|target" of every profile, for O(1) lookups
let toh_firmwares_fetched=false;	// confirm if releases have been fetched
let toh_stable_version='';			// the release those profiles belong to, e.g. "25.12.5"

const toh_table_min_height=360;		// never shrink the table below this, however short the window
const toh_filters_visible_groups=3;	// filter groups shown before "Show more filters"


// ############################################################################################################################
// ## MAIN ####################################################################################################################
// ############################################################################################################################

var tabuTable;
var toh_table_inited=false;
var toh_cookies={};

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
	$('#toh-appbar-title').attr('href',window.location.pathname);

	// the title link also closes whichever panel is open
	$('#toh-appbar-title').on('click',function(e){
		if($('#toh-compare-panel, #toh-facet-panel, #toh-adv-panel, #toh-wiz-panel').filter(':visible').length === 0){
			return;					// already on the table: let the link reload
		}
		e.preventDefault();
		tohBackToTable();
		tohScrollTop();
	});

	// the saved row height has to be in tabulatorOptions before the table reads
	// it, or the first render sizes every row for the wrong density
	tohApplyDensity(loadCookie(toh_prefs.cook_name_density, 'string') || toh_prefs.def_density, false);

	// initialize table  -----------------------------------------------------
	tabuTable = new Tabulator("#toh-table", tabulatorOptions);

	// handles Image Preview on hover ----------------------------------------
	var $container = $('#toh-image-preview');
	var hoveredLink = null;	// the link the pointer is currently over, guards late load events

	$(document).on({
		mouseenter: function(e) {
			var $link = $(this);
			var link = this;
			hoveredLink = link;

			var $img = $('<img>', {alt: 'Image Preview'});
			$img.on('load', function() {
				// a slow image may resolve after the pointer moved on, or after a click
				// opened the lightbox: only show it if that is still the hovered link
				if(hoveredLink !== link){
					return;
				}
				$container.empty().append($img).show();
				positionPreview($link, $container);
			});
			$img.on('error', function() {
				if(hoveredLink !== link){
					return;
				}
				// Showing nothing looks like the preview itself is broken, so say
				// what happened. The box is placed either way, which is what went
				// wrong originally: it was shown but never positioned.
				$container.empty()
					.append('<div class="toh-preview-error">Image could not be loaded.<br>Click to open it.</div>')
					.show();
				positionPreview($link, $container);
			});
			$img.attr('src', $link.attr('href'));
		},
		mouseleave: function() {
			hoveredLink = null;
			$container.hide().empty();
		}
	}, 'a.cell-image');

	// handles Image Lightbox on click ---------------------------------------
	$(document).on('click', 'a.cell-image', function(e) {
		// leave modified clicks alone, so opening in a new tab/window still works
		if(e.which > 1 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey){
			return;
		}
		e.preventDefault();
		hoveredLink = null;
		$container.hide().empty();
		OpenImageLightbox(imagesOfLink($(this)), 0);
	});


	// Hide the loading icon once the table has finished drawing ---------------
	function tohLoadingDone(){
		clearTimeout(window.domChangeTimer);
		window.domChangeTimer = setTimeout(function() {
			$(document).trigger('table-change-complete');
		}, 100);
	}

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
		const open=$('#toh-filters-container').toggleClass('toh-hidden').hasClass('toh-hidden') === false;
		$(this).toggleClass('is-open', open).attr('aria-expanded', open ? 'true' : 'false');
	});

	//  Click: Toggle the Columns toolbar menu -----------------------
	$('.toh-cols-but-toggle').on('click',function(e){
		e.preventDefault();
		e.stopPropagation();
		closeToolbarMenus('#toh-cols-container');
		const open=$('#toh-cols-container').toggleClass('toh-hidden').hasClass('toh-hidden') === false;
		$(this).toggleClass('is-open', open).attr('aria-expanded', open ? 'true' : 'false');
	});

	//  Click: Toggle the Export toolbar menu ------------------------
	$('.toh-export-but-toggle').on('click',function(e){
		e.preventDefault();
		e.stopPropagation();
		closeToolbarMenus('#toh-bot');
		const open=$('#toh-bot').toggleClass('toh-hidden').hasClass('toh-hidden') === false;
		$(this).toggleClass('is-open', open).attr('aria-expanded', open ? 'true' : 'false');
	});

	// Only one toolbar menu open at a time; 'except' is the panel being toggled.
	function closeToolbarMenus(except=''){
		$('.toh-menu').each(function(){
			const $panel=$(this).find('.toh-menu-panel');
			if(except && $panel.is(except)){
				return;
			}
			$panel.addClass('toh-hidden');
			$(this).find('.toh-menu-but').removeClass('is-open').attr('aria-expanded','false');
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
		$(this).attr('aria-expanded', $('body').hasClass('toh-sidebar-open') ? 'true' : 'false');
	});
	$('#toh-sidebar-scrim').on('click',tohCloseSidebar);

	function tohCloseSidebar(){
		$('body').removeClass('toh-sidebar-open');
		$('#toh-sidebar-toggle').attr('aria-expanded','false');
	}

	//  Resize: keep the table inside the viewport -------------------
	var toh_resize_timer=null;
	$(window).on('resize',function(){
		if(!toh_table_inited){
			return;
		}
		clearTimeout(toh_resize_timer);
		toh_resize_timer=setTimeout(function(){
			const was_cards=toh_cards_on;
			tohApplyViewportView();		// may swap the preset, so before the height
			tohRenderCards();			// crossing toh_cards_max_width swaps the renderer; no-op elsewhere
			if(was_cards && !toh_cards_on){
				// Back from cards to the table (a phone unfolded or rotated).
				// Tabulator rendered while CSS had the container hidden, so it
				// holds no row elements until it is redrawn.
				tabuTable.redraw(true);
			}
			setTableHeight($('.tabulator-page-size').val() || tabulatorOptions.paginationSize);
			if(typeof tohFitTray === 'function'){
				tohFitTray();			// the tray's height changes when its chips wrap
			}
		},150);
	});

	// Favourites #############################################################################################################

	$('#toh-table').on('click','.toh-fav-toggle',function(e){
		e.preventDefault();
		e.stopPropagation();				// the cell click would open the details popup
		tohFavToggle($(this).attr('data-id'));	// owns the pinned refresh itself
	});
	// stopPropagation only - no preventDefault - so these can stay passive and
	// not hold up the start of a touch scroll over the whole table
	$('#toh-table').on('mousedown','.toh-fav-toggle',function(e){
		e.stopPropagation();
	});
	document.addEventListener('touchstart', function(e){
		if(e.target.closest && e.target.closest('.toh-fav-toggle, .toh-compare-check')){
			e.stopPropagation();
		}
	}, {passive: true});

	$('#toh-fav-pin').on('click',function(e){
		e.preventDefault();
		if(toh_favorites.length === 0){
			$('#toh-favorites').shake();
			return;
		}
		toh_favorites_pinned=!toh_favorites_pinned;
		tohFavSave();			// or "always show my favourites" reverts on reload
		tohFavSync();
		applyCheckedFeatures();
	});

	$('#toh-fav-clear').on('click',function(e){
		e.preventDefault();
		tohFavClear();
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
	$('#toh-table').on('mousedown','.toh-compare-check',function(e){
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
	// a device header in the comparison opens its full details
	$('#toh-compare-body').on('click','.js-compare-details',function(){
		tohSheetOpen($(this).attr('data-id'));
	});
	$('#toh-compare-open').on('click',function(e){
		e.preventDefault();
		tohOpenCompare();
	});
	$('#toh-compare-close').on('click',function(e){
		e.preventDefault();
		tohCloseCompare();
	});

	// show only the rows that differ
	$('#toh-compare-diffonly').on('change',function(){
		tohBuildCompare();
	});


	// Advanced search ########################################################################################################

	$('#toh-adv-open').on('click',function(e){
		e.preventDefault();
		// the same button closes it again
		if($('#toh-adv-panel').hasClass('toh-hidden')){
			tohOpenAdvSearch();
		}
		else{
			tohCloseAdvSearch();
		}
	});

	// Sticky summary row #####################################################################################################

	// Show it once the hero has scrolled out of view.
	(function(){
		const hero=document.getElementById('toh-hero');
		if(!hero || !window.IntersectionObserver){
			return;
		}
		new IntersectionObserver(function(entries){
			// the hero is the first thing on the page, so "not intersecting"
			// means it has been scrolled past
			$('body').toggleClass('toh-summary-on', !entries[0].isIntersecting);
		},{threshold:0}).observe(hero);
	})();

	// the magnifier scrolls to the top and focuses the search
	$('#toh-summary-back').on('click',function(e){
		e.preventDefault();
		tohScrollTop();
		$('#toh-search-input-model').trigger('focus');
	});

	// drop the search term, leaving the filters alone
	$('#toh-summary-chips').on('click','.toh-summary-chip-drop',function(e){
		e.preventDefault();
		const field=$(this).attr('data-field');
		$('#toh-search-input-'+field).val('').trigger('keyup');
	});

	// the filters chip opens the rail, which is a drawer on narrow viewports
	$('#toh-summary-chips').on('click','.toh-summary-chip-filters',function(e){
		e.preventDefault();
		if($('#toh-sidebar-toggle').is(':visible')){
			$('body').addClass('toh-sidebar-open');
			$('#toh-sidebar-toggle').attr('aria-expanded','true');
		}
		if($('#toh-filters-container').hasClass('toh-hidden')){
			$(".toh-filters-but-toggle").trigger('click');
		}
		document.getElementById('toh-sidebar').scrollIntoView({block:'start', behavior:'smooth'});
	});

	// Advanced: the hero button already owns this, so defer to it
	$('#toh-summary-adv').on('click',function(e){
		e.preventDefault();
		$('#toh-adv-open').trigger('click');
	});

	// Row density ############################################################################################################

	$('#toh-density').on('click','.toh-density-but',function(e){
		e.preventDefault();
		tohApplyDensity($(this).attr('data-density'));
	});

	// Cards : the phone renderer #############################################################################################

	$('#toh-cards-list').on('click','.toh-card-details',function(){
		tohSheetOpen($(this).closest('.toh-card-dev').attr('data-id'));
	});
	$('#toh-cards-list').on('click','.toh-card-fav',function(){
		tohFavToggle($(this).closest('.toh-card-dev').attr('data-id'));
	});
	$('#toh-cards-list').on('click','.toh-card-cmp',function(){
		// tohCompareToggle() sets the state passed as its second argument; it
		// does not flip the current one
		const id=$(this).closest('.toh-card-dev').attr('data-id');
		if(!tohCompareToggle(id, !tohCompareHas(id))){
			// the comparison is full: shake the tray, as the row checkbox does
			$('#toh-compare-tray').shake();
		}
	});

	// paging through Tabulator, so the table and the cards are never on
	// different pages of the same result set
	$('#toh-cards-sort-by').on('change',function(){
		tohCardsSortApply($(this).val());
	});
	$('#toh-cards-prev').on('click',function(){
		tabuTable.previousPage().catch(() => {});
	});
	$('#toh-cards-next').on('click',function(){
		tabuTable.nextPage().catch(() => {});
	});

	$('#toh-sheet-close, #toh-sheet-scrim').on('click',function(){
		tohSheetClose();
	});
	$(document).on('keydown',function(e){
		if(e.key === 'Escape'){
			tohSheetClose();
		}
	});

	// the Advanced Search panel's own controls
	$('#toh-adv-close').on('click',function(e){
		e.preventDefault();
		tohCloseAdvSearch();
	});
	$('#toh-adv-apply').on('click',function(e){
		e.preventDefault();
		tohAdvApply();
	});
	$('#toh-adv-body').on('change','.toh-adv-check',function(){
		tohAdvSync();
	});
	$('#toh-adv-body').on('change','.toh-adv-select',function(){
		tohAdvSync();
	});


	// Configurator ###########################################################################################################

	$('#toh-wiz-open').on('click',function(e){
		e.preventDefault();
		if($('#toh-wiz-panel').hasClass('toh-hidden')){
			tohOpenWizard();
		}
		else{
			tohCloseWizard();
		}
	});
	$('#toh-wiz-close').on('click',function(e){
		e.preventDefault();
		tohCloseWizard();
	});
	$('#toh-wiz-body').on('click','.toh-wiz-option',function(e){
		e.preventDefault();
		const step=toh_wizard[toh_wizard_at];
		toh_wizard_answers[step.key]=parseInt($(this).attr('data-index'),10);
		tohBuildWizard();
	});
	$('#toh-wiz-back').on('click',function(e){
		e.preventDefault();
		if(toh_wizard_at > 0){
			toh_wizard_at--;
			tohBuildWizard();
		}
	});
	$('#toh-wiz-next').on('click',function(e){
		e.preventDefault();
		if(toh_wizard_at < toh_wizard.length - 1){
			toh_wizard_at++;
			tohBuildWizard();
		}
		else{
			tohWizardApply();
		}
	});

	// Click: explain the numbered preset slots -------------------
	// There are two help buttons, one for the filter slots and one for the
	// column slots; each finds its own hint through aria-controls.
	function tohHintFor($help){
		return $('#' + $help.attr('aria-controls'));
	}
	function tohSetHint($help, open){
		tohHintFor($help).toggleClass('toh-hidden', !open);
		$help.toggleClass('is-open', open).attr('aria-expanded', open ? 'true' : 'false');
	}
	function tohCloseHints(){
		$('.toh-upresets-help').each(function(){
			tohHintFor($(this)).data('pinned', false);
			tohSetHint($(this), false);
		});
	}
	// Hover opens it, so by the time a click arrives it is already showing:
	// the click pins it rather than toggling it shut again.
	$('.toh-upresets-help').on('click',function(e){
		e.preventDefault();
		e.stopPropagation();
		const $help=$(this);
		const $hint=tohHintFor($help);
		const pinned=!!$hint.data('pinned');
		$hint.data('pinned', !pinned);
		tohSetHint($help, !pinned);
	});
	$('.toh-upresets-help').on('mouseenter',function(){
		tohSetHint($(this), true);
	});
	$('.toh-upresets-title').on('mouseleave',function(){
		const $help=$(this).find('.toh-upresets-help');
		if($help.length && !tohHintFor($help).data('pinned')){
			tohSetHint($help, false);
		}
	});
	$('.toh-hint').on('mouseleave',function(){
		if(!$(this).data('pinned')){
			const $help=$('.toh-upresets-help[aria-controls="'+this.id+'"]');
			if($help.length){ tohSetHint($help, false); }
		}
	});
	// a click elsewhere or Escape closes it
	$(document).on('click',function(e){
		if($(e.target).closest('.toh-hint, .toh-upresets-help').length === 0){
			tohCloseHints();
		}
	});
	$(document).on('keydown',function(e){
		if(e.key === 'Escape'){
			tohCloseHints();
		}
	});


	// Statistics #############################################################################################################

	$('#toh-stats-open').on('click',function(e){
		e.preventDefault();
		tohOpenStats();
	});


	// Manufacturer / chipset pages ###########################################################################################

	// Anything marked js-toh-facet opens one. Listens in the capture phase
	// because Tabulator stops clicks from bubbling out of its popup, so a
	// delegated jQuery handler on document would not see them.
	document.addEventListener('click', function(e){
		const el=e.target.closest ? e.target.closest('.js-toh-facet') : null;
		if(!el){
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		tohCloseDevice();				// close the popup or the phone sheet
		tohOpenFacet(el.getAttribute('data-type'), el.getAttribute('data-value'));
	}, true);


	// The flashmb header filter takes {minimum, search}, the shape its editor
	// (HeaderFilterFlash) stores and HeaderFilterFuncFlash reads. A plain string
	// would match no row.
	function tohHeaderFilterValue(field, value){
		if(field === 'flashmb'){
			const v=String(value === null || value === undefined ? '' : value).trim();
			return /^\d+$/.test(v) ? {minimum: v, search: ''} : {minimum: '', search: v};
		}
		return value;
	}

	// a statistics bar that filters the table by one column value
	document.addEventListener('click', function(e){
		const el=e.target.closest ? e.target.closest('.js-toh-column') : null;
		if(!el){
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		tohBackToTable();
		const field=el.getAttribute('data-field');
		tabuTable.setHeaderFilterValue(field, tohHeaderFilterValue(field, el.getAttribute('data-value')));
		tabuTable.refreshFilter();
		tohScrollTop();
	}, true);

	// "at least this much" - the quantity chips in the details popup
	document.addEventListener('click', function(e){
		const el=e.target.closest ? e.target.closest('.js-toh-atleast') : null;
		if(!el){
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		tohCloseDevice();
		tohBackToTable();
		const field=el.getAttribute('data-field');
		tabuTable.setHeaderFilterValue(field, tohHeaderFilterValue(field, el.getAttribute('data-value')));
		tabuTable.refreshFilter();
		tohScrollTop();
	}, true);

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


	//  Back and forward move between devices ----------------------
	$(window).on('popstate',function(){
		tohDevicePopState();
		tohComparePopState();
		tohViewPopState();
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
		// No redraw: every token the dark theme overrides is a colour or a
		// shadow, so no row metric changes and Tabulator has nothing to recompute.
	});

	// Fetch content and build table ----------------------------------
	// The two requests run in parallel: the release data only decorates the
	// download column, and its readers check toh_firmwares_fetched.
	$('#toh-load-text').html('Fetching TOH devices...');
	Promise.all([
		FetchReleases(),
		(window.__tohData || $.getJSON(toh_urls.toh_json))
	]).then(function(results){
		const data=results[1];
		//Makes columns
		var columns = data.columns.map((value, index) => ({
			field: value,
			title: data.captions[index],
			visible: false,
			// Tabulator JSON.stringifies a non-scalar value on download, so an
			// array cell would reach the CSV as the literal ["16"]
			accessorDownload: tohDownloadValue,
			...toh_colStyles[value]
		}));

		// add vitual (not linked to existing fields) columns
		var virtualColumns = getVirtualColumns();
		columns=[...columns, ...virtualColumns];

		// page header figures
		UpdatePageStats(data);

		// read before SetDefaults() rewrites the address bar
		tohCompareReadUrl();
		tohDeviceReadUrl();
		// and before the rows render, or every heart draws empty
		tohFavLoad();
		toh_facet_pending=tohFacetReadUrl();

		// Rows as objects, keyed by field name. data.entries is an array of
		// arrays, which Tabulator would map onto the columns by position, and
		// the columns are sorted into display order below.
		const fields=data.columns;
		const rows=new Array(data.entries.length);
		for(let i=0; i<data.entries.length; i++){
			const src=data.entries[i];
			const obj={};
			for(let j=0; j<fields.length; j++){
				obj[fields[j]]=src[j];
			}
			rows[i]=obj;
		}

		columns.sort((a, b) => {
			const indexA = columnOrder.indexOf(a.field);
			const indexB = columnOrder.indexOf(b.field);
			if (indexA === -1 && indexB === -1) return 0; // Both names not in order, keep original order
			if (indexA === -1) return 1; // a's name not in order, move to end
			if (indexB === -1) return -1; // b's name not in order, move to end
			return indexA - indexB;
		});

		//init table with data
		showLoading();
		tabuTable.setColumns(columns);
		tabuTable.setData(rows).then(() =>{
			tohRowsInvalidate();		// the cached row list belongs to the old data

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
			setTableHeight(tabulatorOptions.paginationSize);
			requestAnimationFrame(() => setTableHeight(tabulatorOptions.paginationSize));

			tohFavInit();
			// the counts walk the whole dataset, so they wait until the page has painted
			tohWhenIdle(tohShowFilterCounts);
			tohCompareApply();
			tohDeviceApply();
			if(toh_facet_pending){
				if(toh_facet_pending.type === 'stats'){
					tohOpenStats(false);
				}
				else{
					tohOpenFacet(toh_facet_pending.type, toh_facet_pending.value, false);
				}
				toh_facet_pending=null;
			}
			InitHeaderSearch();
			PreLoadImagesCache();
		});
	}).catch(function(err){
		// openwrt.org rate-limits this endpoint and downloads get cut off;
		// without this the loading screen would stay up forever
		myLogStr('Could not load the device list: ' + err, 1);
		tohBootFailed(err);
	});

	// Boot could not finish: say so and offer a retry -------------------------
	function tohBootFailed(err){
		const status=(err && (err.status || (err.jqXHR && err.jqXHR.status))) || 0;
		const rated=status === 429 || status === 503;
		$('#toh-boot-icon').hide();
		$('#toh-load-text').html(
			'<b>Could not load the device list.</b><br>'
			+ (rated
				? 'openwrt.org is busy or rate-limiting right now.'
				: 'The download from openwrt.org did not complete.')
			+ '<br><button type="button" id="toh-boot-retry" class="toh-but">Try again</button>'
		);
		$('#toh-boot-retry').on('click',function(){
			window.location.reload();
		});
	}






	// Dev badge ##############################################################################################################

	$('#toh-dev-badge').on('click',function (e) {
		$('body').removeClass('branch-dev');
		$('#toh-changelog').addClass('toh-hidden');
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
	
	
	// input search.
	// 'input' as well as 'keyup': a phone keyboard's suggestions, dictation and
	// paste change the value without sending a key event. The debounce below
	// absorbs the duplicate the two events make.
	$('.toh-search-input').on('keyup input', function() {
		const field=$(this).attr('data-field');
		toggleSearchClearButton(field);

		// Clear any existing timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		// Set new timeout
		this.timeoutId = setTimeout(() => {
			tabuTable.setHeaderFilterValue(field,$(this).val());
			buildBrowserUrl();
		}, 300);

	});

	// header filter -> search input.
	// Delegated, because Tabulator rebuilds these INPUTs whenever the visible columns change.
	$('#toh-table').on('keyup','.tabulator-header-filter INPUT', function() {
		const field=$(this).closest('.tabulator-col').attr('tabulator-field');
		const target=$('.toh-search-input[data-field="'+CSS.escape(field)+'"]');
		if(target.length==0){			// that column is not one of the two the header search offers
			return;
		}
		target.val($(this).val());
		toggleSearchClearButton(field);

		// Clear any existing timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		// Set new timeout
		this.timeoutId = setTimeout(() => {
			buildBrowserUrl();
		}, 300);
	});

	// empty both search inputs, e.g. when the header filters are cleared
	function clearHeaderSearch(){
		$('.toh-search-input').val('');
		$('.toh-search-clear').hide();
	}

	function InitHeaderSearch(){
		$('.toh-search-input').trigger('keyup'); // needed when manually relaoding a page that already have a search query
	}






	// User Presets ###########################################################################################################

	$('.toh-upresets-content').on('click','.toh-upreset-but',function(e){
		e.preventDefault();
		e.stopPropagation();
		var $preset=$(this);
		var num=$preset.attr('data-key');
		var type=$preset.attr('data-type');
		myLogFunc("Click user preset:"+type+' / '+num);
		// a plain click on an empty slot saves into it, like Shift-click
		const isEmpty=!$preset.hasClass('toh-used');
		if(e.shiftKey || (isEmpty && !e.altKey)){
			myLogStr('save');
			var name="user"+num;

			$preset.addClass('toh-saving');

			// show popup
			var $popupDiv	=$('#toh-upreset-popup-save');
			var $input			=$popupDiv.find('INPUT');
			var $but_save		=$popupDiv.find('BUTTON');
			$input.val('');
			$popupDiv.removeClass('toh-hidden');
			
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
				$popupDiv.addClass('toh-hidden');
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
		if($('#toh-upreset-popup-save').hasClass('toh-hidden')) return;
		myLogStr('Click document USED');
		$('#toh-upreset-popup-save').addClass('toh-hidden');
		$('.toh-upreset-but').removeClass('toh-saving');

	});






	// Top Filters ############################################################################################################

	//  Click: Filter Preset ------------------------------------------
	$('#toh-top-filters').on('click','.toh-filter-preset .toh-filter-button',function(e){
		myLogFunc("on Click filter preset");
		e.preventDefault();
		var key=$(this).attr('data-key');
		// a second click on the one that is on clears it again
		if($(this).hasClass('toh-selected')){
			tohClearFilterPreset();
			return;
		}
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
		$(this).parent().find('INPUT').trigger('click');
	});
	// a feature link is a toggle button, and Space presses a button
	$('#toh-top-filters').on('keydown','.toh-filter-feature .toh-filter-title A',function(e){
		if(e.key === ' '){
			e.preventDefault();
			$(this).trigger('click');
		}
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
			toh_view_chosen=true;	// chosen by hand: a resize must not override it
			applyColumnPreset(view);
		}
	});

	// Click (or viewchanged): one view CheckBox ----------------------
	$('#toh-cols-columns-content').on('click viewchanged','INPUT',function(e){
		var key=$(this).attr('data-key');
		myLogFunc('on Click Checkbox Col: '+key);
		toh_current_view=null;			// hand-picked columns are not a named view
		applyColumCol(key, $(this).is(":checked") );
	});

	// Click: one view link ----------------------
	$('.toh-cols-list').on('click','A',function(e){
		myLogFunc('on Click Checkbox Link');
		e.preventDefault();
		$(this).parent().find('INPUT').trigger('click');
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
		tohResetThresholds();
		tabuTable.clearFilter();
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		updateFilterGroupState();		// or the rail keeps showing them as on
		buildBrowserUrl();	
	});

	// Click: clear header filters ----------------
	$(".toh-but-clearheaderfilters").on('click', function (e) {
		myLogFunc('on Click But ClearHeaderFilters');
		e.preventDefault();
		// Empty the boxes first: clearHeaderFilter() triggers the summary refresh,
		// which reads those inputs.
		clearHeaderSearch();
		tabuTable.clearHeaderFilter();
		buildBrowserUrl();
	});

	// Click: clear all filters ----------------
	$(".toh-but-clearallfilters").on('click', function (e) {
		myLogFunc('on Click But ClearAllFilters');
		e.preventDefault();
		tohResetThresholds();
		tabuTable.clearHeaderFilter();
		clearHeaderSearch();
		tabuTable.clearFilter();
		checkAllFeatures(false);
		setPresetSelectedClass('features','custom');
		updateFilterGroupState();		// or the rail keeps showing them as on
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
				$('.tabulator-col[tabulator-field="'+CSS.escape(f)+'"]').addClass(myclass);
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
		// renderComplete does not fire while the table container is display:none
		// (the card layout), so the cards are redrawn from here. Deferred a task
		// because getRows('active') still returns the old set at this point.
		if(toh_cards_on){
			setTimeout(tohRenderCards, 0);
		}
		if(toh_table_inited){
			buildBrowserUrl();
		}

	});


	// Update the counter when 'dataFiltered' event is REALLY finished --------------------
	tabuTable.on("renderComplete", function(){
		myLogStr('EVENT: table-change-complete', 4);
		tohLoadingDone();
		UpdateCountRows();
		UpdateCountCols();
		// also catches the first render, a window resize and a late web font
		setTableHeight(tabuTable.getPageSize());
		tohRenderCards();		// no-op unless the phone renderer is the one showing
	});

	// Resfresh column color on header-filter INPUT' blur ---------------------------------
	tabuTable.on("columnVisibilityChanged", function(column, visible){
		myLogStr('EVENT: columnVisibilityChanged', 4);
		tohLoadingDone();		// hiding every column triggers no render
		if(toh_table_inited){
			buildBrowserUrl();
		}
	});

	// Resfresh column color on header-filter INPUT' blur ---------------------------------
	tabuTable.on("dataSorted", function(sorters, rows){
		myLogStr('EVENT: dataSorted', 4);
		toggleSortClearButVisibility();
		tohCardsSortSync();
		// as for dataFiltered: the active rows are not in the new order yet
		if(toh_cards_on){
			setTimeout(tohRenderCards, 0);
		}
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
			last_table_height = getTableRowHeight() * size;
			myLogStr('Page Size: ' + size,4);
			myLogStr('Wanted Table Height: '+ last_table_height,4);

			if (toh_table_inited) { // we dont need it when page loads
				showLoading();

				setTimeout(() => {
					setTableHeight(size);
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
		tohRenderCards();
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
