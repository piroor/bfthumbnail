var BackForwardThumbnailService = { 

	kTHUMBNAILS_DIR : 'thumbnails',
	kTOOLTIPTEXT    : 'backforwardthumbnail-tooltiptext-backup',

	thumbnailBG : 'rgb(128,128,128)',
	 
/* references */ 
	 
	get canvas() 
	{
		return document.getElementById('thumbnail-saver-canvas');
	},
 
	get browser() 
	{
		return gBrowser;
	},
 
	get backButton() 
	{
		return document.getElementById('back-button');
	},
	get rewindButton()
	{
		return document.getElementById('rewind-button');
	},
 
	get forwardButton() 
	{
		return document.getElementById('forward-button');
	},
	get fastforwardButton()
	{
		return document.getElementById('fastforward-button');
	},
 
	get tooltip() 
	{
		return document.getElementById('backforwardthumbnail-tooltip');
	},
	get tooltipLabel()
	{
		return document.getElementById('backforwardthumbnail-tooltip-label');
	},
	get tooltipThumbnail()
	{
		return document.getElementById('backforwardthumbnail-tooltip-thumbnail');
	},
	get tooltipTitle()
	{
		return document.getElementById('backforwardthumbnail-tooltip-title');
	},
	get tooltipURI()
	{
		return document.getElementById('backforwardthumbnail-tooltip-uri');
	},
 
	get thumbnailsDir() 
	{
		if (!this._thumbnailsDir) {
			const DirectoryService = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties);
			this._thumbnailsDir = DirectoryService.get('ProfD', Components.interfaces.nsIFile);
			this._thumbnailsDir.append(this.kTHUMBNAILS_DIR);
		}
		if (!this._thumbnailsDir.exists())
			this._thumbnailsDir.create(this._thumbnailsDir.DIRECTORY_TYPE, 0755);
		return this._thumbnailsDir;
	},
	_thumbnailsDir : null,
 
	get IOService() 
	{
		if (!this._IOService) {
			this._IOService = IOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
		}
		return this._IOService;
	},
	_IOService : null,
  
/* Utilities */ 
	
	getHashFromString : function(aString) 
	{
		var hasher = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
		hasher.init(hasher.MD5)

		var array = aString.split('').map(function(aChar) {
						return aChar.charCodeAt(0);
					});
		hasher.update(array, array.length);
		var hash = hasher.finish(false);

		var hexchars = '0123456789ABCDEF';
		var hexrep = new Array(hash.length * 2);
		hash.split('').forEach(function(aChar, aIndex) {
			hexrep[aIndex * 2] = hexchars.charAt((aChar.charCodeAt(0) >> 4) & 15);
			hexrep[aIndex * 2 + 1] = hexchars.charAt(aChar.charCodeAt(0) & 15);
		});
		return hexrep.join('');
	},
 
	getThumbnailForURI : function(aURI) 
	{
		var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(this.thumbnailsDir.path);
		file.append(this.getHashFromString(aURI));
		return file;
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
					'{ BackForwardThumbnailService.destroyButtons(); '
				)
			);
		}

		var toolbox = document.getElementById('navigator-toolbox');
		if (toolbox.customizeDone) {
			toolbox.__backforwardthumbnail__customizeDone = toolbox.customizeDone;
			toolbox.customizeDone = function(aChanged) {
				this.__backforwardthumbnail__customizeDone(aChanged);
				BackForwardThumbnailService.initButtons();
			};
		}
		if ('BrowserToolboxCustomizeDone' in window) {
			window.__backforwardthumbnail__BrowserToolboxCustomizeDone = window.BrowserToolboxCustomizeDone;
			window.BrowserToolboxCustomizeDone = function(aChanged) {
				window.__backforwardthumbnail__BrowserToolboxCustomizeDone.apply(window, arguments);
				BackForwardThumbnailService.initButtons();
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
		var listener = new BackForwardThumbnailProgressListener(aTab, aTabBrowser);
		filter.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.linkedBrowser.webProgress.addProgressListener(filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.__thumbnailsaver__progressListener = listener;
		aTab.__thumbnailsaver__progressFilter   = filter;
	},
 
	initButtons : function() 
	{
		this.initButton(this.backButton);
		this.initButton(this.forwardButton);

		this.initButton(this.rewindButton);
		this.initButton(this.fastforwardButton);
	},
	initButton : function(aButton)
	{
		if (!aButton) return;

		if (!aButton.hasAttribute(this.kTOOLTIPTEXT)) {
			aButton.setAttribute(this.kTOOLTIPTEXT, aButton.getAttribute('tooltiptext'));
			aButton.removeAttribute('tooltiptext');
		}

		aButton.addEventListener('mouseover', this, false);
		aButton.addEventListener('mouseout', this, false);
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
		this.destroyButtons(this.backButton);
		this.destroyButtons(this.forwardButton);

		this.destroyButtons(this.rewindButton);
		this.destroyButtons(this.fastforwardButton);
	},
	destroyButtons : function(aButton)
	{
		if (!aButton) return;

		aButton.removeEventListener('mouseover', this, false);
		aButton.removeEventListener('mouseout', this, false);
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

		var size = this.getPref('extensions.backforwardthumbnail.size');
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
						iH = size;
					}
					else {
						iH = iH * canvasW / iW;
						y = Math.floor((canvasH - iH) / 2 );
						iW = size;
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
			var file = this.getThumbnailForURI(aImage ? aImage.src : win.location.href );
			var data = canvas.toDataURL();
			if (file.exists())
				file.remove(true);

			var Persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
			data = this.IOService.newURI(data, null, null);
			Persist.saveURI(data, null, null, null, null, file);
		}
	},
 
	fillInTooltip : function(aTarget) 
	{
		if (!aTarget || aTarget.getAttribute('disabled') == 'true')
			return false;

		this.tooltipLabel.value = aTarget.getAttribute(this.kTOOLTIPTEXT);

		switch (aTarget.id)
		{
			case 'back-button':
			case 'forward-button':
				var history = this.browser.sessionHistory;
				if (!history) return false;
				this.updateTooltipForHistoryEntry(history.getEntryAtIndex(
					aTarget.id == 'back-button' ? history.index - 1 : history.index + 1,
					false
				));
				break;

			case 'rewind-button':
			case 'fastforward-button':
				var history = this.browser.sessionHistory;
				if (!history) return false;

				var current = history.getEntryAtIndex(history.index, false);
				var c_host  = current.URI && /\w+:\/\/([^\/:]+)(\/|$)/.test(current.URI.spec) ? RegExp.$1 : null ;

				var check = (aTarget.id == 'rewind-button') ? function(aIndex) { return aIndex > -1 } : function(aIndex) { return aIndex < SH.count }
				var step  = (aTarget.id == 'rewind-button') ? -1 : 1 ;
				var start = (aTarget.id == 'rewind-button') ? history.index-1 : history.index+1 ;

				var entry,
					t_host;
				for (var i = start; check(i); i += step)
				{
					entry  = history.getEntryAtIndex(i, false);
					t_host  = current.URI && /\w+:\/\/([^\/:]+)(\/|$)/.test(current.URI.spec) ? RegExp.$1 : null ;
					if ((c_host && !t_host) || (!c_host && t_host) || (c_host != t_host)) {
						if (this.getPref('rewindforward.goToEndPointOfCurrentDomain')) {
							if (i == start) {
								c_host = t_host;
								continue;
							}
							i -= step;
						}
						this.updateTooltipForHistoryEntry(entry);
						return;
					}
				}
				break;

			default:
				return false;
		}
	},
	updateTooltipForHistoryEntry : function(aEntry)
	{
		aEntry = aEntry.QueryInterface(Components.interfaces.nsIHistoryEntry);
		this.tooltipTitle.value = aEntry.title;
		this.tooltipURI.value = aEntry.URI.spec;
		this.tooltipThumbnail.src = this.IOService.newFileURI(this.getThumbnailForURI(aEntry.URI.spec)).spec;
	},
 
	show : function(aNode) 
	{
		document.tooltipNode = aNode;
		this.tooltip.showPopup(aNode, -1, -1, 'tooltip', 'bottomleft', 'topleft');
	},
 	
	hide : function(aNode) 
	{
		this.tooltip.hidePopup();
	},
	delayedHide : function(aNode)
	{
		this.cancelDelayedHide();
		this.delayedHideTimer = window.setTimeout(function(aSelf, aTarget) {
			aSelf.hide(aTarget);
		}, 0, this, aNode);
	},
	cancelDelayedHide : function()
	{
		if (this.delayedHideTimer) {
			window.clearTimeout(this.delayedHideTimer);
			this.delayedHideTimer = null;
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

window.addEventListener('load', BackForwardThumbnailService, false);
window.addEventListener('unload', BackForwardThumbnailService, false);
 
function BackForwardThumbnailProgressListener(aTab, aTabBrowser) 
{
	this.mTab = aTab;
	this.mTabBrowser = aTabBrowser;
}
BackForwardThumbnailProgressListener.prototype = {
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
			BackForwardThumbnailService.createThumbnail(this.mTab, this.mTabBrowser);
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
 
