// ##########################################################################################################################################################
// Configuration ############################################################################################################################################
// ##########################################################################################################################################################

// global -------------------------------------------------------
const toh_app={
	version:	"1.81b1",	// Version
	branch:		"dev", 		// Branch, either: 'prod' | 'dev'	
};

// set the log level displayed in the console :
// 0=none
// 1=info
// 2=debug
// 3=verbose
// 4=more verbose
var toh_debug_level=1; 


// Urls --------------------------------------------------------
const toh_urls={
	www: 			"https://openwrt.org/",
	hwdata: 		"https://openwrt.org/toh/hwdata/",
	firm_select: 	"https://firmware-selector.openwrt.org/",
	firm_versions: 	"https://downloads.openwrt.org/.versions.json",
	firm_releases: 	"https://downloads.openwrt.org/releases/VERSION/.overview.json",
	toh_json:		"https://openwrt.org/toh.json",
	media:			"https://openwrt.org/_media/",
	github_commit:	"https://github.com/openwrt/openwrt/commit/",
	git_search:		"https://github.com/search?type=code&q=repo:openwrt/openwrt%20",
	forum_search:	"https://forum.openwrt.org/search?q=",
}

// Preferences --------------------------------------------------
const toh_prefs={
	def_filter: 	'',					// default Filter Preset
	def_features: 	'',					// default Features (list ',' separated)
	def_density:	'comfortable',		// default row height, see toh_densities
	cook_name_density:'density',		// name of the row-height cookie
	def_view: 		'normal',			// default Columns View Preset
	def_view_narrow:'tablet',			// ... below narrow_max_width, where 'normal' only scrolls sideways
	narrow_max_width: 1099,				// 'normal' needs 1,018px of table plus the page gutters and a scrollbar
	def_columns: 	'',					// default Columns (list ',' separated)
	def_show_filters: true,				// default show filters (the sidebar section)
	def_show_views: false,				// default show columns views (the toolbar menu)

	p_filter:		'filter',			//name of the filter preset URL parameter
	p_features:		'features',			//name of the filter features URL parameter
	p_view:			'view',				//name of the columns  preset URL parameter
	p_columns:		'columns',			//name of the columns URL parameter

	cook_prefix:	'toh_',				// the cookie's prefix,
	cook_duration:	3600*24*730,		// the cookie's duration (in sec),
	cook_path: 		'',					// the cookie's path (will be set to the current path if not set),
	cook_preset_count: 	3,				// how many uset preset (features or columns) cookies do we use
	cook_name_features:'myFeatures', 	// name of the features cookie,
	cook_name_columns:'myColumns',		// name of the columns cookie,
	cook_max_chars: 	12,				// max number of character allowed in the cookie name

	boot_hide:		true,				// Hides the boot overlay, once inited
	preload: 		true,				// Preload images (in background)

};

// Row heights the density switch offers -------------------------------------
const toh_densities={
	comfortable:	34,
	compact:		28,
};

// options for tabulator table (tabuTable) ---------------------
let tabulatorOptions={
	importFormat:"array",
	// Columns keep the width they define; spare width goes to the columns that
	// set widthGrow (brand, model and cpu).
	layout:"fitColumns",
	// Only render the cells that are on screen: every row carries a definition
	// for every column, and a preset shows only a few of them.
	renderHorizontal:"virtual",
	rowHeight:toh_densities.comfortable,	// mutated by tohApplyDensity()
	maxHeight:'100%',
	height: "100%",

	pagination: true,
	paginationCounter:"rows", 			//add pagination row counter
	paginationButtonCount: 10,
	paginationSize: 30,
	paginationSizeSelector:[10, 20, 30, 40, 50, 75, 100, 200, 300], //enable page size select element with these options

	rowFormatter: _rfRowFormatter,
	groupValues: [["Favourites", "All devices"]],	// so pinned favourites come first
	groupStartOpen: true,
	dataLoader: false,				// dont show the table loading overlay
	columns:[],
	movableColumns:true,      		//allow column order to be changed
	columnDefaults:{
		// fitColumns shares out spare width by widthGrow and shrinks by
		// widthShrink. Both are off by default, so a wide preset scrolls sideways
		// and only the columns that set widthGrow take the spare width.
		widthGrow:0,
		widthShrink:0,
		headerFilter:true,
		headerTooltip:true,
//		hozAlign: 'right',
		tooltip:_tooltipText,	// tooltip:true would write the cell value with innerHTML
		headerSortTristate:true,
	},

};




// ##########################################################################################################################################################
// Columns Styles ###########################################################################################################################################
// ##########################################################################################################################################################
let colFilterMin={headerFilterPlaceholder:"Min", headerFilterFunc:_hFilFuncMin}; // the built-in ">=" compares these values as strings
// parseInt('') is NaN, which would be displayed as the text "NaN": store null.
let colMutatorInt={ mutator: function(value) {
	const n=parseInt(value, 10);
	return isNaN(n) ? null : n;
} };

let toh_colStyles = {
//	|toh field,							|Col Name				|Full Name										|width		|Horinzontal Align	|sorter type		|stay left		|formatter						|formatterParams				|misc options
	// brand, model and cpu set minWidth instead of width: fitColumns never grows
	// a column that has an explicit width, whatever its widthGrow.
    brand:								{title: "Brand",		headerTooltip: 'Brand',						minWidth: 90,	hozAlign: 'left',	sorter: undefined,	frozen: true,	formatter: undefined,			formatterParams: undefined,		clickPopup: _cPopupModel,	widthGrow: 2, download: _downloadWith('model')},
    model:								{title: "Device",		headerTooltip: 'Manufacturer and model',	pickerLabel: 'Device (brand + model)',	minWidth: 150,	hozAlign: 'left',	sorter: _sorterDevice,	frozen: true,	formatter: _formatDevice,		formatterParams: undefined,		clickPopup: _cPopupModel,	widthGrow: 2,	headerFilterPlaceholder: 'Brand or model',	headerFilterFunc: _hFilFuncDevice, titleDownload: 'Model'},

    audioports:							{title: "Audio",		headerTooltip: 'Audio Ports',					width: 80,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined},
    availability:						{title: "Availability",	headerTooltip: 'Availability',					width: 130,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatAvailability,	formatterParams: undefined},
    bluetooth:							{title: "BT",			headerTooltip: 'Bluetooth version',				width: 40,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    bootloader:							{title: "Boot",			headerTooltip: 'BootLoader',					width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    buttoncount:						{title: "Butt.",		headerTooltip: 'Button count',					width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin},
    cpu:								{title: "CPU",			headerTooltip: 'CPU, cores and clock',		minWidth: 108,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatCpu,	formatterParams: undefined,		cellClick: _cClickChipset,	widthGrow: 2},
    comments:							{title: "Comments",		headerTooltip: 'Comments',						width: 200,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    commentsavports:					{title: "AV Comments",	headerTooltip: 'AV ports Comments',				width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    commentinstallation:				{title: "Inst.Comments",headerTooltip: 'Installation Comments',			width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    commentsnetworkports:				{title: "Net Comments",	headerTooltip: 'Network ports Comments',		width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    commentrecovery:					{title: "Rec.Comments",	headerTooltip: 'Recovery Comments',				width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    commentsusbsataports:				{title: "US Comments",	headerTooltip: 'USB SATA ports Comments',		width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    cpucores:							{title: "Cores",		headerTooltip: 'CPU number of Cores',			width: 50,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin, download: _downloadWith('cpu')},
    cpumhz:								{title: "MHz",			headerTooltip: 'CPU Speed (MHz)',				width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin, ...colMutatorInt, download: _downloadWith('cpu')},
    detachableantennas:					{title: "D.Ant.",		headerTooltip: 'Detachable Antennas',			width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined}  ,
    deviceid:							{title: "Device ID",	headerTooltip: 'Device ID',						width: 120,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    devicepage:							{title: "Page",			headerTooltip: 'Device Information Page',		width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'info', ttip:'Information Page'},		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    devicetype:							{title: "Device Type",	headerTooltip: 'Device Type',					width: 120,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    ethernet100mports:					{title: "Eth 100",		headerTooltip: 'Ethernet 100M ports',			width: 52,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatCleanEmpty,	formatterParams: undefined,		...colFilterMin, download: _downloadWith('ethernet1gports')},
    ethernet1gports:					{title: "Ethernet",		headerTooltip: 'Ethernet ports',	pickerLabel: 'Ethernet (ports, combined)',	width: 96,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatEthernet,		formatterParams: undefined,		...colFilterMin, titleDownload: 'Eth 1G'},
    ethernet2_5gports:					{title: "Eth 2.5G",		headerTooltip: 'Ethernet 2.5G ports',			width: 60,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatCleanEmpty,	formatterParams: undefined,		...colFilterMin, download: _downloadWith('ethernet1gports')},
    ethernet5gports:					{title: "Eth 5G",		headerTooltip: 'Ethernet 5G ports',				width: 50,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatCleanEmpty,	formatterParams: undefined,		...colFilterMin, download: _downloadWith('ethernet1gports')},
    ethernet10gports:					{title: "Eth 10G",		headerTooltip: 'Ethernet 10G ports',			width: 55,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatCleanEmpty,	formatterParams: undefined,		...colFilterMin, download: _downloadWith('ethernet1gports')},
    fccid:								{title: "FCC",			headerTooltip: 'FCC ID',						width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams:  {icon: 'landmark', ttip:'FCC Search Page'},					headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    firmwareoemstockurl:				{title: "Stock",		headerTooltip: 'OEM Stock Firmware',			width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'file-down', ttip:'Download Stock Firmware'},		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    firmwareopenwrtinstallurl:			{title: "Install",		headerTooltip: 'OpenWrt Firmware Install',		width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'download', ttip:'Download Installation Firmware'},		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    firmwareopenwrtupgradeurl:			{title: "Upgrade",		headerTooltip: 'OpenWrt Firmware Upgrade',		width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'download', ttip:'Download Upgrade Firmware'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    firmwareopenwrtsnapshotinstallurl:	{title: "S.Install",	headerTooltip: 'OpenWrt Snapshot Install',		width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'camera', ttip:'Download Installation Snapshot'},	headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    firmwareopenwrtsnapshotupgradeurl:	{title: "S.Upgrade",	headerTooltip: 'OpenWrt Snapshot Upgrade',		width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'camera', ttip:'Download Upgrade Snapshot'},	headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    flashmb:							{title: "Flash",		headerTooltip: 'Flash Memory (Mb)',				width: 108,	hozAlign: 'right',	sorter: _sorterFlash,frozen: false,	formatter: _formatArray,		formatterParams: {unit:'MB'}, headerFilter:_hFilterFlash, headerFilterFunc:_hFilFuncFlash, headerFilterLiveFilter:false, headerFilterPlaceholder:"Min / text" },	// , cellClick:cellDebug  , headerFilterEmptyCheck:HeaderFilterEmpty
    forumsearch:						{title: "S.Forum",		headerTooltip: 'Search in Forums',				width: 40,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'user', ttip:'Forum Search Page', prefix:toh_urls.forum_search},	headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},	
    gitsearch:							{title: "Git Search",	headerTooltip: 'Git Search',					width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'code', ttip:'GitHub Search Page', prefix:toh_urls.git_search},	headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},	
    gpios:								{title: "GPIOs",		headerTooltip: 'GPIOs',							width: 40,	hozAlign: 'right',	sorter: 'string',	frozen: false,	formatter: _formatCleanWords,	formatterParams: undefined,		...colFilterMin},
    installationmethods:				{title: "Inst.Method",	headerTooltip: 'Installation method(s)',		width: 90,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    jtag:								{title: "JTAG",			headerTooltip: 'has JTAG?',						width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatYesNo,		formatterParams: undefined},	
    ledcount:							{title: "Leds",			headerTooltip: 'LED count',						width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatCleanEmpty,	formatterParams: undefined,		...colFilterMin},
    modem:								{title: "Modem",		headerTooltip: 'Modem Type',					width: 55,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    oemdevicehomepageurl:				{title: "OEM",			headerTooltip: 'OEM Page',						width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'factory', ttip:'Manufacturer Page'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    outdoor:							{title: "OutDoor",		headerTooltip: 'OutDoor',						width: 40,	hozAlign: 'right',	sorter: 'string',	frozen: false,	formatter: _formatYesNo,		formatterParams: undefined},
    owrt_forum_topic_url:				{title: "Forum",		headerTooltip: 'Forum Topic',					width: 40,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,		formatterParams: {icon: 'user', ttip:'Forum Topic Page'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    packagearchitecture:				{title: "Pkg Arch",		headerTooltip: 'Package Architecture',			width: 90,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    phoneports:							{title: "Phone",		headerTooltip: 'Phone Ports',					width: 40,	hozAlign: 'right',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined},
    powersupply:						{title: "Power",		headerTooltip: 'Power Supply',					width: 70,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    picture:							{title: "Image",		headerTooltip: 'Device Picture',				width: 45,	hozAlign: "center",	sorter: 'array',	frozen: false,	formatter: _formatImages,		formatterParams: undefined,		tooltip: false},
    rammb:								{title: "RAM",			headerTooltip: 'RAM (Mb)',						width: 60,	hozAlign: 'right',	sorter: _sorterRam,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin,headerFilterFunc:_hFilFuncRamMb},
    recoverymethods:					{title: "Recovery",		headerTooltip: 'Recovery Methods',				width: 80,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    sataports:							{title: "SATA",			headerTooltip: 'SATA Ports',					width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin},
    serial:								{title: "Serial",		headerTooltip: 'Serial port',					width: 45,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatYesNo,		formatterParams: undefined},	
    serialconnectionparameters:			{title: "Serial Params.",headerTooltip: 'Serial connection parameters',	width: 90,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    serialconnectionvoltage:			{title: "S.Volt.",		headerTooltip: 'Serial connection voltage',		width: 45,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    sfp_ports:							{title: "SFP",			headerTooltip: 'SFP Ports',						width: 40,	hozAlign: 'right',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin},
    sfp_plus_ports:						{title: "SFP+",			headerTooltip: 'SFP+ Ports',					width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin},
    subtarget:							{title: "S.Target",		headerTooltip: 'Sub Target',					width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    supportedcurrentrel:				{title: "Support",	headerTooltip: 'Supported Current Release',		width: 100,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatRelease,		formatterParams: undefined,		tooltip: false},
    supportedsincecommit:				{title: "Commit",		headerTooltip: 'Supported Since Commit',		width: 54,	hozAlign: 'center',	sorter: undefined,	frozen: false,	formatter: _formatLinkCommit,	formatterParams: {},			tooltip: false},
    supportedsincerel:					{title: "S.Release",	headerTooltip: 'Supported Since Release',		width: 60,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    switch:								{title: "Switch",		headerTooltip: 'Switch',						width: 120,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    target:								{title: "Target",		headerTooltip: 'Target',						width: 60,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    unsupported_functions:				{title: "Unsupported",	headerTooltip: 'Unsupported Functions',			width: 85,	hozAlign: 'left',	sorter: 'array',	frozen: false,	formatter: undefined,			formatterParams: undefined},	
    usbports:							{title: "USB",			headerTooltip: 'USB Ports',						width: 60,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined,		...colFilterMin},
    version:							{title: "Version",		headerTooltip: 'Hardware Version',				width: 55,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    videoports:							{title: "Video",		headerTooltip: 'Video Ports',					width: 80,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined},
    vlan:								{title: "VLAN",			headerTooltip: 'has VLAN?',						width: 40,	hozAlign: 'right',	sorter: undefined,	frozen: false,	formatter: _formatYesNo,		formatterParams: undefined},
    whereavailable:						{title: "Where to Buy",	headerTooltip: 'Where to Buy',					width: 120,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    wlandriver:							{title: "WLAN Driver",	headerTooltip: 'WLAN Driver',					width: 80,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined},
    wlan24ghz:							{title: "Wi-Fi",		headerTooltip: 'Wi-Fi bands',	pickerLabel: 'Wi-Fi (bands, combined)',	width: 104,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatWifi,			formatterParams: undefined, titleDownload: '2.4 GHz'},
    wlan50ghz:							{title: "5 GHz",		headerTooltip: 'WLAN 5 GHz',					width: 52,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined, download: _downloadWith('wlan24ghz')},
    wlan60ghz:							{title: "6 GHz",		headerTooltip: 'WLAN 6 GHz (Wi-Fi 6E)',			width: 52,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined, download: _downloadWith('wlan24ghz')},
    wlan600ghz:							{title: "60 GHz",		headerTooltip: 'WLAN 60 GHz (WiGig)',			width: 58,	hozAlign: 'left',	sorter: 'string',	frozen: false,	formatter: undefined,			formatterParams: undefined, download: _downloadWith('wlan24ghz')},
    wlanhardware:						{title: "WLAN Hardware",headerTooltip: 'WLAN Hardware',					width: 120,	hozAlign: 'left',	sorter: 'array',	frozen: false,	formatter: _formatArray,		formatterParams: undefined},
    wlancomments:						{title: "WLAN Comments",headerTooltip: 'WLAN Comments',					width: 100,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: undefined,			formatterParams: undefined},
    wikideviurl:						{title: "Wiki",			headerTooltip: 'Wiki Page',						width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,			formatterParams: {icon: 'book-open', ttip:'Wiki Page'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},

	// The five link icons in one cell - see FormatterLinks(). The header shows
	// the same icons in the same order.
    VIRT_links:							{title: "Links",		headerTooltip: 'Device page · Hardware data · Manufacturer · Wiki · Forum',	pickerLabel: 'Links (page, data, OEM, wiki, forum)',	width: 124,	hozAlign: 'left',	sorter: undefined,	frozen: false,	formatter: _formatLinks,	formatterParams: undefined,		headerFilter: false, headerSort: false, tooltip: false, download: false, titleFormatter: _titleLinks},

	// A download link that names its release - see FormatterDownload(). Sorting
	// is off: the label is a version, and as a string "9" sorts after "10".
    VIRT_download:						{title: "Download",		headerTooltip: 'OpenWrt image, and which release it is',	pickerLabel: 'Download (which release)',	width: 88,	hozAlign: 'center',	sorter: undefined,	frozen: false,	formatter: _formatDownload,		formatterParams: undefined,		headerFilter: false, headerSort: false, tooltip: false, download: false},
    VIRT_firm:							{title: "Firmware",		headerTooltip: 'Firmware Selector Page',		width: 5,	hozAlign: 'center',	sorter: undefined,	frozen: false,	formatter: _formatLink,			formatterParams: {icon: 'cloud-download', ttip:'Firmware Selector Page'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    VIRT_hwdata:						{title: "HwData",		headerTooltip: 'Hardware Data Page',			width: 35,	hozAlign: 'center',	sorter: 'string',	frozen: false,	formatter: _formatLink,			formatterParams: {icon: 'database', ttip:'Hardware Data Page'}, 		headerFilter: false, headerSort: false, tooltip: false, titleFormatter: _titleIcon},
    VIRT_fav:							{title: "Fav",			headerTooltip: 'Keep an eye on this device',		pickerLabel: 'Favourite',	titleIcon: 'heart',					width: 32,	hozAlign: 'center',	sorter: undefined,	frozen: true,	formatter: _formatFavorite,		formatterParams: undefined,		tooltip: false, headerFilter: false, headerSort: false, download: false, titleFormatter: _titleNamedIcon},
    VIRT_compare:						{title: "Cmp",			headerTooltip: 'Pick devices to compare',		pickerLabel: 'Compare',		titleIcon: 'table-columns-split',	width: 34,	hozAlign: 'center',	sorter: undefined,	frozen: true,	formatter: _formatCompare,		formatterParams: undefined,		tooltip: false, headerFilter: false, headerSort: false, download: false, titleFormatter: _titleNamedIcon},
};




// ##########################################################################################################################################################
// Views ####################################################################################################################################################
// ##########################################################################################################################################################

// View Groups ---------------------------------------------------------------------------------------------
let toh_colGroups={
	base:{
		name: 'Main',
		fields:[
			'VIRT_fav',
			'VIRT_compare',
			'brand',
			'model',
		]
	},
	
	hardware_main:{
		name: 'Hardware',
		fields:[
			'version',
			'cpu',
			'cpucores',
			'cpumhz',
			'flashmb',
			'rammb',
			'switch',
			'wlanhardware',
		]
	},

	ports:{
		name: 'Ports',
		fields:[
			'audioports',
			'phoneports',
			'sataports',
			'usbports',
			'commentsusbsataports',
			'videoports',
			'commentsavports',
			'gpios',
			'jtag',
			'serial',
			'serialconnectionvoltage',
		]
	},


	features:{
		name: 'Features',
		fields:[
			'bluetooth',
			'buttoncount',
			'ledcount',
			'modem',
			'outdoor',
			'powersupply',
		]
	},

	ethernet:{
		name: 'Ethernet',
		fields:[
			'ethernet100mports',
			'ethernet1gports',
			'ethernet2_5gports',
			'ethernet5gports',
			'ethernet10gports',
		]
	},

	network:{
		name: 'Network',
		fields:[
			'sfp_ports',
			'sfp_plus_ports',
			'vlan',
			'commentsnetworkports',
		]
	},

	wifi:{
		name: 'Wi-Fi',
		fields:[
			'wlan24ghz',
			'wlan50ghz',
			'wlan60ghz',
			'wlan600ghz',
			'detachableantennas',
			'wlancomments',
		]
	},

	downloads:{
		name: 'Downloads',
		fields:[
			'VIRT_download',
			'VIRT_firm',
			'firmwareopenwrtinstallurl',
			'firmwareopenwrtupgradeurl',
			'firmwareopenwrtsnapshotinstallurl',
			'firmwareopenwrtsnapshotupgradeurl',
			'firmwareoemstockurl',
		]
	},

	links:{
		name: 'Links',
		fields:[
			'VIRT_links',
			'devicepage',
			'VIRT_hwdata',
			'oemdevicehomepageurl',
			'wikideviurl',
			'owrt_forum_topic_url',
			'forumsearch',
			'fccid',
		]
	},

	openwrt:{
		name: 'OpenWrt',
		fields:[
			'deviceid',
			'target',
			'subtarget',
			'supportedcurrentrel',
			'supportedsincerel',
			'supportedsincecommit',
			'gitsearch',
			'installationmethods',
			'commentinstallation',
			'unsupported_functions',
		]
	},

	software:{
		name: 'Software',
		fields:[
			'bootloader',
			'packagearchitecture',
			'wlandriver',
			'recoverymethods',
			'commentrecovery',
			'serialconnectionparameters',
		]
	},

	misc:{
		name: 'Misc',
		fields:[
			'devicetype',
			'availability',
			'picture',
			'whereavailable',
			'comments',
		]
	},

};


// View Presets --------------------------------------------------------------------------------------------
let toh_colPresets={
	normal:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.hardware_main.fields,
		...toh_colGroups.network.fields,
		...toh_colGroups.wifi.fields,
		'ethernet1gports',			// renders every ethernet port, not just 1G
		'supportedcurrentrel',
		'VIRT_download',
		...toh_colGroups.links.fields,
		'picture',
	],
	mini:	[
		// the Device column already shows the brand
		...toh_colGroups.base.fields.filter(f => f !== 'brand'),
		'cpu',
		'cpucores',
		'cpumhz',
		'rammb',
		'flashmb',
		'usbports',
		'wlan24ghz',
		'wlan50ghz',
		'ethernet1gports',
		'ethernet100mports',
		'VIRT_download',
		'VIRT_hwdata',
		'devicepage',
		'wikideviurl',
		'owrt_forum_topic_url',
		'availability',
		'picture'
		],
	// What fits a tablet without scrolling sideways. The default view below
	// toh_prefs.narrow_max_width - see tohDefaultView().
	tablet:	[
		'VIRT_fav',
		'VIRT_compare',
		'model',
		'cpu',
		'rammb',
		'flashmb',
		'wlan24ghz',			// renders every band, so wlan50ghz would repeat it
		'supportedcurrentrel',
	],
	hardware:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.hardware_main.fields,
		...toh_colGroups.ports.fields,
		...toh_colGroups.features.fields,
	],
	network:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.ethernet.fields,
		...toh_colGroups.network.fields,
		...toh_colGroups.wifi.fields,
	],
	links:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.links.fields,
		...toh_colGroups.downloads.fields,
	],
	software:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.openwrt.fields,
		...toh_colGroups.software.fields,
	],
	misc:	[
		...toh_colGroups.base.fields,
		...toh_colGroups.misc.fields,
	],
};


// removes some columns in the normal (groups based) preset ----
const normal_cols_to_remove=[
	'switch',
	'wlanhardware',
	'sfp_ports',
	'sfp_plus_ports',
	'vlan',
	'wlancomments',
	'commentsnetworkports',
	'forumsearch',
	'fccid',

	// the Device column already shows the brand
	'brand',

	// the CPU column shows cores and clock, the Wi-Fi column shows every band
	'cpucores',
	'cpumhz',
	'wlan50ghz',
	'wlan60ghz',

	// the Links column (VIRT_links) shows these five
	'devicepage',
	'VIRT_hwdata',
	'oemdevicehomepageurl',
	'wikideviurl',
	'owrt_forum_topic_url',

	'version',				// empty for most devices
	'wlan600ghz',			// 60GHz WiGig, very few devices
	'detachableantennas',
	'picture',
];
toh_colPresets.normal = toh_colPresets.normal.filter(item => !normal_cols_to_remove.includes(item));




// ##########################################################################################################################################################
// Filters ##################################################################################################################################################
// ##########################################################################################################################################################

// Filter Groups ---------------------------------------------------------------------------------------------
let toh_filterGroups={
	network:{
		title:"Network",
		icon:"network",
		members:[
			'eth_1g',
			'eth_2d5g',
			'eth_10g',
			'port_sfp',
			'vlan',
		],
	},

	wifi:{
		title:"Wi-Fi",
		icon:"wifi",
		members:[
			'antennas',
			'wifi_b',
			'wifi_g',
			'wifi_n',
			'wifi_ac',
			'wifi_ax',
			'wifi_be',
		],
	},

	memory:{
		title:"Memory",
		icon:"memory-stick",
		members:[
			'memory_minimum',
			'memory_more',
			'memory_comfort',
		],
	},

	port:{
		title:"Ports",
		icon:"usb",
		members:[
			'port_audio',
			'gpio',
			'port_phone',
			'port_sata',
			'port_usb',
			'port_video',
		],
	},

	features:{
		title:"Features",
		icon:"star",
		members:[
			'bluetooth',
			'modem_cellular',
			'modem_dsl',
			'outdoor',
			'pci',		
		],
	},

	type:{
		title:"Types",
		icon:"tag",
		members:[
			'type_board',
			'type_modem',
			'type_switch',
			'type_travel',
			'type_wifiap',
			'type_wifirouter',
		],
	},

	power:{
		title:"Power",
		icon:"zap",
		members:[
			'power_bat',
			'power_mains',
			'power_poe',
			'power_usb',
		],
	},
	
	misc:{
		title:"Misc",
		icon:"ellipsis",
		members:[
			'available',

		],
	},

	admin:{
		title:"Administration",
		icon:"shield",
		members:[
			'miss_commit',
			'miss_devpage',
			'miss_picture',
			'miss_pkg',
			'miss_wiki',
			'miss_all',
		],
	},


};

// Filter Features -------------------------------------------------------------------------------------------
let toh_filterFeatures={

	// normal features -------------------------------
	antennas:{
		title:		"Antennas",
		description:"with detachable antennas",
		type:		"normal",
		filters:[
			{field:	"detachableantennas", 	type:">",	value:''},
			{field:	"detachableantennas", 	type:"!=",	value:'-'},
		],
	},

	available:{
		title:		"Available",
		description:"Available or Unknown",
		type:		"normal",
		filters:[
			[
				{field:	"availability", 	type:"keywords",	value:'available unknown'},
				{field:	"availability", 	type:"=",			value:null},
			],
		],
	},

	bluetooth:{
		title:		"Bluetooth",
		description:"with bluetooth",
		type:		"normal",
		filters:[
			{field:	"bluetooth", 	type:"!=",	value: null},
			{field:	"bluetooth", 	type:"!=",	value:'-'},
		],
	},

	eth_1g:{
		title:		"Ethernet 1G",
		description:"at least 1G Ethernet",
		type:		"normal",
		filters:[
			[
				{field:	"ethernet1gports", 		type:"min>=",	value:1},
				{field:	"ethernet2_5gports",	type:"min>=",	value:1},
				{field:	"ethernet5gports",		type:"min>=",	value:1},
				{field:	"ethernet10gports",		type:"min>=",	value:1},
			],
		],
		only: "eth",
	},

	eth_2d5g:{
		title:		"Ethernet 2.5G",
		description:"at least 2.5G Ethernet",
		type:		"normal",
		filters:[
			[
				{field:	"ethernet2_5gports",	type:"min>=",	value:1},
				{field:	"ethernet5gports",		type:"min>=",	value:1},
				{field:	"ethernet10gports",		type:"min>=",	value:1},
			],
		],
		only: "eth",
	},

	eth_10g:{
		title:		"Ethernet 10G",
		description:"at least 10G Ethernet",
		type:		"normal",
		filters:[
			{field:	"ethernet10gports",		type:"min>=",	value:1},
		],
		only: "eth",
	},

	gpio:{
		title:		"GPIOs",
		description:"with GPIOs",
		type:		"normal",
		filters:[
			{field:	"gpios", 	type:"!=",	value: null},
			{field:	"gpios", 	type:"!=",	value:'-'},
		],
	},

	memory_minimum:{
		title:		"Mini",
		description:"at least 16MB Flash & 64MB RAM",
		type:		"normal",
		filters:[
			{field:	"rammb", 		type:"ram>=",		value:64},
			{field:	"flashmb", 		type:"flash>=",		value:16},
		],
		only: "memory",
	},

	memory_more:{
		title:		"More",
		description:"at least 64MB Flash & 128MB RAM",
		type:		"normal",
		filters:[
			{field:	"rammb", 		type:"ram>=",		value:128},
			{field:	"flashmb", 		type:"flash>=",		value:64},
		],
		only: "memory",
	},

	memory_comfort:{
		title:		"Comfort",
		description:"at least 128MB Flash & 128MB RAM",
		type:		"normal",
		filters:[
			{field:	"rammb", 		type:"ram>=",		value:128},
			{field:	"flashmb", 		type:"flash>=",		value:128},
		],
		only: "memory",
	},

	modem_dsl:{
		title:		"Modem: DSL",
		description:"with DSL modem",
		type:		"normal",
		filters:[
			{field:	"modem", 	type:"like",	value:'DSL'},
			{field:	"unsupported_functions", 	type:"regex",	value:'^((?!DSL).)*$'},
		],
		only: "modem",
	},

	modem_cellular:{
		title:		"Modem: Cell.",
		description:"with cellular modem",
		type:		"normal",
		filters:[
			[
				{field:	"modem", 	type:"like",	value:'LTE'},
				{field:	"modem", 	type:"like",	value:'Cellular'},
			],
		],
		only: "modem",
	},

	outdoor:{
		title:		"OutDoor",
		description:"outdoor usage",
		type:		"normal",
		filters:[
			{field:	"outdoor", 	type:"=",	value:'Yes'},
		],
	},

	pci:{
		title:		"PCI",
		description:"with PCI slot",
		type:		"normal",
		filters:[
			[
				// `comments` is free prose, so this term can give false positives. It
				// stays because some devices record their PCI slot nowhere else.
				{field:	"comments", 	type:"like",	value:'pci'},
				{field:	"wlanhardware", type:"like",	value:'pci'},
			],
		],
	},

	port_audio:{
		title:		"Audio",
		description:"with audio port",
		type:		"normal",
		filters:[
			{field:	"audioports", 	type:"!=",	value: null},
			{field:	"audioports", 	type:"!=",	value:'-'},
		],
	},

	port_phone:{
		title:		"Phone",
		description:"with phone port",
		type:		"normal",
		filters:[
			{field:	"phoneports", 	type:"!=",	value: null},
			{field:	"phoneports", 	type:"!=",	value:'-'},
		],
	},

	port_sfp:{
		title:		"SFP",
		description:"with SFP port",
		type:		"normal",
		filters:[
			[
				// min>= reads counts written as text ("more than 4"); a plain ">"
				// would compare them as strings
				{field:	"sfp_ports", 		type:"min>=",	value:1},
				{field:	"sfp_plus_ports", 	type:"min>=",	value:1},
			],
		],
	},

	port_sata:{
		title:		"SATA",
		description:"with SATA port",
		type:		"normal",
		filters:[
			{field:	"sataports", 	type:"min>=",	value:'1'},
		],
	},
	port_usb:{
		title:		"USB",
		description:"with USB port",
		type:		"normal",
		filters:[
			{field:	"usbports", 	type:"min>=",	value:'1'},
		],
	},

	port_video:{
		title:		"Video",
		description:"with video port",
		type:		"normal",
		filters:[
			{field:	"videoports", 	type:"!=",	value: null},
			{field:	"videoports", 	type:"!=",	value:'-'},
		],
	},

	power_bat:{
		title:		"Battery",
		description:"battery powered",
		type:		"normal",
		filters:[
			{field:	"powersupply", 	type:"like",	value:'battery'},
		],
	},

	power_mains:{
		title:		"Mains",
		description:"mains powered",
		type:		"normal",
		filters:[
			[
				// the wiki writes mains supply several ways ("110-220 VAC", "AC Line")
				{field:	"powersupply", 	type:"like",	value:'240'},
				{field:	"powersupply", 	type:"like",	value:'mains'},
				{field:	"powersupply", 	type:"like",	value:'vac'},
				{field:	"powersupply", 	type:"like",	value:'ac line'},
			],
		],
	},

	power_poe:{
		title:		"PoE",
		description:"PoE capable",
		type:		"normal",
		filters:[
			{field:	"powersupply", 	type:"like",	value:'poe'},
		],
	},

	power_usb:{
		title:		"USB",
		description:"USB powered",
		type:		"normal",
		filters:[
			{field:	"powersupply", 	type:"like",	value:'usb'},
		],
	},

	type_board:{
		title:		"Board",
		description:"Single board computer",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Single Board Computer'},
		],
		only: "type",
	},

	type_modem:{
		title:		"Modem",
		description:"with modem",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Modem'},
		],
		only: "type",
	},

	type_switch:{
		title:		"Switch",
		description:"Switch oriented",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Switch'},
		],
		only: "type",
	},

	type_travel:{
		title:		"Travel",
		description:"Portable device",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Travel'},
		],
		only: "type",
	},

	type_wifiap:{
		title:		"Wi-Fi AP",
		description:"Wi-Fi AP",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Wifi AP'},
		],
		only: "type",
	},

	type_wifirouter:{
		title:		"Wi-Fi Router",
		description:"Wi-Fi Router",
		type:		"normal",
		filters:[
			{field:	"devicetype", 	type:"like",	value:'Wifi Router'},
		],
		only: "type",
	},


	vlan:{
		title:		"VLAN",
		description:"supports VLAN",
		type:		"normal",
		filters:[
			{field:	"vlan", 	type:"=",	value:'Yes'},
		],
	},


	wifi_b:{
		title:		"Wi-Fi: B",
		description:"with 802.11b (Wi-Fi 1)",
		type:		"normal",
		filters:[
			[
				{field:	"wlan24ghz", 	type:"like",	value:'b'},
			],
		],
	},

	wifi_g:{
		title:		"Wi-Fi: G",
		description:"with 802.11g (Wi-Fi 3)",
		type:		"normal",
		filters:[
			[
				{field:	"wlan24ghz", 	type:"like",	value:'g'},
			],
		],
	},


	wifi_n:{
		title:		"Wi-Fi: N",
		description:"with 802.11n (Wi-Fi 4)",
		type:		"normal",
		filters:[
			[
				{field:	"wlan24ghz", 	type:"like",	value:'n'},
				{field:	"wlan50ghz", 	type:"like",	value:'n'},
			],
		],
	},

	wifi_ac:{
		title:		"Wi-Fi: AC",
		description:"with 802.11ac (Wi-Fi 5)",
		type:		"normal",
		filters:[
			{field:	"wlan50ghz", 	type:"like",	value:'ac'},
		],
	},

	wifi_ax:{
		title:		"Wi-Fi: AX",
		description:"with 802.11ax (Wi-Fi 6)",
		type:		"normal",
		filters:[
			[
				{field:	"wlan24ghz", 	type:"like",	value:'ax'},
				{field:	"wlan50ghz", 	type:"like",	value:'ax'},
				{field:	"wlan60ghz", 	type:"like",	value:'ax'},
			],
		],
	},

	wifi_be:{
		title:		"Wi-Fi: BE",
		description:"with 802.11be (Wi-Fi 7)",
		type:		"normal",
		filters:[
			[
				{field:	"wlan24ghz", 	type:"like",	value:'be'},
				{field:	"wlan50ghz", 	type:"like",	value:'be'},
				{field:	"wlan60ghz", 	type:"like",	value:'be'},
			],
		],
	},

	// admin features --------------------------------

	miss_commit:{
		title:		"Miss Git",
		description:"missing Git commit",
		type:		"admin",
		filters:[
			{field:	"supportedsincecommit", 	type:"=",	value:null},
		],
	},

	miss_devpage:{
		title:		"Miss Dev Page",
		description:"missing device page",
		type:		"admin",
		filters:[
			{field:	"devicepage", 	type:"=",	value:null},
		],
	},

	miss_picture:{
		title:		"Miss Picture",
		description:"missing Picture",
		type:		"admin",
		filters:[
			[
				{field:	"picture", 	type:"=",	value:null},
				{field:	"picture", 	type:"like",	value:'genericrouter1.png'},
			],
		],
	},

	miss_pkg:{
		title:		"Miss Pkg",
		description:"missing Package Ach.",
		type:		"admin",
		filters:[
			{field:	"packagearchitecture", 	type:"=",	value:null},
		],
	},

	miss_wiki:{
		title:		"Miss Wiki",
		description:"missing Wiki page",
		type:		"admin",
		filters:[
			{field:	"wikideviurl", 	type:"=",	value:null},
		],
	},

	miss_all:{
		title:		"Miss Something",
		description:"miss anything above",
		type:		"admin",
		filters:[
			[
				{field:	"supportedsincecommit", 	type:"=",	value:null},
				{field:	"devicepage", 				type:"=",	value:null},
				{field:	"picture", 					type:"=",	value:null},
				{field:	"picture", 					type:"like",	value:'genericrouter1.png'},
				{field:	"packagearchitecture", 		type:"=",	value:null},
				{field:	"wikideviurl", 				type:"=",	value:null},
			],
		],
	},


};


// Filter Presets --------------------------------------------------------------------------------------------
// `hidden` presets are not offered in the drawer but still resolve from a
// ?filter= link. Published links use their keys, so do not remove them.
let toh_filterPresets={

	more_864_ax_gbit_avail: {
		title:"Good all-rounder",
		description:"Wi-Fi 6, gigabit, room for packages, not discontinued",
		filters:[],
		features:['available','memory_more','wifi_ax','eth_1g'],
	},

	travel_routers: {
		title:"Travel routers",
		description:"Small, mains or USB powered",
		filters:[],
		features:['type_travel','available'],
	},
	wifi_7: {
		title:"Wi-Fi 7",
		description:"The newest wireless generation",
		filters:[],
		features:['wifi_be'],
	},
	wifi_6: {
		title:"Wi-Fi 6 and 6E",
		description:"Still current, far more choice",
		filters:[],
		features:['wifi_ax','available'],
	},
	multi_gig: {
		title:"2.5G and faster",
		description:"For internet past a gigabit",
		filters:[],
		features:['eth_2d5g'],
	},
	single_board: {
		title:"Single board computers",
		description:"Boards, not finished routers",
		filters:[],
		features:['type_board'],
	},
	cellular: {
		title:"Cellular modems",
		description:"With a cellular modem",
		filters:[],
		features:['modem_cellular'],
	},
	room_for_packages: {
		title:"Room for packages",
		description:"Comfortable flash and RAM",
		filters:[],
		features:['memory_comfort','available'],
	},
	poe: {
		title:"PoE capable",
		description:"Powered over ethernet",
		filters:[],
		features:['power_poe'],
	},
	still_sold: {
		title:"Not discontinued",
		description:"Available, or not recorded as gone",
		filters:[],
		features:['available'],
	},

	// hidden presets --------------------------------
	minimum_1664_ac_avail: {
		hidden:true,
		title:"Mini, AC, Avail.",
		description:"At least 16MB Flash & 64MB RAM + AC Wi-Fi + Available",
		filters:[],
		features:['available','memory_minimum','wifi_ac'],
	},
	minimum_1664_ac_gbit_avail: {
		hidden:true,
		title:"Mini, AC, Gbit, Avail.",
		description:"At least 16MB Flash & 64MB RAM + AC Wi-Fi + 1Gb Eth. + Available",
		filters:[],
		features:['available','memory_minimum','wifi_ac','eth_1g'],
	},
	minimum_1664_ac_gbit_avail_ant: {
		hidden:true,
		title:"Mini, AC, Gbit, Avail., Ant.",
		description:"At least 16MB Flash & 64MB RAM + AC Wi-Fi + 1Gb Eth. + Available + Antennas",
		filters:[],
		features:['available','memory_minimum','wifi_ac','eth_1g','antennas'],
	},
	minimum_1664_ax_gbit_avail: {
		hidden:true,
		title:"Mini, AX, Gbit, Avail.",
		description:"At least 16MB Flash & 64MB RAM + AX Wi-Fi + 1Gb Eth. + Available",
		filters:[],
		features:['available','memory_minimum','wifi_ax','eth_1g'],
	},
	more_864_ac_gbit_avail: {
		hidden:true,
		title:"More, AC, Gbit, Avail.",
		description:"At least 64MB Flash & 128MB RAM + AC Wi-Fi + 1Gb Eth. + Available",
		filters:[],
		features:['available','memory_more','wifi_ac','eth_1g'],
	},
};






// ########################################################################################################################################
// # functions referenced in colums definitions & tabulatorOptions  #######################################################################
// ########################################################################################################################################

function _rfRowFormatter(row){
	return tabuRowFormatter(row);
}

function _cPopupModel(e, cell, onRendered) {
	return CellPopupModel(e, cell, onRendered)
}


function _tooltipText(e, cell, onRendered) {
	return TooltipText(e, cell, onRendered);
}

// Exports a hidden field while the combined column that draws it is shown, so
// a CSV has Brand next to Model, every port speed and every Wi-Fi band.
function _downloadWith(field){
	return function(column){
		const host=this.getColumn(field);
		return column.isVisible() || Boolean(host && host.isVisible());
	};
}
function _hFilterFlash(cell, onRendered, success, cancel, editorParams){
	return HeaderFilterFlash(cell, onRendered, success, cancel, editorParams);
}
function _hFilFuncFlash(headerValue, rowValue, rowData, filterParams){
	return HeaderFilterFuncFlash(headerValue, rowValue, rowData, filterParams);
}
function _hFilFuncMin(headerValue, rowValue, rowData, filterParams){
	return HeaderFilterFuncMin(headerValue, rowValue, rowData, filterParams);
}
function _hFilFuncRamMb(headerValue, rowValue, rowData, filterParams){
	return HeaderFilterFuncRamMb(headerValue, rowValue, rowData, filterParams);
}


function _sorterFlash(a, b, aRow, bRow, column, dir, sorterParams){
	return SorterFlash(a, b, aRow, bRow, column, dir, sorterParams);
}
function _sorterRam(a, b, aRow, bRow, column, dir, sorterParams){
	return SorterRam(a, b, aRow, bRow, column, dir, sorterParams);
}


function _formatLink(cell, params, onRendered) {
	return FormatterLink(cell, params, onRendered);
}
function _titleIcon(cell, params, onRendered) {
	return TitleIcon(cell, params, onRendered);
}
function _titleNamedIcon(cell, params, onRendered) {
	return TitleNamedIcon(cell, params, onRendered);
}
function _formatDownload(cell, params, onRendered) {
	return FormatterDownload(cell, params, onRendered);
}
function _formatDevice(cell, params, onRendered) {
	return FormatterDevice(cell, params, onRendered);
}
function _formatCpu(cell, params, onRendered) {
	return FormatterCpu(cell, params, onRendered);
}
function _formatWifi(cell, params, onRendered) {
	return FormatterWifi(cell, params, onRendered);
}
function _formatEthernet(cell, params, onRendered) {
	return FormatterEthernet(cell, params, onRendered);
}
function _formatLinks(cell, params, onRendered) {
	return FormatterLinks(cell, params, onRendered);
}
function _titleLinks(cell, params, onRendered) {
	return TitleLinks(cell, params, onRendered);
}
function _sorterDevice(a, b, aRow, bRow, column, dir, sorterParams) {
	return SorterDevice(a, b, aRow, bRow, column, dir, sorterParams);
}
function _hFilFuncDevice(headerValue, rowValue, rowData, filterParams) {
	return HeaderFilterFuncDevice(headerValue, rowValue, rowData, filterParams);
}
function _formatLinkCommit(cell, params, onRendered) {
	return FormatterLinkCommit(cell, params, onRendered);
}
function _cClickChipset(e, cell) {
	e.stopPropagation();
	tohOpenFacet('chipset', cell.getRow().getData().cpu);
}
function _formatFavorite(cell, formatterParams, onRendered) {
	return FormatterFavorite(cell, formatterParams, onRendered);
}
function _formatCompare(cell, formatterParams, onRendered) {
	return FormatterCompare(cell, formatterParams, onRendered);
}
function _formatImages(cell, formatterParams, onRendered) {
	return FormatterImages(cell, formatterParams, onRendered);
}
function _formatCleanEmpty(cell, formatterParams, onRendered) {
	return FormatterCleanEmpty(cell, formatterParams, onRendered);
}
function _formatCleanWords(cell, formatterParams, onRendered) {
	return FormatterCleanWords(cell, formatterParams, onRendered);
}
function _formatArray(cell, formatterParams, onRendered) {
	return FormatterArray(cell, formatterParams, onRendered);
}
function _formatYesNo(cell, formatterParams, onRendered) {
	return FormatterYesNo(cell, formatterParams, onRendered);
}
function _formatRelease(cell, formatterParams, onRendered) {
	return FormatterRelease(cell, formatterParams, onRendered);
}
function _formatAvailability(cell, formatterParams, onRendered) {
	return FormatterAvailability(cell, formatterParams, onRendered);
}
