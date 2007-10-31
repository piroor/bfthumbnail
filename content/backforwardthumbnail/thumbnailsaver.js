var ThumbnailSaverService = { 

	thumbnailBG : 'rgba(0,0,0,0.5)',
	 
/* Utilities */ 
	 
	get browser() 
	{
		return gBrowser;
	},
 
	ObserverService : Components.classes['@mozilla.org/observer-service;1'].getService(Components.interfaces.nsIObserverService), 
  
/* Initializing */ 
	 
	init : function() 
	{
		if (!('gBrowser' in window)) return;

		window.removeEventListener('load', this, false);

		this.initTabBrowser(gBrowser);

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
		var listener = new ThumbnailSaverProgressListener(aTab, aTabBrowser);
		filter.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.linkedBrowser.webProgress.addProgressListener(filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		aTab.__thumbnailsaver__progressListener = listener;
		aTab.__thumbnailsaver__progressFilter   = filter;
	},
  
	destroy : function() 
	{
		this.destroyTabBrowser(gBrowser);

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

		var size = 100;
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
			var hash = aThis.getHashFromString(aImage ? aImage.src : win.location.href );
			var data = canvas.toDataURL();

			var DirectoryService = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties);

			var file = DirectoryService.get('ProfD', Components.interfaces.nsIFile);
			file.append('thumbnails');
			if (!file.exists())
				file.create(file.DIRECTORY_TYPE, 0755);
			file.append(hash+'.png');
			if (file.exists())
				file.remove(true);

			var Persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
			const IOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
			data = IOService.newURI(data, null, null);
			Persist.saveURI(data, null, null, null, null, file);
		}
	},
	get canvas()
	{
		return document.getElementById('thumbnail-saver-canvas');
	},
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

window.addEventListener('load', ThumbnailSaverService, false);
window.addEventListener('unload', ThumbnailSaverService, false);
 
function ThumbnailSaverProgressListener(aTab, aTabBrowser) 
{
	this.mTab = aTab;
	this.mTabBrowser = aTabBrowser;
}
ThumbnailSaverProgressListener.prototype = {
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
			ThumbnailSaverService.createThumbnail(this.mTab, this.mTabBrowser);
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
 	
