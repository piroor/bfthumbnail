var BFThumbnailService = { 

	kTHUMBNAILS_DIR : 'thumbnails',
	kTOOLTIPTEXT    : 'bfthumbnail-tooltiptext-backup',

	thumbnailBG : 'rgb(192,192,192)',

	kDATABASE  : 'bfthumbnail.sqlite',
	kTABLE     : 'thumbnails',

	kKEY       : 'key',
	kTHUMBNAIL : 'thumbnail',
	kDATE      : 'last_updated_on',

	kKEY_INDEX       : 0,
	kTHUMBNAIL_INDEX : 1,
	kDATE_INDEX      : 2,

	shown : false,

	size : 100,
	expireDays : 10,
	autoHideDelay : 5000,
	 
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
	get tooltipContents()
	{
		return document.getElementById('bfthumbnail-tooltip-contents');
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
 
	lastTarget : null, 
  
/* utilities */ 
	 
	NSResolver : { 
		lookupNamespaceURI : function(aPrefix)
		{
			switch (aPrefix)
			{
				case 'xul':
					return 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
				case 'html':
				case 'xhtml':
					return 'http://www.w3.org/1999/xhtml';
				case 'xlink':
					return 'http://www.w3.org/1999/xlink';
				default:
					return '';
			}
		}
	},
 
	evaluateXPath : function(aExpression, aContext, aType) 
	{
		if (!aType) aType = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
		try {
			var xpathResult = (aContext.ownerDocument || aContext || document).evaluate(
					aExpression,
					aContext || document,
					this.NSResolver,
					aType,
					null
				);
		}
		catch(e) {
			return {
				singleNodeValue : null,
				snapshotLength  : 0,
				snapshotItem    : function() {
					return null
				}
			};
		}
		return xpathResult;
	},
 
	getButtonFromEvent : function(aEvent) 
	{
		return this.evaluateXPath(
				'ancestor-or-self::xul:toolbarbutton[@tooltiptext or @'+this.kTOOLTIPTEXT+']',
				aEvent.originalTarget || aEvent.target,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
	},
 
	getTabBrowserFromChild : function(aNode) 
	{
		return this.evaluateXPath(
				'ancestor-or-self::xul:tabbrowser',
				aNode,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
	},
 
	getTabs : function(aTabBrowser) 
	{
		return this.evaluateXPath(
				'descendant::xul:tab',
				aTabBrowser.mTabContainer
			);
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

		var toolbox = document.getElementById('browser-toolbox') || // Firefox 3
					document.getElementById('navigator-toolbox'); // Firefox 2
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

		this.addPrefListener(this);
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.show.title');
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.show.thumbnail');
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.show.uri');
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.size');
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.expire.days');
		this.observe(null, 'nsPref:changed', 'extensions.bfthumbnail.autoHideDelay');

		this.initialized = true;
	},
	
	initTabBrowser : function(aTabBrowser) 
	{
		aTabBrowser.addEventListener('TabOpen',  this, false);
		aTabBrowser.addEventListener('TabClose', this, false);
		var tabs = this.getTabs(aTabBrowser);
		for (var i = 0, maxi = tabs.snapshotLength; i < maxi; i++)
		{
			this.initTab(tabs.snapshotItem(i), aTabBrowser);
		}
		delete i;
		delete maxi;
		delete tabs;

		if ('swapBrowsersAndCloseOther' in aTabBrowser) {
			eval('aTabBrowser.swapBrowsersAndCloseOther = '+aTabBrowser.swapBrowsersAndCloseOther.toSource().replace(
				'{',
				'{ BFThumbnailService.destroyTab(aOurTab);'
			).replace(
				/(if \((?:tabCount == 1|aOurTab == this.selectedTab)\))/,
				'BFThumbnailService.initTab(aOurTab); $1'
			));
		}
	},
 
	initTab : function(aTab, aTabBrowser) 
	{
		if (aTab.__thumbnailsaver__progressListener) return;

		if (!aTabBrowser) aTabBrowser = this.getTabBrowserFromChild(aTab);
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
		this.lastTarget = null;

		var backButton = this.evaluateXPath(
				'/descendant::xul:toolbaritem[@id="unified-back-forward-button"]/xul:toolbarbutton[@id="back-button"] | ' +
				'/descendant::xul:toolbar/xul:toolbarbutton[@id="back-button"]',
				document,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
		var forwardButton = this.evaluateXPath(
				'/descendant::xul:toolbaritem[@id="unified-back-forward-button"]/xul:toolbarbutton[@id="forward-button"] | ' +
				'/descendant::xul:toolbar/xul:toolbarbutton[@id="forward-button"]',
				document,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;

		if (backButton.getAttribute('unified') == 'full') {
			forwardButton = document.getAnonymousElementByAttribute(backButton, 'id', 'forward-button');
			backButton = document.getAnonymousElementByAttribute(backButton, 'id', 'back-button');
		}
		else if (forwardButton.getAttribute('unified') == 'full') {
			backButton = document.getAnonymousElementByAttribute(forwardButton, 'id', 'back-button');
			forwardButton = document.getAnonymousElementByAttribute(forwardButton, 'id', 'forward-button');
		}

		this.initButton(backButton);
		this.initButton(forwardButton);

		this.initButton('rewind-button');
		this.initButton('rewind-prev-button');
		this.initButton('fastforward-button');
		this.initButton('fastforward-next-button');
	},
	
	initButton : function(aButton) 
	{
		if (!aButton)
			return;

		if (typeof aButton == 'string' &&
			!(aButton = document.getElementById(aButton)))
			return;

		if (!aButton.__bfthumbnail__thumbnail) {
			aButton.addEventListener('mouseover', this, false);
			aButton.addEventListener('mouseout', this, false);
			aButton.__bfthumbnail__thumbnail = true;
		}
	},
   	
	destroy : function() 
	{
		this.destroyTabBrowser(gBrowser);
		this.destroyButtons();

		window.removeEventListener('unload', this, false);

		this.removePrefListener(this);

		for (var i in this._statements)
		{
			if ('finalize' in this._statements[i])
				this._statements[i].finalize();
		}
	},
	
	destroyTabBrowser : function(aTabBrowser) 
	{
		aTabBrowser.removeEventListener('TabOpen',  this, false);
		aTabBrowser.removeEventListener('TabClose', this, false);
		var tabs = this.getTabs(aTabBrowser);
		for (var i = 0, maxi = tabs.snapshotLength; i < maxi; i++)
		{
			this.destroyTab(tabs.snapshotItem(i));
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
		this.lastTarget = null;

		var backButton = this.evaluateXPath(
				'/descendant::xul:toolbaritem[@id="unified-back-forward-button"]/xul:toolbarbutton[@id="back-button"] | ' +
				'/descendant::xul:toolbar/xul:toolbarbutton[@id="back-button"]',
				document,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
		var forwardButton = this.evaluateXPath(
				'/descendant::xul:toolbaritem[@id="unified-back-forward-button"]/xul:toolbarbutton[@id="forward-button"] | ' +
				'/descendant::xul:toolbar/xul:toolbarbutton[@id="forward-button"]',
				document,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;

		if (backButton.getAttribute('unified') == 'full') {
			backButton = document.getAnonymousElementByAttribute(backButton, 'id', 'back-button');
			forwardButton = document.getAnonymousElementByAttribute(backButton, 'id', 'forward-button');
		}
		else if (forwardButton.getAttribute('unified') == 'full') {
			backButton = document.getAnonymousElementByAttribute(forwardButton, 'id', 'back-button');
			forwardButton = document.getAnonymousElementByAttribute(forwardButton, 'id', 'forward-button');
		}

		this.destroyButton(backButton);
		this.destroyButton(forwardButton);

		this.destroyButton('rewind-button');
		this.destroyButton('rewind-prev-button');
		this.destroyButton('fastforward-button');
		this.destroyButton('fastforward-next-button');
	},
	 
	destroyButton : function(aButton) 
	{
		if (!aButton)
			return;

		if (typeof aButton == 'string' &&
			!(aButton = document.getElementById(aButton)))
			return;

		if (aButton.hasAttribute(this.kTOOLTIPTEXT)) {
			aButton.setAttribute('tooltiptext', aButton.getAttribute(this.kTOOLTIPTEXT));
			aButton.removeAttribute(this.kTOOLTIPTEXT);
		}

		if (aButton.__bfthumbnail__thumbnail) {
			aButton.removeEventListener('mouseover', this, false);
			aButton.removeEventListener('mouseout', this, false);
			aButton.__bfthumbnail__thumbnail = false;
		}
	},
    
/* thumbnail */ 
	 
	createThumbnail : function(aTab, aTabBrowser, aThis) 
	{
		if (!aThis) aThis = this;

		var canvas = aThis.canvas;

		var b   = aTab.linkedBrowser;
		var win = b.contentWindow;
		var w   = win.innerWidth;
		var h   = win.innerHeight;
		var aspectRatio = 1 / 0.75;

		var canvasW = Math.floor((aspectRatio < 1) ? (aThis.size * aspectRatio) : aThis.size );
		var canvasH = Math.floor((aspectRatio > 1) ? (aThis.size / aspectRatio) : aThis.size );

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
			ctx.save();
			if (!isImage) {
				if (h * canvasW/w < canvasH)
					ctx.scale(canvasH/h, canvasH/h);
				else
					ctx.scale(canvasW/w, canvasW/w);
				ctx.drawWindow(win, 0/*win.scrollX*/, 0/*win.scrollY*/, w, h, aThis.thumbnailBG);
			}
			else {
				var image = b.contentDocument.getElementsByTagName('img')[0];
				ctx.fillStyle = aThis.thumbnailBG;
				ctx.fillRect(0, 0, canvasW, canvasH);
				var iW = parseInt(image.width);
				var iH = parseInt(image.height);
				var x = 0;
				var y = 0;
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
				ctx.drawImage(image, x, y, iW, iH);
			}
			ctx.restore();
		}
		catch(e) {
		}

		aThis.saveThumbnail((aImage ? aImage.src : win.location.href ), canvas.toDataURL());
	},
 
	fillInTooltip : function() 
	{
		var target = this.lastTarget;
		if (!target || target.getAttribute('disabled') == 'true')
			return false;

		this.tooltipLabel.value = target.getAttribute(this.kTOOLTIPTEXT);
		this.tooltipTitle.value = this.tooltipThumbnail.src = this.tooltipURI.value = '';

		var mode     = target.getAttribute('rewindforward-override') || target.getAttribute('mode');
		var prevLink = target.getAttribute('rewindforward-prev') == 'true';
		var nextLink = target.getAttribute('rewindforward-next') == 'true';

		switch (target.id)
		{
			case 'back-button':
			case 'forward-button':
				if (mode != 'navigation' && !prevLink && !nextLink) {
					var history = this.browser.sessionHistory;
					if (!history) return false;
					this.updateTooltipForHistoryEntry(history.getEntryAtIndex(
						target.id == 'back-button' ? history.index - 1 : history.index + 1,
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

					var check = (target.id == 'rewind-button') ? function(aIndex) { return aIndex > -1 } : function(aIndex) { return aIndex < history.count }
					var step  = (target.id == 'rewind-button') ? -1 : 1 ;
					var start = (target.id == 'rewind-button') ? history.index-1 : history.index+1 ;

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
				var link = rewindforwardGetLinksFromAllFrames((prevLink || /rewind/.test(target.id)) ? 'prev' : 'next' );
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
		if (!aEntry) return;
		aEntry = aEntry.QueryInterface(Components.interfaces.nsIHistoryEntry);
		this.tooltipTitle.value = aEntry.title;
		this.tooltipURI.value = aEntry.URI.spec;
		this.tooltipThumbnail.src = this.loadThumbnail(aEntry.URI.spec);
	},
 
	show : function(aNode) 
	{
		if (this.lastTarget != aNode)
			this.hide(this.lastTarget);

		if (!aNode) return;

		this.cancelDelayedHide();
		if (aNode.getAttribute('disabled') == 'true') return;

		document.tooltipNode = this.lastTarget = aNode;

		if ('openPopup' in this.tooltip) // Firefox 3
			this.tooltip.openPopup(aNode, 'after_start', 0, 0, false, true);
		else
			this.tooltip.showPopup(aNode, -1, -1, 'tooltip', 'bottomleft', 'topleft');

		this.delayedHide(aNode, this.autoHideDelay);
	},
 
	hide : function(aNode) 
	{
		this.cancelDelayedHide();
		this.tooltip.hidePopup();
		this.lastTarget = null;
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
					this.kKEY+' TEXT PRIMARY KEY, '+this.kTHUMBNAIL+' TEXT, '+this.kDATE+' DATETIME');
			}
		}
		return this._thumbnails;
	},
	_thumbnails : null,
 
	_getStatement : function(aName, aSQL) 
	{
		if (!(aName in this._statements)) {
			this._statements[aName] = this.thumbnails.createStatement(aSQL);
		}
		return this._statements[aName];
	},
	_statements : {},
 
	saveThumbnail : function(aURI, aThumbnailURI) 
	{
		var statement = this._getStatement(
				'saveThumbnailStatement',
				'INSERT OR REPLACE INTO '+this.kTABLE+' VALUES(?1, ?2, ?3)'
			);
		statement.bindStringParameter(this.kKEY_INDEX, aURI);
		statement.bindStringParameter(this.kTHUMBNAIL_INDEX, aThumbnailURI);
		statement.bindDoubleParameter(this.kDATE_INDEX, Date.now());
		try {
			statement.executeStep();
		}
		catch(e) {
			dump('saveThumbnail\n'+e+'\n');
		}
		statement.reset();
		this.updateDB();
	},
 
	loadThumbnail : function(aURI) 
	{
		var statement = this._getStatement(
				'loadThumbnailStatement',
				'SELECT * FROM '+this.kTABLE+' WHERE '+this.kKEY+' = ?1'
			);
		statement.bindStringParameter(0, aURI);
		statement.executeStep();
		var thumbnail;
		try {
			thumbnail = statement.getString(this.kTHUMBNAIL_INDEX);
		}
		catch(e) { // there is no thumbnail for the page
			thumbnail = '';
		}
		statement.reset();
		return thumbnail;
	},
 
	updateDB : function() 
	{
		if (this.expireDays < 0) return;

		var statement = this._getStatement(
				'updateDBStatement',
				'DELETE FROM '+this.kTABLE+' WHERE '+this.kDATE+' < ?1'
			);
		statement.bindDoubleParameter(0, Date.now() - (1000 * 60 * 60 * 24 * this.expireDays));
		try {
			while (statement.executeStep()) {}
		}
		catch(e) {
			dump('updateDB\n'+e+'\n');
		}
		statement.reset();
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
				var button = this.getButtonFromEvent(aEvent);
				if (!button) return;
				if (button.hasAttribute('tooltiptext')) {
					button.setAttribute(this.kTOOLTIPTEXT, button.getAttribute('tooltiptext'));
					button.removeAttribute('tooltiptext');
				}
				if (button.getAttribute('disabled') == 'true') return;
				this.show(button);
				break;

			case 'mouseout':
				var button = this.getButtonFromEvent(aEvent);
				if (button.getAttribute('disabled') == 'true') return;
				this.delayedHide(button);
				break;
		}
	},
 
	domain  : 'extensions.bfthumbnail', 
	observe : function(aSubject, aTopic, aPrefName)
	{
		switch (aTopic)
		{
			case 'nsPref:changed':
				var value = this.getPref(aPrefName);
				switch (aPrefName)
				{
					case 'extensions.bfthumbnail.show.title':
						if (value)
							this.tooltipContents.setAttribute('show-title', true);
						else
							this.tooltipContents.removeAttribute('show-title');
						break;

					case 'extensions.bfthumbnail.show.thumbnail':
						if (value)
							this.tooltipContents.setAttribute('show-thumbnail', true);
						else
							this.tooltipContents.removeAttribute('show-thumbnail');
						break;

					case 'extensions.bfthumbnail.show.uri':
						if (value)
							this.tooltipContents.setAttribute('show-uri', true);
						else
							this.tooltipContents.removeAttribute('show-uri');
						break;

					case 'extensions.bfthumbnail.size':
						this.size = value;
						break;

					case 'extensions.bfthumbnail.expire.days':
						this.expireDays = value;
						break;

					case 'extensions.bfthumbnail.autoHideDelay':
						this.autoHideDelay = value;
						break;

					default:
						break;
				}
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
				var target = BFThumbnailService.lastTarget;
				BFThumbnailService.hide(target);
				if (target && target.getAttribute('disabled') != 'true') {
					BFThumbnailService.show(target);
				}
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
 
