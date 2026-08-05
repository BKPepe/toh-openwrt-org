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
	// the redesign renamed this; the old selector matched nothing, so clicking
	// the title did nothing at all
	$('#toh-appbar-title').attr('href',window.location.pathname);

	// and it should get you out of whatever panel you are in
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
			tohApplyViewportView();		// may swap the preset, so before the height
			tohRenderCards();			// crossing 700px swaps the renderer; no-op elsewhere
			setTableHeight($('.tabulator-page-size').val() || tabulatorOptions.paginationSize);
		},150);
	});

	// Favourites #############################################################################################################

	$('#toh-table').on('click','.toh-fav-toggle',function(e){
		e.preventDefault();
		e.stopPropagation();				// the cell click would open the details popup
		tohFavToggle($(this).attr('data-id'));
		if(toh_favorites_pinned){
			applyCheckedFeatures();			// re-run so the pinned group updates at once
		}
	});
	$('#toh-table').on('mousedown touchstart','.toh-fav-toggle',function(e){
		e.stopPropagation();
	});

	$('#toh-fav-pin').on('click',function(e){
		e.preventDefault();
		if(toh_favorites.length === 0){
			$('#toh-favorites').shake();
			return;
		}
		toh_favorites_pinned=!toh_favorites_pinned;
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
	// a device header in the comparison opens its full details, so a comparison
	// is a step on the way in rather than a dead end
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

	// only rows that differ - the point when comparing two near-identical revisions
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

	// Show it once the hero has gone. An observer on the hero rather than a
	// scroll handler, so nothing runs on the frames in between.
	(function(){
		const hero=document.getElementById('toh-hero');
		if(!hero || !window.IntersectionObserver){
			return;
		}
		new IntersectionObserver(function(entries){
			// the hero is only ever "not intersecting" downwards here, because it
			// is the first thing on the page
			$('body').toggleClass('toh-summary-on', !entries[0].isIntersecting);
		},{threshold:0}).observe(hero);
	})();

	// the magnifier goes back to the search rather than only to the top
	$('#toh-summary-back').on('click',function(e){
		e.preventDefault();
		tohScrollTop();				// BODY is the scroll container, not the window
		$('#toh-search-input-model').trigger('focus');
	});

	// dropping one search term, leaving the other and the filters alone
	$('#toh-summary-chips').on('click','.toh-summary-chip-drop',function(e){
		e.preventDefault();
		const field=$(this).attr('data-field');
		$('#toh-search-input-'+field).val('').trigger('keyup');
	});

	// the filters chip opens the rail, wherever the rail currently lives
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
		// despite the name it is a setter, not a toggle: the wanted state has to
		// be worked out here, the way the row checkbox passes its own
		const id=$(this).closest('.toh-card-dev').attr('data-id');
		tohCompareToggle(id, !tohCompareHas(id));
	});

	// paging through Tabulator, so the table and the cards are never on
	// different pages of the same result set
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

	// (cards re-render on resize inside the debounced handler above: a second,
	// undebounced listener rebuilt thirty cards on every resize event)
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
		const v=parseInt($(this).val(),10);
		toh_adv_nums[$(this).attr('data-key')]=isNaN(v) ? 0 : v;
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
	// Two of these now - one over the filter slots, one over the column slots -
	// so the handlers work off the class and find their own hint through
	// aria-controls rather than each knowing an id.
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
	// hovering is what most people try first; clicking pins it open
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
	// ... and closes the way everything else does
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


	// Collections ############################################################################################################

	$('#toh-collections-list').on('click','.toh-collection',function(e){
		e.preventDefault();
		tohApplyCollection(parseInt($(this).attr('data-index'),10));
	});


	// Statistics #############################################################################################################

	$('#toh-stats-open').on('click',function(e){
		e.preventDefault();
		tohOpenStats();
	});


	// Manufacturer / chipset pages ###########################################################################################

	// Anything marked js-toh-facet opens one, wherever it lives - including
	// inside the details popup, which is why this listens in the capture phase:
	// Tabulator stops the click bubbling out of its popup, so a delegated
	// jQuery handler on document never saw it.
	document.addEventListener('click', function(e){
		const el=e.target.closest ? e.target.closest('.js-toh-facet') : null;
		if(!el){
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		$('.toh-details-close').trigger('click');		// leave the popup behind
		tohOpenFacet(el.getAttribute('data-type'), el.getAttribute('data-value'));
	}, true);


	// a statistics bar that filters the table by one column value
	document.addEventListener('click', function(e){
		const el=e.target.closest ? e.target.closest('.js-toh-column') : null;
		if(!el){
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		tohBackToTable();
		tabuTable.setHeaderFilterValue(el.getAttribute('data-field'), el.getAttribute('data-value'));
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
		$('.toh-details-close').trigger('click');
		tohBackToTable();
		tabuTable.setHeaderFilterValue(el.getAttribute('data-field'), el.getAttribute('data-value'));
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
			tohDeviceReadUrl();
			// and before the rows render, or every heart draws empty
			tohFavLoad();
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
				setTableHeight(tabulatorOptions.paginationSize);
				requestAnimationFrame(() => setTableHeight(tabulatorOptions.paginationSize));

				tohFavInit();
				tohShowFilterCounts();
				tohBuildCollections();
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
			buildBrowserUrl();
		}, 300);

	});

	// header filter -> search input.
	// Delegated, because Tabulator rebuilds these INPUTs whenever the visible columns change.
	$('#toh-table').on('keyup','.tabulator-header-filter INPUT', function() {
		const field=$(this).closest('.tabulator-col').attr('tabulator-field');
		const target=$('.toh-search-input[data-field='+field+']');
		if(target.length==0){			// that column is not one of the two the header search offers
			return;
		}
		target.val($(this).val());
		toggleSearchClearButton(field);
		showHeaderSearchIfUsed();

		// Clear any existing timeout
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
		}

		// Set new timeout
		this.timeoutId = setTimeout(() => {
			buildBrowserUrl();
		}, 300);
	});

	// open the header search as soon as one of its inputs holds something
	function showHeaderSearchIfUsed(){
		$('.toh-search-input').each(function() {
			if($(this).val().length>0){
				$('#toh-search').removeClass('toh-hidden');
			}
		});
	}

	// empty both search inputs, e.g. when the header filters are cleared
	function clearHeaderSearch(){
		$('.toh-search-input').val('');
		$('.toh-search-clear').hide();
	}

	function InitHeaderSearch(){
		showHeaderSearchIfUsed();
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
		// An empty slot has nothing to load, so a plain click on one used to do
		// nothing at all. Treat it as "save into this slot", which is the only
		// thing it can usefully mean.
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
			toh_view_chosen=true;	// chosen by hand: resizing no longer overrides it
			applyColumnPreset(view);
		}
	});

	// Click (or viewchanged): one view CheckBox ----------------------
	$('#toh-cols-columns-content').on('click viewchanged','INPUT',function(e){
		var key=$(this).attr('data-key');
		myLogFunc('on Click Checkbox Col: '+key);
		toh_current_view=null;			// hand-picked columns are no longer a named view
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
		toh_extra_filters=[];
		toh_adv_nums={};
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
		tabuTable.clearHeaderFilter();
		clearHeaderSearch();
		buildBrowserUrl();
	});

	// Click: clear all filters ----------------
	$(".toh-but-clearallfilters").on('click', function (e) {
		myLogFunc('on Click But ClearAllFilters');
		e.preventDefault();
		toh_extra_filters=[];
		toh_adv_nums={};
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
		// also catches the first render, a window resize and a late web font
		setTableHeight(tabuTable.getPageSize());
		tohRenderCards();		// no-op unless the phone renderer is the one showing
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
		tohRenderCards();
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
