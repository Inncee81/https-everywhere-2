window.addEventListener("load", https_everywhere_load, true);

const CI = Components.interfaces;
const CC = Components.classes;

// LOG LEVELS ---
VERB=1;
DBUG=2;
INFO=3;
NOTE=4;
WARN=5;

HTTPSEverywhere = CC["@eff.org/https-everywhere;1"]
                      .getService(Components.interfaces.nsISupports)
                      .wrappedJSObject;

// avoid polluting global namespace
if (!httpsEverywhere) { var httpsEverywhere = {}; }

/**
 * JS Object for used to display toolbar hints to new users and change toolbar
 * UI for cases such as when the toolbar is disabled.
 *
 */
httpsEverywhere.toolbarButton = {

  /**
   * Used to determine if a hint has been previously shown.
   * TODO: Probably extraneous, look into removing
   */
  hintShown: false,

  /**
   * Initialize the toolbar button used to hint new users and update UI on
   * certain events.
   */
  init: function() {
    HTTPSEverywhere.log(DBUG, 'Removing listener for toolbarButton init.');
    window.removeEventListener('load', httpsEverywhere.toolbarButton.init, false);

    var tb = httpsEverywhere.toolbarButton;

    // make sure icon is proper color during init
    tb.changeIcon();

    // show ruleset counter when a tab is changed
    tb.updateRulesetsApplied();
    gBrowser.tabContainer.addEventListener(
      'TabSelect', 
      tb.updateRulesetsApplied, 
      false
    );

    // hook event for when page loads
    var onPageLoad = function() {
      // Timeout is used for a number of reasons.
      // 1) For Performance since we want to defer computation.
      // 2) Sometimes the page is loaded before all applied rulesets are
      //    calculated; in such a case, a half-second wait works.
      setTimeout(tb.updateRulesetsApplied, 500);
    }

    var appcontent = document.getElementById('appcontent');
    if (appcontent) {
      appcontent.addEventListener('load', onPageLoad, true);
    }

    // decide whether to show toolbar hint
    let hintPref = "extensions.https_everywhere.toolbar_hint_shown";
    if(!Services.prefs.getPrefType(hintPref) 
        || !Services.prefs.getBoolPref(hintPref)) { 

      // only run once
      Services.prefs.setBoolPref(hintPref, true);

      gBrowser.addEventListener('load', tb.handleShowHint, true);
    }
    
  },

  /**
   * Shows toolbar hint if previously not shown.
   */
  handleShowHint: function() {
    var tb = httpsEverywhere.toolbarButton;
    if (!tb.hintShown) {
      tb.hintShown = true;
      const faqURL = "https://www.eff.org/https-everywhere/faq";

      gBrowser.selectedTab = gBrowser.addTab(faqURL);
      var nBox = gBrowser.getNotificationBox();

      var strings = document.getElementById('HttpsEverywhereStrings');
      var msg = strings.getString('https-everywhere.toolbar.hint');
      nBox.appendNotification(
        msg, 
        'https-everywhere', 
        'chrome://https-everywhere/skin/https-everywhere-24.png', 
        nBox.PRIORITY_WARNING_MEDIUM
      );

    }

    gBrowser.removeEventListener('load', tb.showToolbarHint, true);
  },

  /**
   * Changes HTTPS Everywhere toolbar icon based on whether HTTPS Everywhere
   * is enabled or disabled.
   */
  changeIcon: function() {
    var prefs = HTTPSEverywhere.get_prefs();
    var enabled = prefs.getBoolPref("globalEnabled");

    var toolbarbutton = document.getElementById('https-everywhere-button');
    if (enabled) {
      toolbarbutton.setAttribute('status', 'enabled');
    } else {
      toolbarbutton.setAttribute('status', 'disabled');
    }
  },

  /**
   * Update the rulesets applied counter for the current tab.
   */
  updateRulesetsApplied: function() {
    var toolbarbutton = document.getElementById('https-everywhere-button');
    var prefs = HTTPSEverywhere.get_prefs();
    var enabled = prefs.getBoolPref("globalEnabled");
    if (!enabled) { 
      toolbarbutton.setAttribute('rulesetsApplied', 0);
      return;
    }

    var domWin = content.document.defaultView.top;
    var alist = HTTPSEverywhere.getExpando(domWin,"applicable_rules", null);
    if (!alist) {
      return;
    }
    // Make sure the list is up to date
    alist.populate_list();

    var counter = 0;
    for (var x in alist.active) {
      if (!(x in alist.breaking)) {
        ++counter;
      }
    }
    for (var x in alist.moot) {
      if (!(x in alist.active)) {
        ++counter;
      }
    }

    toolbarbutton.setAttribute('rulesetsApplied', counter);
    HTTPSEverywhere.log(INFO, 'Setting icon counter to: ' + counter);
  }

};


function https_everywhere_load() {
  // on first run, put the context menu in the addons bar
  try {
    var first_run;
    try {
      first_run = Services.prefs.getBoolPref("extensions.https_everywhere.firstrun_context_menu");
    } catch(e) {
      Services.prefs.setBoolPref("extensions.https_everywhere.firstrun_context_menu", true);
      first_run = true;
    }
    if(first_run) {
      Services.prefs.setBoolPref("extensions.https_everywhere.firstrun_context_menu", false);
      var navbar = document.getElementById("nav-bar");
      if(navbar.currentSet.indexOf("https-everywhere-button") == -1) {
        var set = navbar.currentSet+',https-everywhere-button';
        navbar.setAttribute('currentset', set);
        navbar.currentSet = set;
        document.persist('nav-bar', 'currentset');
      }
    }
  } catch(e) { }
}

function stitch_context_menu() {
  // the same menu appears both under Tools and via the toolbar button:
  var menu = document.getElementById("https-everywhere-menu");
  if (!menu.firstChild) {
    var popup = document.getElementById("https-everywhere-context");
    menu.appendChild(popup.cloneNode(true));
  }
}
function stitch_context_menu2() {
  // the same menu appears both under Tools and via the toolbar button:
  var menu = document.getElementById("https-everywhere-menu2");
  if (!menu.firstChild) {
    var popup = document.getElementById("https-everywhere-context");
    menu.appendChild(popup.cloneNode(true));
  }
}

function show_applicable_list(menupopup) {
  var domWin = content.document.defaultView.top;
  if (!(domWin instanceof CI.nsIDOMWindow)) {
    alert(domWin + " is not an nsIDOMWindow");
    return null;
  }

  var alist = HTTPSEverywhere.getExpando(domWin,"applicable_rules", null);
  var weird=false;
  
  if (!alist) {
    // This case occurs for error pages and similar.  We need a dummy alist
    // because populate_menu lives in there.  Would be good to refactor this
    // away.
    alist = new HTTPSEverywhere.ApplicableList(HTTPSEverywhere.log, document, domWin);
    weird = true;
  }
  alist.populate_menu(document, menupopup, weird);
}

function toggle_rule(rule_id) {
  // toggle the rule state
  var rs = HTTPSEverywhere.https_rules.rulesetsByID[rule_id];
  var GITID = rs.GITCommitID;
  rs.toggle();

  var prefs = HTTPSEverywhere.get_prefs();
  var report_global = prefs.getBoolPref("report_disabled_rules_global");
  var report_specific = prefs.getBoolPref("report_disabled_rules_specific");

  var aWin = CC['@mozilla.org/appshell/window-mediator;1']
	  .getService(CI.nsIWindowMediator)
	  .getMostRecentWindow('navigator:browser');

  if (report_global && !rs.active) {
	  alert('auto-submitted a bug report for: '+rs.xmlName);
  } else if (report_specific && !rs.active) {
     	  aWin.openDialog("chrome://https-everywhere/content/report-disable.xul", 
			  rs.xmlName, "chrome,centerscreen",
			  {xmlName: rs.xmlName, GITCommitID: GITID});
  }

  var domWin = content.document.defaultView.top;
  /*if (domWin instanceof CI.nsIDOMWindow) {
    var alist = HTTPSEverywhere.getExpando(domWin,"applicable_rules", null);
    if (alist) alist.empty();
  }*/
  reload_window();
}

function reload_window() {
  var domWin = content.document.defaultView.top;
  if (!(domWin instanceof CI.nsIDOMWindow)) {
    HTTPSEverywhere.log(WARN, domWin + " is not an nsIDOMWindow");
    return null;
  }
  try {
    var webNav =  domWin.QueryInterface(CI.nsIInterfaceRequestor)
                        .getInterface(CI.nsIWebNavigation)
                        .QueryInterface(CI.nsIDocShell);
  } catch(e) {
    HTTPSEverywhere.log(WARN,"failed to get webNav");
    return null;
  }
  // This choice of flags comes from NoScript's quickReload function; not sure
  // if it's optimal
  webNav.reload(webNav.LOAD_FLAGS_CHARSET_CHANGE);  
}

function toggleEnabledState(){
	HTTPSEverywhere.toggleEnabledState();
	reload_window();	

  // Change icon depending on enabled state
  httpsEverywhere.toolbarButton.changeIcon();
}

function open_in_tab(url) {
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  var recentWindow = wm.getMostRecentWindow("navigator:browser");
  recentWindow.delayedOpenTab(url, null, null, null, null);
}

// hook event for showing hint
HTTPSEverywhere.log(DBUG, 'Adding listener for toolbarButton init.');
window.addEventListener("load", httpsEverywhere.toolbarButton.init, false);
