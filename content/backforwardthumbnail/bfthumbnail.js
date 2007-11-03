var BFThumbnailService = { 

	kTHUMBNAILS_DIR : 'thumbnails',
	kTOOLTIPTEXT    : 'bfthumbnail-tooltiptext-backup',

	thumbnailBG : 'rgb(192,192,192)',

	kDATABASE  : 'bfthumbnail.sqlite',
	kTABLE     : 'thumbnails',
	kKEY       : 'key',
	kTHUMBNAIL : 'thumbnail',
	kDATE      : 'last_updated_on',

	shown : false,
	 
/* references */ 
	 
	get canvas() 
	{
		return document.getElementById('thumbnail-saver-canvas');
	},
 
	get browser() 
	{
		return gBrowser;
	},
 
	get tooltip() 
	{
		return document.getElementById('bfthumbnail-tooltip');
	},
	get tooltipLabel()
	{
		return document.getElementById('bfthumbnail-tooltip-label');
	},
	get tooltipThumbnail()
	{
		return document.getElementById('bfthumbnail-tooltip-thumbnail');
	},
	get tooltipTitle()
	{
		return document.getElementById('bfthumbnail-tooltip-title');
	},
	get tooltipURI()
	{
		return document.getElementById('bfthumbnail-tooltip-uri');
	},
  
/* Initializing */ 
	 
	init : function() 
	{
		if (!('gBrowser' in window)) return;

		window.removeEventListener('load', this, false);


		if ('BrowserCustomizeToolbar' in window) {
			eval('window.BrowserCustomizeToolbar = '+
				window.BrowserCustomizeToolbar.toSource().replace(
					'{',
					'{ BFThumbnailService.destroyButtons(); '
				)
			);
		}

		var toolbox = document.getElementById('navigator-toolbox');
		if (toolbox.customizeDone) {
			toolbox.__bfthumbnail__customizeDone = toolbox.customizeDone;
			toolbox.customizeDone = function(aChanged) {
				this.__bfthumbnail__customizeDone(aChanged);
				BFThumbnailService.initButtons();
			};
		}
		if ('BrowserToolboxCustomizeDone' in window) {
			window.__bfthumbnail__BrowserToolboxCustomizeDone = window.BrowserToolboxCustomizeDone;
			window.BrowserToolboxCustomizeDone = function(aChanged) {
				window.__bfthumbnail__BrowserToolboxCustomizeDone.apply(window, arguments);
				BFThumbnailService.initButtons();
			};
		}

		this.initTabBrowser(gBrowser);
		this.initButtons();

		this.initialized = true;
	},
	 
	initTabBrowser : function(aTabBrowser) 
	{
		aTabBrowser.addEventListener('TabOpen',  this, false);
		aTabBrowser.addEventListener('TabClose', this, false);
		var tabs = aTabBrowser.mTabContainer.childNodes;
		for (var i = 0, maxi = tabs.length; i < maxi; i++)
		{
			this.initTab(tabs[i], aTabBrowser);
		}
		delete i;
		delete maxi;
		delete tabs;
	},
 
	initTab : function(aTab, aTabBrowser) 
	{
		if (aTab.__thumbnailsaver__progressListener) return;

		aTab.__thumbnailsaver__parentTabBrowser = aTabBrowser;

		var filter = Components.classes['@mozilla.org/appshell/component/browser-status-filter;1'].createInstance(Components.interfaces.nsIWebProgress);
		var listener = new BFThumbnailProgressListener(aTab, aTabBrowser);
		filter.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.linkedBrowser.webProgress.addProgressListener(filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.__thumbnailsaver__progressListener = listener;
		aTab.__thumbnailsaver__progressFilter   = filter;
	},
 
	initButtons : function() 
	{
		this.initButton('back-button');
		this.initButton('forward-button');

		this.initButton('rewind-button');
		this.initButton('rewind-prev-button');
		this.initButton('fastforward-button');
		this.initButton('fastforward-next-button');
	},
	initButton : function(aButton)
	{
		if (!aButton || 
			!(aButton = document.getElementById(aButton)))
			return;

		if (!aButton.__beforeafterthumbnail__thumbnail) {
			aButton.addEventListener('mouseover', this, false);
			aButton.addEventListener('mouseout', this, false);
			aButton.__beforeafterthumbnail__thumbnail = true;
		}
	},
  
	destroy : function() 
	{
		this.destroyTabBrowser(gBrowser);
		this.destroyButtons();

		window.removeEventListener('unload', this, false);

		this.removePrefListener(this);
	},
	
	destroyTabBrowser : function(aTabBrowser) 
	{
		aTabBrowser.removeEventListener('TabOpen',  this, false);
		aTabBrowser.removeEventListener('TabClose', this, false);
		var tabs = aTabBrowser.mTabContainer.childNodes;
		for (var i = 0, maxi = tabs.length; i < maxi; i++)
		{
			this.destroyTab(tabs[i]);
		}
	},
 
	destroyTab : function(aTab) 
	{
		try {
			aTab.linkedBrowser.webProgress.removeProgressListener(aTab.__thumbnailsaver__progressFilter);
			aTab.__thumbnailsaver__progressFilter.removeProgressListener(aTab.__thumbnailsaver__progressListener);

			delete aTab.__thumbnailsaver__progressListener.mLabel;
			delete aTab.__thumbnailsaver__progressListener.mTab;
			delete aTab.__thumbnailsaver__progressListener.mTabBrowser;

			delete aTab.__thumbnailsaver__progressFilter;
			delete aTab.__thumbnailsaver__progressListener;
		}
		catch(e) {
			dump(e+'\n');
		}
	},
 
	destroyButtons : function() 
	{
		this.destroyButtons('back-button');
		this.destroyButtons('forward-button');

		this.destroyButtons('rewind-button');
		this.destroyButtons('rewind-prev-button');
		this.destroyButtons('fastforward-button');
		this.destroyButtons('fastforward-next-button');
	},
	destroyButtons : function(aButton)
	{
		if (!aButton || 
			!(aButton = document.getElementById(aButton)))
			return;

		if (aButton.hasAttribute(this.kTOOLTIPTEXT)) {
			aButton.setAttribute('tooltiptext', aButton.getAttribute(this.kTOOLTIPTEXT));
			aButton.removeAttribute(this.kTOOLTIPTEXT);
		}

		if (aButton.__beforeafterthumbnail__thumbnail) {
			aButton.removeEventListener('mouseover', this, false);
			aButton.removeEventListener('mouseout', this, false);
			aButton.__beforeafterthumbnail__thumbnail = false;
		}
	},
   
/* thumbnail */ 
	 
	createThumbnail : function(aTab, aTabBrowser, aThis, aImage) 
	{
		if (!aThis) aThis = this;

		var canvas = aThis.canvas;

		var b   = aTab.linkedBrowser;
		var win = b.contentWindow;
		var w   = win.innerWidth;
		var h   = win.innerHeight;
		var aspectRatio = 1 / 0.75;

		var size = aThis.getPref('extensions.bfthumbnail.size');
		var canvasW = Math.floor((aspectRatio < 1) ? (size * aspectRatio) : size );
		var canvasH = Math.floor((aspectRatio > 1) ? (size / aspectRatio) : size );

		var isImage = b.contentDocument.contentType.indexOf('image') == 0;

		canvas.width  = canvasW;
		canvas.height = canvasH;
		canvas.style.width  = canvasW+'px';
		canvas.style.height = canvasH+'px';
		canvas.style.display = 'block';

		var rendered = false;

		try {
			var ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvasW, canvasH);
			if (!isImage) {
				ctx.save();
				if (h * canvasW/w < canvasH)
					ctx.scale(canvasH/h, canvasH/h);
				else
					ctx.scale(canvasW/w, canvasW/w);
				ctx.drawWindow(win, 0/*win.scrollX*/, 0/*win.scrollY*/, w, h, aThis.thumbnailBG);
				ctx.restore();
				rendered = true;
			}
			else {
				if (aImage && aImage instanceof Image) {
					ctx.fillStyle = aThis.thumbnailBG;
					ctx.fillRect(0, 0, canvasW, canvasH);
					var iW = parseInt(aImage.width);
					var iH = parseInt(aImage.height);
					var x = 0;
					var y = 0;
					ctx.save();
					if ((iW / iH) < 1) {
						iW = iW * canvasH / iH;
						x = Math.floor((canvasW - iW) / 2 );
						iH = canvasH;
					}
					else {
						iH = iH * canvasW / iW;
						y = Math.floor((canvasH - iH) / 2 );
						iW = canvasW;
					}
					ctx.drawImage(aImage, x, y, iW, iH);
					ctx.restore();
					rendered = true;
				}
				else {
					var img = new Image();
					img.src = b.currentURI.spec;
					var self = arguments.callee;
					img.addEventListener('load', function() {
						img.removeEventListener('load', arguments.callee, false);
						self(aTab, aTabBrowser, aThis, img);
						delete self;
						delete img;
						delete canvas;
						delete ctx;
						delete b;
						delete win;
					}, false);
					return;
				}
			}
		}
		catch(e) {
		}

		if (rendered) {
			aThis.saveThumbnail((aImage ? aImage.src : win.location.href ), canvas.toDataURL());
		}
	},
 	
	fillInTooltip : function(aTarget) 
	{
		if (!aTarget || aTarget.getAttribute('disabled') == 'true')
			return false;

		this.tooltipLabel.value = aTarget.getAttribute(this.kTOOLTIPTEXT);
		this.tooltipTitle.value = this.tooltipThumbnail.src = this.tooltipURI.value = '';

		var mode     = aTarget.getAttribute('rewindforward-override') || aTarget.getAttribute('mode');
		var prevLink = aTarget.getAttribute('rewindforward-prev') == 'true';
		var nextLink = aTarget.getAttribute('rewindforward-next') == 'true';

		switch (aTarget.id)
		{
			case 'back-button':
			case 'forward-button':
				if (mode != 'navigation' && !prevLink && !nextLink) {
					var history = this.browser.sessionHistory;
					if (!history) return false;
					this.updateTooltipForHistoryEntry(history.getEntryAtIndex(
						aTarget.id == 'back-button' ? history.index - 1 : history.index + 1,
						false
					));
					return true;
				}

			case 'rewind-button':
			case 'fastforward-button':
				if (mode == 'navigation' && !prevLink && !nextLink) {
					var history = this.browser.sessionHistory;
					if (!history) return false;

					var current = history.getEntryAtIndex(history.index, false);
					var c_host  = current.URI && /\w+:\/\/([^\/:]+)(\/|$)/.test(current.URI.spec) ? RegExp.$1 : null ;

					var check = (aTarget.id == 'rewind-button') ? function(aIndex) { return aIndex > -1 } : function(aIndex) { return aIndex < history.count }
					var step  = (aTarget.id == 'rewind-button') ? -1 : 1 ;
					var start = (aTarget.id == 'rewind-button') ? history.index-1 : history.index+1 ;

					var entry,
						t_host;
					for (var i = start; check(i); i += step)
					{
						entry  = history.getEntryAtIndex(i, false);
						t_host = entry.URI && /\w+:\/\/([^\/:]+)(\/|$)/.test(entry.URI.spec) ? RegExp.$1 : null ;
						if ((c_host && !t_host) || (!c_host && t_host) || (c_host != t_host)) {
							if (this.getPref('rewindforward.goToEndPointOfCurrentDomain')) {
								if (i == start) {
									c_host = t_host;
									continue;
								}
								i -= step;
							}
							this.updateTooltipForHistoryEntry(entry);
							return true;
						}
					}
					this.updateTooltipForHistoryEntry(entry);
					return true;
				}

			case 'rewind-prev-button':
			case 'fastforward-next-button':
				var link = rewindforwardGetLinksFromAllFrames((prevLink || /rewind/.test(aTarget.id)) ? 'prev' : 'next' );
				if (!link || !link.length) return true;
				link = rewindforwardGetLinkInMainFrame(link);
				this.tooltipTitle.value = link.label || '';
				this.tooltipURI.value = link.href;
				this.tooltipThumbnail.src = this.loadThumbnail(link.href);
				return true;

			default:
				return false;
		}

		return true;
	},
	updateTooltipForHistoryEntry : function(aEntry)
	{
		aEntry = aEntry.QueryInterface(Components.interfaces.nsIHistoryEntry);
		this.tooltipTitle.value = aEntry.title;
		this.tooltipURI.value = aEntry.URI.spec;
		this.tooltipThumbnail.src = this.loadThumbnail(aEntry.URI.spec);
	},
 
	show : function(aNode) 
	{
		document.tooltipNode = aNode;
		this.tooltip.showPopup(aNode, -1, -1, 'tooltip', 'bottomleft', 'topleft');
		this.delayedHide(aNode, this.getPref('extensions.bfthumbnail.autoHideDelay'));
	},
 
	hide : function(aNode) 
	{
		this.tooltip.hidePopup();
	},
	delayedHide : function(aNode, aDelay)
	{
		this.cancelDelayedHide();
		this.delayedHideTimer = window.setTimeout(function(aSelf, aTarget) {
			aSelf.hide(aTarget);
		}, aDelay || 0, this, aNode);
	},
	cancelDelayedHide : function()
	{
		if (this.delayedHideTimer) {
			window.clearTimeout(this.delayedHideTimer);
			this.delayedHideTimer = null;
		}
	},
  
/* Database */ 
	 
	get thumbnails() 
	{
		if (!this._thumbnails) {
			const DirectoryService = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties);
			var file = DirectoryService.get('ProfD', Components.interfaces.nsIFile);
			file.append(this.kDATABASE);

			var storageService = Components.classes['@mozilla.org/storage/service;1'].getService(Components.interfaces.mozIStorageService);
			this._thumbnails = storageService.openDatabase(file);

			if(!this._thumbnails.tableExists(this.kTABLE)){
				this._thumbnails.createTable(this.kTABLE,
					this.kKEY+' TEXT PRIMARY KEY, '+this.kTHUMBNAIL+' TEXT, '+this.kDATE);
			}
		}
		return this._thumbnails;
	},
	_thumbnails : null,
 
	saveThumbnail : function(aURI, aThumbnailURI) 
	{
		var statement = this.thumbnails.createStatement('INSERT OR REPLACE INTO '+this.kTABLE+' VALUES(?1, ?2, ?3)');
		statement.bindStringParameter(0, aURI);
		statement.bindStringParameter(1, aThumbnailURI);
		statement.bindDoubleParameter(2, Date.now());
		try {
			statement.executeStep();
		}
		catch(e) {
			dump('saveThumbnail\n'+e+'\n');
		}
		this.updateDB();
	},
 
	loadThumbnail : function(aURI) 
	{
		var statement = this.thumbnails.createStatement('SELECT * FROM '+this.kTABLE+' WHERE '+this.kKEY+' = ?1');
		statement.bindStringParameter(0, aURI);
		statement.executeStep();
		try {
			return statement.getString(1);
		}
		catch(e) { // there is no thumbnail for the page
			return '';
		}
	},
 
	updateDB : function()
	{
		var statement = this.thumbnails.createStatement('DELETE FROM '+this.kTABLE+' WHERE '+this.kDATE+' < ?1');
		var days = this.getPref('extensions.bfthumbnail.expire.days');
		if (days < 0) return;

		statement.bindDoubleParameter(0, Date.now() - (1000 * 60 * 60 * 24 * days));
		try {
			statement.executeStep();
		}
		catch(e) {
			dump('updateDB\n'+e+'\n');
		}
	},
  
/* Event Handling */ 
	 
	handleEvent : function(aEvent) 
	{
		switch (aEvent.type)
		{
			case 'load':
				this.init();
				break;

			case 'unload':
				this.destroy();
				break;

			case 'TabOpen':
				this.initTab(aEvent.originalTarget, aEvent.currentTarget);
				break;

			case 'TabClose':
				this.destroyTab(aEvent.originalTarget, aEvent.currentTarget);
				break;

			case 'mouseover':
				if (aEvent.target.hasAttribute('tooltiptext')) {
					aEvent.target.setAttribute(this.kTOOLTIPTEXT, aEvent.target.getAttribute('tooltiptext'));
					aEvent.target.removeAttribute('tooltiptext');
				}
				if (aEvent.target.getAttribute('disabled') == 'true') return;
				this.cancelDelayedHide();
				this.show(aEvent.target);
				break;

			case 'mouseout':
				if (aEvent.target.getAttribute('disabled') == 'true') return;
				this.delayedHide(aEvent.target);
				break;
		}
	},
  
/* Save/Load Prefs */ 
	 
	get Prefs() 
	{
		if (!this._Prefs) {
			this._Prefs = Components.classes['@mozilla.org/preferences;1'].getService(Components.interfaces.nsIPrefBranch);
		}
		return this._Prefs;
	},
	_Prefs : null,
 
	getPref : function(aPrefstring) 
	{
		try {
			switch (this.Prefs.getPrefType(aPrefstring))
			{
				case this.Prefs.PREF_STRING:
					return decodeURIComponent(escape(this.Prefs.getCharPref(aPrefstring)));
					break;
				case this.Prefs.PREF_INT:
					return this.Prefs.getIntPref(aPrefstring);
					break;
				default:
					return this.Prefs.getBoolPref(aPrefstring);
					break;
			}
		}
		catch(e) {
		}

		return null;
	},
 
	setPref : function(aPrefstring, aNewValue) 
	{
		var pref = this.Prefs ;
		var type;
		try {
			type = typeof aNewValue;
		}
		catch(e) {
			type = null;
		}

		switch (type)
		{
			case 'string':
				pref.setCharPref(aPrefstring, unescape(encodeURIComponent(aNewValue)));
				break;
			case 'number':
				pref.setIntPref(aPrefstring, parseInt(aNewValue));
				break;
			default:
				pref.setBoolPref(aPrefstring, aNewValue);
				break;
		}
		return true;
	},
 
	clearPref : function(aPrefstring) 
	{
		try {
			this.Prefs.clearUserPref(aPrefstring);
		}
		catch(e) {
		}

		return;
	},
 
	addPrefListener : function(aObserver) 
	{
		var domains = ('domains' in aObserver) ? aObserver.domains : [aObserver.domain] ;
		try {
			var pbi = this.Prefs.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
			for (var i = 0; i < domains.length; i++)
				pbi.addObserver(domains[i], aObserver, false);
		}
		catch(e) {
		}
	},
 
	removePrefListener : function(aObserver) 
	{
		var domains = ('domains' in aObserver) ? aObserver.domains : [aObserver.domain] ;
		try {
			var pbi = this.Prefs.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
			for (var i = 0; i < domains.length; i++)
				pbi.removeObserver(domains[i], aObserver, false);
		}
		catch(e) {
		}
	}
   
}; 

window.addEventListener('load', BFThumbnailService, false);
window.addEventListener('unload', BFThumbnailService, false);
 
function BFThumbnailProgressListener(aTab, aTabBrowser) 
{
	this.mTab = aTab;
	this.mTabBrowser = aTabBrowser;
}
BFThumbnailProgressListener.prototype = {
	mTab        : null,
	mTabBrowser : null,
	onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
	},
	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus)
	{
		const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
		if (
			aStateFlags & nsIWebProgressListener.STATE_STOP &&
			aStateFlags & nsIWebProgressListener.STATE_IS_NETWORK
			) {
			BFThumbnailService.createThumbnail(this.mTab, this.mTabBrowser);
			if (BFThumbnailService.shown &&
				this.mTabBrowser == gBrowser &&
				this.mTab.getAttribute('selected') == 'true') {
				var target = document.tooltipNode;
				BFThumbnailService.hide(target);
				if (target && target.getAttribute('disabled') != 'true')
					BFThumbnailService.show(target);
			}
		}
	},
	onLocationChange : function(aWebProgress, aRequest, aLocation)
	{
	},
	onStatusChange : function(aWebProgress, aRequest, aStatus, aMessage)
	{
	},
	onSecurityChange : function(aWebProgress, aRequest, aState)
	{
	},
	QueryInterface : function(aIID)
	{
		if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
			aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
			aIID.equals(Components.interfaces.nsISupports))
			return this;
		throw Components.results.NS_NOINTERFACE;
	}
};
 
