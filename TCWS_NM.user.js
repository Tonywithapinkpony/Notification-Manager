// ==UserScript==
// @name         TCWS Zendesk - Notification Manager
// @namespace    https://tommycarwash.zendesk.com/a
// @version      1.3.7
// @description  v1.3.7: Fix hotkey/button toggle (navBtnEl guard, positionPanel try/finally, updateNavBtn sync, dead ownMod var removed, nav btn title corrected).
// @match        https://tommycarwash.zendesk.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Route guard ─────────────────────────────────────────────────────────────
  function isAgentRoute() { return (location.pathname || '').includes('/agent'); }
  if (!isAgentRoute()) return;

  // ─── Selectors ───────────────────────────────────────────────────────────────
  const REFRESH_BTN_SEL = 'button[data-test-id="views_views-list_header-refresh"], button[aria-label="Refresh views pane"]';
  const VIEWS_PANE_SEL  = '[data-test-id="views_views-pane_content"]';
  const NAV_LIST_SEL    = 'ul[data-garden-id="chrome.nav_list"]';

  // ─── View defaults ───────────────────────────────────────────────────────────
  const DEFAULTS_BY_ID = {
    '360206288894':  { mode: 'desktop', priority: 100, level: 'critical' },
    '360131537634':  { mode: 'silent',  priority: 50,  level: 'warning'  },
    '1500018602781': { mode: 'desktop', priority: 80,  level: 'info'     },
  };
  const DEFAULTS_BY_TITLE = [
    { contains: 'CRITICAL',      mode: 'desktop', priority: 100, level: 'critical' },
    { contains: 'Pickup',        mode: 'silent',  priority: 50,  level: 'warning'  },
    { contains: 'Your unsolved', mode: 'desktop', priority: 80,  level: 'info'     },
  ];

  // ─── Storage keys (v6 namespace) ─────────────────────────────────────────────
  const SK = {
    MS:           'tcws_nm6_ms',
    EN:           'tcws_nm6_en',
    PREFS:        'tcws_nm6_prefs',
    COUNTS:       'tcws_nm6_counts',
    UNREAD:       'tcws_nm6_unread',
    TICKETS:      'tcws_nm6_tids',
    NOTIF:        'tcws_nm6_notif',
    DNOTIF:       'tcws_nm6_dnotif',
    APIMODE:      'tcws_nm6_apimode',
    THEME:        'tcws_nm6_theme',
    AUTO_DISMISS: 'tcws_nm6_autodismiss',
    WATCHLIST:    'tcws_nm6_watchlist',
    WATCH_STATES: 'tcws_nm6_watchstates',
    WATCH_INT:    'tcws_nm6_watchint',
    SOUND:        'tcws_nm6_sound',
    SNOOZE:       'tcws_nm6_snooze',
    LOG:          'tcws_nm6_log',
    RESOLVED:     'tcws_nm6_resolved',
    STATS:        'tcws_nm6_stats',
    ACTIVE_ROLE:     'tcws_nm6_active_role',
    REPLY_COMPOSER:  'tcws_nm7_reply_composer',
    ASSIGNED:        'tcws_nm8_assigned',
    QUEUE_MONITOR:   'tcws_nm9_qmon',
    QUEUE_CACHE:     'tcws_nm9_qcache',
    VIEWS_CACHE:     'tcws_nm10_views',
    VIEWS_CACHE_AT:  'tcws_nm10_views_at',
    STROBE:          'tcws_nm11_strobe',
    TICKER_EN:       'tcws_nm11_ticker',
    CALLS_CACHE:     'tcws_nm12_calls',
    PINNED_AGENTS:   'tcws_nm12_pinned',
    ACTIVE_ROLE_ID:  'tcws_nm12_role_id',
    CUSTOM_THEME:    'tcws_nm12_custom_theme',
    FEATURES:        'tcws_nm12_features',
    CALL_BANNER_EN:  'tcws_nm13_callbanner',
    HOTKEY:          'tcws_nm13_hotkey',
    MATRIX_COLOR:    'tcws_nm13_matrix_color',
    SCALE:           'tcws_nm14_scale',
    NM_WIDTH:        'tcws_nm14_nm_width',
    DET_WIDTH:       'tcws_nm14_det_width',
    FLD_WIDTH:       'tcws_nm14_fld_width',
    NM_SIDE:         'tcws_nm14_nm_side',
    NM_VALIGN:       'tcws_nm14_nm_valign',
    NM_OFFSET_X:     'tcws_nm14_nm_ox',
    NM_OFFSET_Y:     'tcws_nm14_nm_oy',
  };

  const NOTIFIED_TTL  = 6 * 60 * 60 * 1000;
  const LOG_TTL       = 24 * 60 * 60 * 1000;

  // ─── Site-view field IDs ──────────────────────────────────────────────────────
  const CF_WASH_NAME   = '360024203794';
  const CF_WASH_DOWN   = '1500007018341';
  const CF_CRITICAL    = '360054265253';
  const CF_TIME_DOWN   = '1500012392482';

  // ─── Feature toggles ─────────────────────────────────────────────────────────
  const FEATURE_DEFS = [
    { key: 'calls',        label: 'Call Monitor',
      desc: 'Live active call panel, call banner, and badge on the Calls tab' },
    { key: 'teamBar',      label: 'Team Sidebar',
      desc: 'Vertical agent status cards in the left nav sidebar' },
    { key: 'queueMonitor', label: 'Queue Monitor',
      desc: 'Pinnable Zendesk view monitor — polls every 60 s' },
    { key: 'watchlist',    label: 'Watchlist',
      desc: 'Per-ticket polling watchlist with custom intervals' },
    { key: 'sites',        label: 'Site View',
      desc: 'Operations tab grouping open tickets by wash location — polls every 2 min' },
    { key: 'resolved',     label: 'Resolved Tab',
      desc: 'Tracks tickets that were solved or closed while being watched — kept for 7 days' },
    { key: 'assigned',     label: 'Assigned Tab',
      desc: 'Tracks tickets that were assigned to an agent while being watched — kept for 24 h' },
    { key: 'mediaViewer',  label: 'Media Viewer',
      desc: 'Shows inline image thumbnails with lightbox + audio players for voice recordings inside ticket conversations' },
    { key: 'callBanner',   label: 'Call Banner',
      desc: 'Strip below the panel header showing active calls by department — static for one call, flips through cards for multiple' },
  ];
  const _FEAT_DEFAULTS = { calls: true, teamBar: true, queueMonitor: true, watchlist: true, sites: false, resolved: true, assigned: true, mediaViewer: true, callBanner: true };
  function loadFeatures() {
    try { return Object.assign({}, _FEAT_DEFAULTS, JSON.parse(localStorage.getItem(SK.FEATURES) || '{}')); }
    catch { return { ..._FEAT_DEFAULTS }; }
  }
  function saveFeatures(f) { localStorage.setItem(SK.FEATURES, JSON.stringify(f)); }
  function featEnabled(key) { return loadFeatures()[key] !== false; }

  // ─── Key ticket fields shown in the Fields panel ──────────────────────────────
  // type: 'text'|'textarea'|'tagger'|'checkbox'|'number'|'date'|'std'
  // std=true means it's a standard ticket field, not a custom_field entry
  // opts: for tagger fields, the allowed values to show as a <select>
  const KEY_FIELDS = [
    // ── Standard fields ──────────────────────────────────────────────────────────
    { id: 'subject',   label: 'Subject',        type: 'text',    std: true },
    { id: 'status',    label: 'Status',         type: 'tagger',  std: true,
      opts: ['new','open','pending','hold','solved'] },
    { id: 'type',      label: 'Type',           type: 'tagger',  std: true,
      opts: ['','question','incident','problem','task'] },
    { id: 'priority',  label: 'Priority',       type: 'tagger',  std: true,
      opts: ['','low','normal','high','urgent'] },
    // ── Site info ─────────────────────────────────────────────────────────────────
    { id: 360024203794,  label: 'Wash Name',          type: 'text'    },
    { id: 360024223634,  label: 'Panel Number',        type: 'text'    },
    { id: 360040366753,  label: 'Address',             type: 'text'    },
    { id: 360040366793,  label: 'On-site Contact',     type: 'text'    },
    { id: 360024204494,  label: 'Priority Level',      type: 'tagger',
      opts: ['','low','normal','high','urgent','emergency'] },
    { id: 30003883052439, label: 'Type Of Tunnel',     type: 'tagger', fetchOpts: true },
    // ── Issue details ─────────────────────────────────────────────────────────────
    { id: 360034766533,  label: 'Content Area',        type: 'text'    },
    { id: 1500007725882, label: 'Description of Issue',type: 'textarea' },
    { id: 360040366933,  label: 'Serial Number',       type: 'text'    },
    { id: 360040366913,  label: 'Other Information',   type: 'textarea' },
    // ── Wash down ─────────────────────────────────────────────────────────────────
    { id: 1500007018341, label: 'Critical/Wash Down',  type: 'checkbox' },
    { id: 360054265253,  label: 'Currently CRITICAL',  type: 'text'    },
    { id: 1500012392482, label: 'Time On Wash Down',   type: 'text'    },
    // ── Parts/RMA ─────────────────────────────────────────────────────────────────
    { id: 360040366973,  label: 'Tracking Number',     type: 'text'    },
    { id: 360040366993,  label: 'RMA Number',          type: 'text'    },
    { id: 360040404394,  label: 'Condition',           type: 'text'    },
  ];

  const FIELDS_PANEL_W = 390; // px width of the fields side panel
  const LOG_MAX       = 300;
  const RESOLVED_MAX  = 150;
  const RESOLVED_TTL  = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_MS    = 30_000;
  const MIN_MS        = 5_000;
  const MAX_MS        = 60_000;
  const RING_R        = 13;
  const RING_C        = 2 * Math.PI * RING_R;

  // ─── Themes ──────────────────────────────────────────────────────────────────
        const THEMES = {
    sage: {
      label: 'Sage', icon: '🌿', swatch: ['#0d1610','#97c1a9'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(151,193,169,.18)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#080f0a','--t-bg1':'#0d1610','--t-bg2':'#121e16','--t-bg3':'#17261c',
        '--t-border':'rgba(151,193,169,.15)','--t-border2':'rgba(151,193,169,.28)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#97c1a9','--t-accent-dim':'rgba(151,193,169,.15)',
        '--t-accent-brd':'rgba(151,193,169,.38)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#8eb4d4','--t-ok':'#97c1a9',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(151,193,169,.10)','--t-btn-hover':'rgba(151,193,169,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#080f0a 0%,#0d1610 100%)',
      }
    },
    seafoam: {
      label: 'Seafoam', icon: '🌊', swatch: ['#0c1814','#b5ead6'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(181,234,214,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#060f0c','--t-bg1':'#0c1814','--t-bg2':'#12201c','--t-bg3':'#182824',
        '--t-border':'rgba(181,234,214,.14)','--t-border2':'rgba(181,234,214,.27)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#b5ead6','--t-accent-dim':'rgba(181,234,214,.14)',
        '--t-accent-brd':'rgba(181,234,214,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(181,234,214,.10)','--t-btn-hover':'rgba(181,234,214,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#060f0c 0%,#0c1814 100%)',
      }
    },
    aqua: {
      label: 'Aqua', icon: '🩵', swatch: ['#0c1818','#a3e1dc'], category: 'dark',
      radius: '13px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(163,225,220,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#060e0e','--t-bg1':'#0c1818','--t-bg2':'#122020','--t-bg3':'#182a2a',
        '--t-border':'rgba(163,225,220,.14)','--t-border2':'rgba(163,225,220,.27)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#a3e1dc','--t-accent-dim':'rgba(163,225,220,.14)',
        '--t-accent-brd':'rgba(163,225,220,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#a3e1dc',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(163,225,220,.10)','--t-btn-hover':'rgba(163,225,220,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#060e0e 0%,#0c1818 100%)',
      }
    },
    dusk: {
      label: 'Dusk', icon: '🌆', swatch: ['#0e1420','#9ab7d3'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(154,183,211,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#080e18','--t-bg1':'#0e1420','--t-bg2':'#141c2a','--t-bg3':'#1a2434',
        '--t-border':'rgba(154,183,211,.14)','--t-border2':'rgba(154,183,211,.28)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#9ab7d3','--t-accent-dim':'rgba(154,183,211,.15)',
        '--t-accent-brd':'rgba(154,183,211,.38)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(154,183,211,.10)','--t-btn-hover':'rgba(154,183,211,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#080e18 0%,#0e1420 100%)',
      }
    },
    lavender: {
      label: 'Lavender', icon: '🪻', swatch: ['#12101e','#dfccf1'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(223,204,241,.18)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#0c0a18','--t-bg1':'#12101e','--t-bg2':'#181528','--t-bg3':'#1e1a32',
        '--t-border':'rgba(223,204,241,.15)','--t-border2':'rgba(223,204,241,.28)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#dfccf1','--t-accent-dim':'rgba(223,204,241,.15)',
        '--t-accent-brd':'rgba(223,204,241,.38)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(223,204,241,.10)','--t-btn-hover':'rgba(223,204,241,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0c0a18 0%,#12101e 100%)',
      }
    },
    blush: {
      label: 'Blush', icon: '🩷', swatch: ['#1c1018','#f5d2d3'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(245,210,211,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#130a0a','--t-bg1':'#1c1018','--t-bg2':'#241820','--t-bg3':'#2c2028',
        '--t-border':'rgba(245,210,211,.14)','--t-border2':'rgba(245,210,211,.27)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#f5d2d3','--t-accent-dim':'rgba(245,210,211,.14)',
        '--t-accent-brd':'rgba(245,210,211,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(245,210,211,.10)','--t-btn-hover':'rgba(245,210,211,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#130a0a 0%,#1c1018 100%)',
      }
    },
    rose: {
      label: 'Rose', icon: '🌸', swatch: ['#1c1014','#ffb8b1'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,184,177,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#130808','--t-bg1':'#1c1014','--t-bg2':'#24161c','--t-bg3':'#2c1e24',
        '--t-border':'rgba(255,184,177,.14)','--t-border2':'rgba(255,184,177,.27)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#ffb8b1','--t-accent-dim':'rgba(255,184,177,.14)',
        '--t-accent-brd':'rgba(255,184,177,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e89090','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,144,144,.15)','--t-crit-brd':'rgba(232,144,144,.38)',
        '--t-btn-bg':'rgba(255,184,177,.10)','--t-btn-hover':'rgba(255,184,177,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#130808 0%,#1c1014 100%)',
      }
    },

    lime: {
      label: 'Lime', icon: '🍃', swatch: ['#121808','#e2f0cb'], category: 'dark',
      radius: '11px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(226,240,203,.15)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#0a1004','--t-bg1':'#121808','--t-bg2':'#182010','--t-bg3':'#1e2816',
        '--t-border':'rgba(226,240,203,.13)','--t-border2':'rgba(226,240,203,.26)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#e2f0cb','--t-accent-dim':'rgba(226,240,203,.14)',
        '--t-accent-brd':'rgba(226,240,203,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(226,240,203,.10)','--t-btn-hover':'rgba(226,240,203,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0a1004 0%,#121808 100%)',
      }
    },
    lilac: {
      label: 'Lilac', icon: '💜', swatch: ['#14101e','#c7dbda'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(199,219,218,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#0c0c16','--t-bg1':'#14101e','--t-bg2':'#1a1828','--t-bg3':'#202032',
        '--t-border':'rgba(199,219,218,.14)','--t-border2':'rgba(199,219,218,.27)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#c7dbda','--t-accent-dim':'rgba(199,219,218,.14)',
        '--t-accent-brd':'rgba(199,219,218,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(199,219,218,.10)','--t-btn-hover':'rgba(199,219,218,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0c0c16 0%,#14101e 100%)',
      }
    },
    thistle: {
      label: 'Thistle', icon: '🌾', swatch: ['#160f1e','#ffe1e9'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,225,233,.15)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#0e0812','--t-bg1':'#160f1e','--t-bg2':'#1e1628','--t-bg3':'#261e32',
        '--t-border':'rgba(255,225,233,.13)','--t-border2':'rgba(255,225,233,.26)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.88)',
        '--t-accent':'#ffe1e9','--t-accent-dim':'rgba(255,225,233,.14)',
        '--t-accent-brd':'rgba(255,225,233,.36)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8a4b4','--t-warn':'#d4c090','--t-info':'#9ab7d3','--t-ok':'#b5ead6',
        '--t-crit-dim':'rgba(232,164,180,.15)','--t-crit-brd':'rgba(232,164,180,.38)',
        '--t-btn-bg':'rgba(255,225,233,.10)','--t-btn-hover':'rgba(255,225,233,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0e0812 0%,#160f1e 100%)',
      }
    },
    wizard: {
      label: 'Wizard', icon: '🧙', swatch: ['#000000','#d4af37'], category: 'dark',
      radius: '12px', scanline: false,
      glow: '0 8px 48px rgba(0,0,0,.98), 0 0 0 1px rgba(212,175,55,.30)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#000000','--t-bg1':'#000000','--t-bg2':'#050400','--t-bg3':'#0a0800',
        '--t-border':'rgba(212,175,55,.22)','--t-border2':'rgba(212,175,55,.45)',
        '--t-text1':'#d4af37','--t-text2':'rgba(212,175,55,.92)','--t-text3':'rgba(212,175,55,.80)',
        '--t-accent':'#d4af37','--t-accent-dim':'rgba(212,175,55,.12)',
        '--t-accent-brd':'rgba(212,175,55,.45)','--t-accent-txt':'#d4af37',
        '--t-crit':'#e87070','--t-warn':'#d4af37','--t-info':'#c9a227','--t-ok':'#d4af37',
        '--t-crit-dim':'rgba(232,112,112,.15)','--t-crit-brd':'rgba(232,112,112,.38)',
        '--t-btn-bg':'rgba(212,175,55,.08)','--t-btn-hover':'rgba(212,175,55,.18)',
        '--t-text-glow':'0 0 8px rgba(212,175,55,.35)','--t-border-glow':'0 0 8px rgba(212,175,55,.25)',
        '--t-hdr-grad':'linear-gradient(135deg,#000000 0%,#050400 100%)',
      }
    },

    // ── Light themes ─────────────────────────────────────────────────────────────
    arctic: {
      label: 'Arctic', icon: null, swatch: ['#f4f8fc','#4a7fa5'], category: 'light',
      radius: '12px', scanline: false,
      glow: '0 8px 32px rgba(0,60,120,.12), 0 0 0 1px rgba(74,127,165,.22)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#e8eff7','--t-bg1':'#f4f8fc','--t-bg2':'#eaf2f8','--t-bg3':'#dce8f4',
        '--t-border':'rgba(74,127,165,.20)','--t-border2':'rgba(74,127,165,.35)',
        '--t-text1':'#1a2a3a','--t-text2':'rgba(26,42,58,.85)','--t-text3':'rgba(26,42,58,.58)',
        '--t-accent':'#4a7fa5','--t-accent-dim':'rgba(74,127,165,.12)',
        '--t-accent-brd':'rgba(74,127,165,.35)','--t-accent-txt':'#ffffff',
        '--t-crit':'#b03040','--t-warn':'#926010','--t-info':'#4a7fa5','--t-ok':'#2a7a50',
        '--t-crit-dim':'rgba(176,48,64,.10)','--t-crit-brd':'rgba(176,48,64,.28)',
        '--t-btn-bg':'rgba(74,127,165,.10)','--t-btn-hover':'rgba(74,127,165,.20)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#dde8f4 0%,#f4f8fc 100%)',
      }
    },
    arcticblast: {
      label: 'Arctic Blast', icon: null, swatch: ['#e0f2fe','#0e6ea8'], category: 'light',
      radius: '12px', scanline: false,
      glow: '0 8px 32px rgba(0,80,160,.18), 0 0 0 1px rgba(14,110,168,.28)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#cce8fa','--t-bg1':'#e0f2fe','--t-bg2':'#c8e6f8','--t-bg3':'#b0d8f0',
        '--t-border':'rgba(14,110,168,.22)','--t-border2':'rgba(14,110,168,.40)',
        '--t-text1':'#082040','--t-text2':'rgba(8,32,64,.85)','--t-text3':'rgba(8,32,64,.58)',
        '--t-accent':'#0e6ea8','--t-accent-dim':'rgba(14,110,168,.14)',
        '--t-accent-brd':'rgba(14,110,168,.40)','--t-accent-txt':'#ffffff',
        '--t-crit':'#b02030','--t-warn':'#7a5800','--t-info':'#0e6ea8','--t-ok':'#0a6840',
        '--t-crit-dim':'rgba(176,32,48,.10)','--t-crit-brd':'rgba(176,32,48,.28)',
        '--t-btn-bg':'rgba(14,110,168,.12)','--t-btn-hover':'rgba(14,110,168,.22)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#b8daf5 0%,#e0f2fe 100%)',
      }
    },

    // ── Retro themes ─────────────────────────────────────────────────────────────
    nes: {
      label: 'NES', icon: null, swatch: ['#1a1a1a','#e8333a'], category: 'retro',
      radius: '0px', scanline: true,
      glow: '0 0 0 3px #e8333a, 0 0 0 4px #1a1a1a, 0 8px 32px rgba(0,0,0,.95)',
      font: '"Courier New",Courier,monospace',
      vars: {
        '--t-bg0':'#0e0e0e','--t-bg1':'#1a1a1a','--t-bg2':'#222222','--t-bg3':'#2e2e2e',
        '--t-border':'rgba(232,51,58,.32)','--t-border2':'rgba(232,51,58,.58)',
        '--t-text1':'#f0f0f0','--t-text2':'rgba(240,240,240,.90)','--t-text3':'rgba(240,240,240,.65)',
        '--t-accent':'#e8333a','--t-accent-dim':'rgba(232,51,58,.16)',
        '--t-accent-brd':'rgba(232,51,58,.52)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e8333a','--t-warn':'#f8c800','--t-info':'#5080e8','--t-ok':'#40b040',
        '--t-crit-dim':'rgba(232,51,58,.18)','--t-crit-brd':'rgba(232,51,58,.52)',
        '--t-btn-bg':'rgba(232,51,58,.12)','--t-btn-hover':'rgba(232,51,58,.24)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0e0e0e 0%,#1a1a1a 100%)',
      }
    },
    snes: {
      label: 'SNES', icon: null, swatch: ['#2d2b55','#7b68c8'], category: 'retro',
      radius: '4px', scanline: true,
      glow: '0 0 0 3px #7b68c8, 0 0 0 4px #1e1c3a, 0 8px 32px rgba(0,0,0,.88)',
      font: '"Courier New",Courier,monospace',
      vars: {
        '--t-bg0':'#1a1838','--t-bg1':'#2d2b55','--t-bg2':'#38366a','--t-bg3':'#45437e',
        '--t-border':'rgba(123,104,200,.28)','--t-border2':'rgba(123,104,200,.52)',
        '--t-text1':'#e8e4ff','--t-text2':'rgba(232,228,255,.90)','--t-text3':'rgba(232,228,255,.64)',
        '--t-accent':'#7b68c8','--t-accent-dim':'rgba(123,104,200,.16)',
        '--t-accent-brd':'rgba(123,104,200,.50)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e05555','--t-warn':'#e8a830','--t-info':'#7b68c8','--t-ok':'#48b848',
        '--t-crit-dim':'rgba(224,85,85,.16)','--t-crit-brd':'rgba(224,85,85,.50)',
        '--t-btn-bg':'rgba(123,104,200,.14)','--t-btn-hover':'rgba(123,104,200,.28)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#1a1838 0%,#2d2b55 100%)',
      }
    },
    sega: {
      label: 'Sega', icon: null, swatch: ['#08081e','#00a8e8'], category: 'retro',
      radius: '2px', scanline: true,
      glow: '0 0 0 3px #00a8e8, 0 0 0 4px #08081e, 0 8px 32px rgba(0,0,0,.95), 0 0 24px rgba(0,168,232,.20)',
      font: '"Courier New",Courier,monospace',
      vars: {
        '--t-bg0':'#040414','--t-bg1':'#08081e','--t-bg2':'#0e0e2a','--t-bg3':'#141438',
        '--t-border':'rgba(0,168,232,.28)','--t-border2':'rgba(0,168,232,.52)',
        '--t-text1':'#d8eeff','--t-text2':'rgba(216,238,255,.90)','--t-text3':'rgba(216,238,255,.64)',
        '--t-accent':'#00a8e8','--t-accent-dim':'rgba(0,168,232,.14)',
        '--t-accent-brd':'rgba(0,168,232,.50)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e83840','--t-warn':'#e8a800','--t-info':'#00a8e8','--t-ok':'#10c870',
        '--t-crit-dim':'rgba(232,56,64,.16)','--t-crit-brd':'rgba(232,56,64,.50)',
        '--t-btn-bg':'rgba(0,168,232,.12)','--t-btn-hover':'rgba(0,168,232,.25)',
        '--t-text-glow':'none','--t-border-glow':'0 0 10px rgba(0,168,232,.28)',
        '--t-hdr-grad':'linear-gradient(135deg,#040414 0%,#08081e 100%)',
      }
    },
    atari: {
      label: 'Atari', icon: null, swatch: ['#1a1008','#e87820'], category: 'retro',
      radius: '0px', scanline: true,
      glow: '0 0 0 4px #3a2010, 0 0 0 7px #e87820, 0 8px 32px rgba(0,0,0,.95)',
      font: '"Courier New",Courier,monospace',
      vars: {
        '--t-bg0':'#0e0904','--t-bg1':'#1a1008','--t-bg2':'#241808','--t-bg3':'#302010',
        '--t-border':'rgba(232,120,32,.30)','--t-border2':'rgba(232,120,32,.55)',
        '--t-text1':'#f0d090','--t-text2':'rgba(240,208,144,.90)','--t-text3':'rgba(240,208,144,.62)',
        '--t-accent':'#e87820','--t-accent-dim':'rgba(232,120,32,.16)',
        '--t-accent-brd':'rgba(232,120,32,.52)','--t-accent-txt':'#1a1008',
        '--t-crit':'#e83830','--t-warn':'#e8c020','--t-info':'#6090d8','--t-ok':'#40a840',
        '--t-crit-dim':'rgba(232,56,48,.18)','--t-crit-brd':'rgba(232,56,48,.52)',
        '--t-btn-bg':'rgba(232,120,32,.12)','--t-btn-hover':'rgba(232,120,32,.24)',
        '--t-text-glow':'0 0 6px rgba(232,120,32,.28)','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0e0904 0%,#1a1008 100%)',
      }
    },
    xbox: {
      label: 'Xbox', icon: null, swatch: ['#0a0f0a','#52b043'], category: 'retro',
      radius: '6px', scanline: false,
      glow: '0 0 0 3px #52b043, 0 0 0 5px #0a0f0a, 0 8px 40px rgba(0,0,0,.95), 0 0 24px rgba(82,176,67,.18)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#050805','--t-bg1':'#0a0f0a','--t-bg2':'#111811','--t-bg3':'#182218',
        '--t-border':'rgba(82,176,67,.26)','--t-border2':'rgba(82,176,67,.50)',
        '--t-text1':'#e8f4e8','--t-text2':'rgba(232,244,232,.90)','--t-text3':'rgba(232,244,232,.62)',
        '--t-accent':'#52b043','--t-accent-dim':'rgba(82,176,67,.15)',
        '--t-accent-brd':'rgba(82,176,67,.48)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e84040','--t-warn':'#e8b830','--t-info':'#6090d8','--t-ok':'#52b043',
        '--t-crit-dim':'rgba(232,64,64,.16)','--t-crit-brd':'rgba(232,64,64,.50)',
        '--t-btn-bg':'rgba(82,176,67,.12)','--t-btn-hover':'rgba(82,176,67,.24)',
        '--t-text-glow':'none','--t-border-glow':'0 0 12px rgba(82,176,67,.22)',
        '--t-hdr-grad':'linear-gradient(135deg,#050805 0%,#0a0f0a 100%)',
      }
    },
    xbox360: {
      label: 'Xbox 360', icon: null, swatch: ['#101810','#7cc47a'], category: 'retro',
      radius: '8px', scanline: false,
      glow: '0 0 0 2px #7cc47a, 0 0 0 4px #101810, 0 8px 36px rgba(0,0,0,.85), 0 0 30px rgba(124,196,122,.16)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#080e08','--t-bg1':'#101810','--t-bg2':'#182418','--t-bg3':'#203020',
        '--t-border':'rgba(124,196,122,.22)','--t-border2':'rgba(124,196,122,.44)',
        '--t-text1':'#f0f8f0','--t-text2':'rgba(240,248,240,.88)','--t-text3':'rgba(240,248,240,.60)',
        '--t-accent':'#7cc47a','--t-accent-dim':'rgba(124,196,122,.14)',
        '--t-accent-brd':'rgba(124,196,122,.44)','--t-accent-txt':'#0a100a',
        '--t-crit':'#e05050','--t-warn':'#d4a830','--t-info':'#70a8e0','--t-ok':'#7cc47a',
        '--t-crit-dim':'rgba(224,80,80,.15)','--t-crit-brd':'rgba(224,80,80,.48)',
        '--t-btn-bg':'rgba(124,196,122,.11)','--t-btn-hover':'rgba(124,196,122,.22)',
        '--t-text-glow':'none','--t-border-glow':'0 0 14px rgba(124,196,122,.18)',
        '--t-hdr-grad':'linear-gradient(135deg,#080e08 0%,#101810 100%)',
      }
    },
    gamecube: {
      label: 'GameCube', icon: null, swatch: ['#1e1430','#8040c8'], category: 'retro',
      radius: '10px', scanline: false,
      glow: '0 0 0 3px #8040c8, 0 0 0 5px #1e1430, 0 8px 36px rgba(0,0,0,.90)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#120c20','--t-bg1':'#1e1430','--t-bg2':'#281c40','--t-bg3':'#342450',
        '--t-border':'rgba(128,64,200,.26)','--t-border2':'rgba(128,64,200,.50)',
        '--t-text1':'#e8d8ff','--t-text2':'rgba(232,216,255,.88)','--t-text3':'rgba(232,216,255,.62)',
        '--t-accent':'#8040c8','--t-accent-dim':'rgba(128,64,200,.16)',
        '--t-accent-brd':'rgba(128,64,200,.50)','--t-accent-txt':'#ffffff',
        '--t-crit':'#e84848','--t-warn':'#d8a030','--t-info':'#4090e0','--t-ok':'#38b878',
        '--t-crit-dim':'rgba(232,72,72,.15)','--t-crit-brd':'rgba(232,72,72,.48)',
        '--t-btn-bg':'rgba(128,64,200,.13)','--t-btn-hover':'rgba(128,64,200,.26)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#120c20 0%,#1e1430 100%)',
      }
    },
    n64: {
      label: 'N64', icon: null, swatch: ['#181818','#d40000'], category: 'retro',
      radius: '4px', scanline: false,
      glow: '0 0 0 3px #d40000, 0 0 0 5px #181818, 0 8px 36px rgba(0,0,0,.92)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#0e0e0e','--t-bg1':'#181818','--t-bg2':'#222222','--t-bg3':'#2e2e2e',
        '--t-border':'rgba(212,0,0,.30)','--t-border2':'rgba(212,0,0,.55)',
        '--t-text1':'#f0f0f0','--t-text2':'rgba(240,240,240,.88)','--t-text3':'rgba(240,240,240,.62)',
        '--t-accent':'#d40000','--t-accent-dim':'rgba(212,0,0,.14)',
        '--t-accent-brd':'rgba(212,0,0,.52)','--t-accent-txt':'#ffffff',
        '--t-crit':'#d40000','--t-warn':'#f8d800','--t-info':'#0050a0','--t-ok':'#008000',
        '--t-crit-dim':'rgba(212,0,0,.16)','--t-crit-brd':'rgba(212,0,0,.52)',
        '--t-btn-bg':'rgba(212,0,0,.12)','--t-btn-hover':'rgba(212,0,0,.24)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#0e0e0e 0%,#181818 100%)',
      }
    },

    // ── Animated themes ───────────────────────────────────────────────────────────
    aurora: {
      label: 'Aurora', icon: null, swatch: ['#0a1628','#38d9a9'], category: 'animated',
      animClass: 'tcws-anim-aurora',
      radius: '14px', scanline: false,
      glow: '0 8px 48px rgba(0,0,0,.70), 0 0 0 1px rgba(56,217,169,.24)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#060e1e','--t-bg1':'#0a1628','--t-bg2':'#0f1e36','--t-bg3':'#142644',
        '--t-border':'rgba(56,217,169,.17)','--t-border2':'rgba(56,217,169,.32)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.62)',
        '--t-accent':'#38d9a9','--t-accent-dim':'rgba(56,217,169,.14)',
        '--t-accent-brd':'rgba(56,217,169,.38)','--t-accent-txt':'#ffffff',
        '--t-crit':'#ff6b8a','--t-warn':'#ffd166','--t-info':'#74b9ff','--t-ok':'#38d9a9',
        '--t-crit-dim':'rgba(255,107,138,.15)','--t-crit-brd':'rgba(255,107,138,.38)',
        '--t-btn-bg':'rgba(56,217,169,.10)','--t-btn-hover':'rgba(56,217,169,.22)',
        '--t-text-glow':'none','--t-border-glow':'none',
        '--t-hdr-grad':'linear-gradient(135deg,#060e1e 0%,#0a1628 100%)',
      }
    },
    synthwave: {
      label: 'Synthwave', icon: null, swatch: ['#0d0221','#fe75fe'], category: 'animated',
      animClass: 'tcws-anim-synthwave',
      radius: '8px', scanline: true,
      glow: '0 8px 40px rgba(0,0,0,.85), 0 0 22px rgba(254,117,254,.28), 0 0 0 1px rgba(254,117,254,.35)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#060112','--t-bg1':'#0d0221','--t-bg2':'#16063a','--t-bg3':'#1e0a50',
        '--t-border':'rgba(254,117,254,.22)','--t-border2':'rgba(254,117,254,.45)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.62)',
        '--t-accent':'#fe75fe','--t-accent-dim':'rgba(254,117,254,.14)',
        '--t-accent-brd':'rgba(254,117,254,.45)','--t-accent-txt':'#ffffff',
        '--t-crit':'#ff4466','--t-warn':'#ffcc00','--t-info':'#00e5ff','--t-ok':'#39ff14',
        '--t-crit-dim':'rgba(255,68,102,.15)','--t-crit-brd':'rgba(255,68,102,.42)',
        '--t-btn-bg':'rgba(254,117,254,.12)','--t-btn-hover':'rgba(254,117,254,.26)',
        '--t-text-glow':'0 0 8px rgba(254,117,254,.40)','--t-border-glow':'0 0 14px rgba(254,117,254,.32)',
        '--t-hdr-grad':'linear-gradient(135deg,#060112 0%,#0d0221 100%)',
      }
    },
    plasma: {
      label: 'Plasma', icon: null, swatch: ['#0a0818','#a855f7'], category: 'animated',
      animClass: 'tcws-anim-plasma',
      radius: '14px', scanline: false,
      glow: '0 8px 48px rgba(0,0,0,.80), 0 0 28px rgba(168,85,247,.22), 0 0 0 1px rgba(168,85,247,.32)',
      font: 'system-ui,-apple-system,sans-serif',
      vars: {
        '--t-bg0':'#060410','--t-bg1':'#0a0818','--t-bg2':'#100d24','--t-bg3':'#171232',
        '--t-border':'rgba(168,85,247,.20)','--t-border2':'rgba(168,85,247,.38)',
        '--t-text1':'#ffffff','--t-text2':'rgba(255,255,255,.88)','--t-text3':'rgba(255,255,255,.62)',
        '--t-accent':'#a855f7','--t-accent-dim':'rgba(168,85,247,.14)',
        '--t-accent-brd':'rgba(168,85,247,.40)','--t-accent-txt':'#ffffff',
        '--t-crit':'#f87171','--t-warn':'#fbbf24','--t-info':'#60a5fa','--t-ok':'#34d399',
        '--t-crit-dim':'rgba(248,113,113,.15)','--t-crit-brd':'rgba(248,113,113,.40)',
        '--t-btn-bg':'rgba(168,85,247,.12)','--t-btn-hover':'rgba(168,85,247,.24)',
        '--t-text-glow':'none','--t-border-glow':'0 0 16px rgba(168,85,247,.28)',
        '--t-hdr-grad':'linear-gradient(135deg,#060410 0%,#0a0818 100%)',
      }
    },
    matrix: {
      label: 'Matrix', icon: null, swatch: ['#000000','#00ff41'], category: 'animated',
      animClass: 'tcws-anim-matrix',
      radius: '4px', scanline: true,
      glow: '0 0 0 2px #003b10, 0 0 30px rgba(0,255,65,.20), 0 8px 40px rgba(0,0,0,.98)',
      font: '"Courier New",Courier,monospace',
      vars: {
        '--t-bg0':'#000000','--t-bg1':'#000000','--t-bg2':'#020502','--t-bg3':'#040a04',
        '--t-border':'rgba(0,255,65,.18)','--t-border2':'rgba(0,255,65,.38)',
        '--t-text1':'#00ff41','--t-text2':'rgba(0,255,65,.85)','--t-text3':'rgba(0,255,65,.50)',
        '--t-accent':'#00ff41','--t-accent-dim':'rgba(0,255,65,.12)',
        '--t-accent-brd':'rgba(0,255,65,.45)','--t-accent-txt':'#000000',
        '--t-crit':'#ff3333','--t-warn':'#ccff00','--t-info':'#00ccff','--t-ok':'#00ff41',
        '--t-crit-dim':'rgba(255,51,51,.15)','--t-crit-brd':'rgba(255,51,51,.40)',
        '--t-btn-bg':'rgba(0,255,65,.08)','--t-btn-hover':'rgba(0,255,65,.18)',
        '--t-text-glow':'0 0 7px rgba(0,255,65,.55)','--t-border-glow':'0 0 14px rgba(0,255,65,.28)',
        '--t-hdr-grad':'linear-gradient(135deg,#000000 0%,#020502 100%)',
      }
    },
  };

  // ─── Storage helpers ──────────────────────────────────────────────────────────
  const sj  = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const lg  = k => localStorage.getItem(k);
  const ls  = (k, v) => localStorage.setItem(k, v);

  const loadMs          = () => { const v = Number(lg(SK.MS)); return (Number.isFinite(v) && v >= MIN_MS && v <= MAX_MS) ? v : DEFAULT_MS; };
  const loadEn          = () => lg(SK.EN) === '1';
  const saveMs          = ms => ls(SK.MS, String(ms));
  const saveEn          = en => ls(SK.EN, en ? '1' : '0');
  const loadPrefs       = () => sj(lg(SK.PREFS)        || '{}', {});
  const savePrefs       = p  => ls(SK.PREFS,        JSON.stringify(p || {}));
  const loadCounts      = () => sj(lg(SK.COUNTS)       || '{}', {});
  const saveCounts      = o  => ls(SK.COUNTS,       JSON.stringify(o || {}));
  const loadUnread      = () => sj(lg(SK.UNREAD)       || '{}', {});
  const saveUnread      = o  => ls(SK.UNREAD,       JSON.stringify(o || {}));
  const loadTickets     = () => sj(lg(SK.TICKETS)      || '{}', {});
  const saveTickets     = o  => ls(SK.TICKETS,      JSON.stringify(o || {}));
  const loadNotif       = () => sj(lg(SK.NOTIF)        || '{}', {});
  const saveNotif       = o  => ls(SK.NOTIF,        JSON.stringify(o || {}));
  const loadDNotif      = () => lg(SK.DNOTIF) === '1';
  const saveDNotif      = en => ls(SK.DNOTIF,       en ? '1' : '0');
  const loadApiMode     = () => lg(SK.APIMODE) || '';
  const saveApiMode     = m  => ls(SK.APIMODE, m);
  const loadTheme       = () => { const k = lg(SK.THEME); return (k === 'custom' || (k && THEMES[k])) ? k : 'dusk'; };
  const saveTheme       = t  => ls(SK.THEME, t);
  const loadAutoDismiss = () => lg(SK.AUTO_DISMISS) === '1';
  const saveAutoDismiss = v  => ls(SK.AUTO_DISMISS, v ? '1' : '0');
  const loadWatchlist   = () => sj(lg(SK.WATCHLIST)    || '[]', []);
  const saveWatchlist   = a  => ls(SK.WATCHLIST,    JSON.stringify(a || []));
  const loadWatchStates = () => sj(lg(SK.WATCH_STATES) || '{}', {});
  const saveWatchStates = o  => ls(SK.WATCH_STATES, JSON.stringify(o || {}));
  const loadWatchInt    = () => { const v = Number(lg(SK.WATCH_INT)); return (Number.isFinite(v) && v > 0) ? v : 60_000; };
  const saveWatchInt    = v  => ls(SK.WATCH_INT, String(v));
  const loadSoundEn     = () => lg(SK.SOUND) === '1';
  const saveSoundEn     = v  => ls(SK.SOUND, v ? '1' : '0');
  const loadSnooze      = () => sj(lg(SK.SNOOZE)       || '{}', {});
  const saveSnooze      = o  => ls(SK.SNOOZE,       JSON.stringify(o || {}));
  const loadLog         = () => sj(lg(SK.LOG)          || '[]', []);
  const saveLog         = a  => ls(SK.LOG,          JSON.stringify(a || []));

  // v6 new storage
  const loadResolved  = () => sj(lg(SK.RESOLVED) || '[]', []);
  const saveResolved  = a  => ls(SK.RESOLVED, JSON.stringify((a || []).slice(-RESOLVED_MAX)));
  const _defaultStats = () => ({ ticketsSeen: [], statusChanges: [], merges: [], responseTimes: [], resetAt: Date.now() });
  const loadStats     = () => { const s = sj(lg(SK.STATS) || '{}', {}); return { ..._defaultStats(), ...s }; };
  const saveStats     = o  => ls(SK.STATS, JSON.stringify(o || _defaultStats()));
  const loadActiveRole  = () => lg(SK.ACTIVE_ROLE) || '';
  const saveActiveRole  = v  => ls(SK.ACTIVE_ROLE, v);
  const loadActiveRoleId = () => { const v = Number(lg(SK.ACTIVE_ROLE_ID)); return Number.isFinite(v) && v > 0 ? v : null; };
  const saveActiveRoleId = id => ls(SK.ACTIVE_ROLE_ID, id ? String(id) : '');
  const loadPinnedAgents = () => sj(lg(SK.PINNED_AGENTS) || '[]', []);
  const savePinnedAgents = a  => ls(SK.PINNED_AGENTS, JSON.stringify(a || []));
  const loadReplyComposer = () => lg(SK.REPLY_COMPOSER) !== 'false';
  const saveReplyComposer = v => ls(SK.REPLY_COMPOSER, v ? 'true' : 'false');

  // ─── Queue Monitor storage ─────────────────────────────────────────────────────
  // Each entry: { viewId, label }
  const loadQueueMonitor = () => sj(lg(SK.QUEUE_MONITOR) || '[]', []);
  const saveQueueMonitor = a  => ls(SK.QUEUE_MONITOR, JSON.stringify(a || []));
  // Cache: { [viewId]: { ids: string[], at: number, label: string } }
  const loadQueueCache   = () => sj(lg(SK.QUEUE_CACHE)   || '{}', {});
  const saveQueueCache   = o  => ls(SK.QUEUE_CACHE,   JSON.stringify(o || {}));

  // ─── Views cache (API-sourced view list) ──────────────────────────────────────
  // Each entry: { viewKey: string, title: string }
  const loadViewsCache   = () => sj(lg(SK.VIEWS_CACHE)    || '[]', []);
  const saveViewsCache   = a  => ls(SK.VIEWS_CACHE,    JSON.stringify(a || []));
  const loadViewsCacheAt = () => Number(lg(SK.VIEWS_CACHE_AT)) || 0;
  const saveViewsCacheAt = t  => ls(SK.VIEWS_CACHE_AT, String(t));
  const loadStrobe       = () => lg(SK.STROBE) === '1';
  const saveStrobe       = v  => ls(SK.STROBE, v ? '1' : '0');
  const loadTickerEn     = () => lg(SK.TICKER_EN) !== '0'; // default ON
  const saveTickerEn     = v  => ls(SK.TICKER_EN, v ? '1' : '0');
  const loadCustomTheme  = () => sj(lg(SK.CUSTOM_THEME) || '{}', {});
  const saveCustomTheme  = o  => ls(SK.CUSTOM_THEME, JSON.stringify(o || {}));
  const loadMatrixColor  = () => lg(SK.MATRIX_COLOR) || '#00ff41';
  const saveMatrixColor  = v  => ls(SK.MATRIX_COLOR, v);
  // UI scale: 0.70 → 1.40 in 0.05 steps. Default 1.0 (100%).
  const SCALE_MIN = 0.70, SCALE_MAX = 1.40, SCALE_STEP = 0.05, SCALE_DEFAULT = 1.0;
  // ── Fix: clamp + epsilon tolerance so floating-point drift at 1.4 doesn't reset to default ──
  const loadScale = () => {
    const v = Number(lg(SK.SCALE));
    if (!Number.isFinite(v) || v < SCALE_MIN - 0.001 || v > SCALE_MAX + 0.001) return SCALE_DEFAULT;
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(v * 20) / 20));
  };
  const saveScale = v => ls(SK.SCALE, String(Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(v * 20) / 20))));

  // ── Panel Width constants & helpers ──────────────────────────────────────────
  const NM_W_MIN = 400, NM_W_MAX = 900,  NM_W_DEFAULT = 600,  NM_W_STEP = 10;
  const DET_W_MIN= 600, DET_W_MAX= 1400, DET_W_DEFAULT= 940,  DET_W_STEP= 20;
  const FLD_W_MIN= 240, FLD_W_MAX= 500,  FLD_W_DEFAULT= 340,  FLD_W_STEP= 10;

  const _clampInt  = (v, mn, mx) => Math.round(Math.max(mn, Math.min(mx, v)));
  const loadNMWidth  = () => { const v = Number(lg(SK.NM_WIDTH));  return (Number.isFinite(v) && v >= NM_W_MIN  && v <= NM_W_MAX)  ? _clampInt(v, NM_W_MIN,  NM_W_MAX)  : NM_W_DEFAULT;  };
  const saveNMWidth  = v  => ls(SK.NM_WIDTH,  String(_clampInt(v, NM_W_MIN,  NM_W_MAX)));
  const loadDetWidth = () => { const v = Number(lg(SK.DET_WIDTH)); return (Number.isFinite(v) && v >= DET_W_MIN && v <= DET_W_MAX) ? _clampInt(v, DET_W_MIN, DET_W_MAX) : DET_W_DEFAULT; };
  const saveDetWidth = v  => ls(SK.DET_WIDTH, String(_clampInt(v, DET_W_MIN, DET_W_MAX)));
  const loadFldWidth = () => { const v = Number(lg(SK.FLD_WIDTH)); return (Number.isFinite(v) && v >= FLD_W_MIN && v <= FLD_W_MAX) ? _clampInt(v, FLD_W_MIN, FLD_W_MAX) : FLD_W_DEFAULT; };
  const saveFldWidth = v  => ls(SK.FLD_WIDTH, String(_clampInt(v, FLD_W_MIN, FLD_W_MAX)));

  // ── Panel Placement constants & helpers ──────────────────────────────────────
  const NM_SIDE_OPTS   = ['auto', 'right'];
  const NM_VALIGN_OPTS = ['auto', 'top', 'middle', 'bottom'];
  // Defaults: +15px right offset, −30px up offset (layout-tuned starting positions)
  const NM_OX_DEFAULT = 15,  NM_OX_MIN = 15,  NM_OX_MAX = 300;
  const NM_OY_DEFAULT = -30, NM_OY_MIN = -30, NM_OY_MAX = 200;

  const loadNMSide    = () => { const v = lg(SK.NM_SIDE);   return NM_SIDE_OPTS.includes(v)   ? v : 'auto'; };
  const saveNMSide    = v  => ls(SK.NM_SIDE, v);
  const loadNMVAlign  = () => { const v = lg(SK.NM_VALIGN); return NM_VALIGN_OPTS.includes(v) ? v : 'auto'; };
  const saveNMVAlign  = v  => ls(SK.NM_VALIGN, v);
  const loadNMOffsetX = () => { const v = Number(lg(SK.NM_OFFSET_X)); return Number.isFinite(v) ? _clampInt(v, NM_OX_MIN, NM_OX_MAX) : NM_OX_DEFAULT; };
  const saveNMOffsetX = v  => ls(SK.NM_OFFSET_X, String(_clampInt(v, NM_OX_MIN, NM_OX_MAX)));
  const loadNMOffsetY = () => { const v = Number(lg(SK.NM_OFFSET_Y)); return Number.isFinite(v) ? _clampInt(v, NM_OY_MIN, NM_OY_MAX) : NM_OY_DEFAULT; };
  const saveNMOffsetY = v  => ls(SK.NM_OFFSET_Y, String(_clampInt(v, NM_OY_MIN, NM_OY_MAX)));

  // ─── Hotkey config ─────────────────────────────────────────────────────────────
  // Stored as an object: { type: 'double' | 'combo', key: string, ctrl, alt, shift }
  // type='double' → double-tap a modifier key (key = 'Control' | 'Alt' | 'Shift')
  // type='combo'  → hold modifiers + press key (e.g. Ctrl+Shift+Z)
  const HK_DEFAULT = { type: 'double', key: 'Control', ctrl: false, alt: false, shift: false };
  const loadHotkey = () => ({ ...HK_DEFAULT, ...sj(lg(SK.HOTKEY) || '{}', {}) });
  const saveHotkey = o  => ls(SK.HOTKEY, JSON.stringify(o));
  function _hexToRgb(hex) {
    const h = hex.replace('#','');
    const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    return { r: parseInt(full.slice(0,2),16), g: parseInt(full.slice(2,4),16), b: parseInt(full.slice(4,6),16) };
  }
  function _adjustHex(hex, delta) {
    const {r,g,b} = _hexToRgb(hex);
    const c = v => Math.max(0, Math.min(255, v + delta)).toString(16).padStart(2,'0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }
  function buildCustomVars(cfg) {
    const bg  = cfg.bg      || '#0e1420';
    const acc = cfg.accent  || '#9ab7d3';
    const txt = cfg.text    || '#ffffff';
    const cr  = cfg.crit    || '#e8a4b4';
    const wn  = cfg.warn    || '#d4c090';
    const inf = cfg.info    || '#8eb4d4';
    const {r:br,g:bg2,b:bb} = _hexToRgb(bg);
    const isDark = (br + bg2 + bb) < 384;
    const d = isDark ? -10 : 10;
    const {r:ar,g:ag,b:ab} = _hexToRgb(acc);
    const {r:tr,g:tg,b:tb} = _hexToRgb(txt);
    const {r:cr2,g:cg,b:cb} = _hexToRgb(cr);
    return {
      '--t-bg0': _adjustHex(bg, d * -1),
      '--t-bg1': bg,
      '--t-bg2': _adjustHex(bg, d),
      '--t-bg3': _adjustHex(bg, d * 2),
      '--t-border':     `rgba(${ar},${ag},${ab},.18)`,
      '--t-border2':    `rgba(${ar},${ag},${ab},.34)`,
      '--t-text1': txt,
      '--t-text2': `rgba(${tr},${tg},${tb},.88)`,
      '--t-text3': `rgba(${tr},${tg},${tb},.62)`,
      '--t-accent': acc,
      '--t-accent-dim': `rgba(${ar},${ag},${ab},.14)`,
      '--t-accent-brd': `rgba(${ar},${ag},${ab},.40)`,
      '--t-accent-txt': '#ffffff',
      '--t-crit': cr,
      '--t-warn': wn,
      '--t-info': inf,
      '--t-ok':   acc,
      '--t-crit-dim': `rgba(${cr2},${cg},${cb},.15)`,
      '--t-crit-brd': `rgba(${cr2},${cg},${cb},.38)`,
      '--t-btn-bg':    `rgba(${ar},${ag},${ab},.10)`,
      '--t-btn-hover': `rgba(${ar},${ag},${ab},.22)`,
      '--t-text-glow':   'none',
      '--t-border-glow': 'none',
      '--t-hdr-grad': `linear-gradient(135deg,${_adjustHex(bg, d * -1)} 0%,${bg} 100%)`,
    };
  }

  // ─── Assigned tracking ────────────────────────────────────────────────────────
  const ASSIGNED_MAX = 100;
  const ASSIGNED_TTL = 24 * 60 * 60 * 1000; // 24h
  const loadAssigned  = () => sj(lg(SK.ASSIGNED) || '[]', []);
  const saveAssigned  = a  => ls(SK.ASSIGNED, JSON.stringify((a || []).slice(-ASSIGNED_MAX)));
  function addAssigned(entry) {
    const list = loadAssigned().filter(e => Date.now() - e.at < ASSIGNED_TTL);
    const idx  = list.findIndex(e => String(e.id) === String(entry.id));
    if (idx !== -1) list.splice(idx, 1);
    list.push({ ...entry, id: String(entry.id), at: entry.at || Date.now() });
    saveAssigned(list);
  }

  // ─── Macro API helpers ────────────────────────────────────────────────────────
  async function fetchMacros(query) {
    const url = query
      ? `/api/v2/macros/search.json?query=${encodeURIComponent(query)}&active=true&per_page=15`
      : `/api/v2/macros.json?active=true&per_page=25&sort_by=usage_1h&sort_order=desc`;
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const js = await r.json();
    return (js.macros || []).map(m => ({ id: m.id, title: m.title }));
  }
  async function applyMacroPreview(tid, macroId) {
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}/macros/${encodeURIComponent(macroId)}/apply.json`, {
      credentials: 'same-origin',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const js = await r.json();
    return js.result || {};
  }
  async function applyMacroToTicket(tid, macroId) {
    const preview = await applyMacroPreview(tid, macroId);
    const ticket  = preview.ticket || {};
    const update  = {};
    if (ticket.comment?.body)   update.comment = { body: ticket.comment.body, public: ticket.comment.public !== false };
    if (ticket.subject)         update.subject = ticket.subject;
    if (ticket.status)          update.status  = ticket.status;
    if (ticket.assignee_id)     update.assignee_id = ticket.assignee_id;
    if (ticket.group_id)        update.group_id    = ticket.group_id;
    if (ticket.priority)        update.priority    = ticket.priority;
    if (Array.isArray(ticket.tags) && ticket.tags.length) update.tags = ticket.tags;
    if (Array.isArray(ticket.custom_fields) && ticket.custom_fields.length) update.custom_fields = ticket.custom_fields;
    if (!Object.keys(update).length) return { preview, applied: false };
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json`, {
      method: 'PUT', credentials: 'same-origin', headers,
      body: JSON.stringify({ ticket: update }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { preview, applied: true };
  }

  async function sendTicketReply(tid, body, isPublic) {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json`, {
      method: 'PUT', credentials: 'same-origin', headers,
      body: JSON.stringify({ ticket: { comment: { body, public: isPublic } } }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────
  const isNum   = n => typeof n === 'number' && Number.isFinite(n);
  const escHtml = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

  // Navigate to a ticket via Zendesk's SPA router — adds a tab, no new window
  function _zdNav(path) {
    try {
      history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } catch { location.href = path; }
  }

  // Build a <a> that SPA-navigates on click (opens ticket as a Zendesk tab)
  function _mkTicketLink(tid, cls) {
    const a = document.createElement('a');
    a.href = `/agent/tickets/${encodeURIComponent(tid)}`;
    a.className = cls || 'tcws-ticket-link';
    a.textContent = `#${tid}`;
    a.addEventListener('click', e => {
      e.preventDefault();
      _zdNav(`/agent/tickets/${encodeURIComponent(tid)}`);
    });
    return a;
  }
  function _navToTicket(tid) { _zdNav(`/agent/tickets/${encodeURIComponent(tid)}`); }
  const fmtMs   = ms => ms % 1000 === 0 ? `${ms / 1000}s` : `${(ms / 1000).toFixed(1)}s`;

  function hhMM(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }
  function parseCount(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase().replace(/,/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)([KM])?$/);
    if (!m) { const n = Number(s); return Number.isFinite(n) ? n : null; }
    const num = Number(m[1]);
    if (!Number.isFinite(num)) return null;
    if (m[2] === 'K') return Math.round(num * 1000);
    if (m[2] === 'M') return Math.round(num * 1_000_000);
    return Math.round(num);
  }
  function getViewKey(href) {
    const m = String(href || '').match(/\/agent\/filters\/([^/?#]+)/);
    return m?.[1] || null;
  }
  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // ─── Sound system (Web Audio API) ────────────────────────────────────────────
  let _audioCtx = null;
  function _getAudioCtx() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  }
  function _tone(ctx, freq, type, start, dur, vol = 0.12) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }
  function playSound(level) {
    if (!loadSoundEn()) return;
    try {
      const ctx = _getAudioCtx();
      if (level === 'critical') {
        [0, 0.18, 0.36].forEach(d => _tone(ctx, 880, 'square', d, 0.14, 0.13));
      } else if (level === 'warning') {
        _tone(ctx, 660, 'sine', 0, 0.22, 0.11);
        _tone(ctx, 440, 'sine', 0.20, 0.28, 0.09);
      } else {
        _tone(ctx, 523, 'sine', 0, 0.35, 0.09);
        _tone(ctx, 784, 'sine', 0, 0.2,  0.05);
      }
    } catch (e) { console.warn('[TCWS-NM] Sound error', e); }
  }

  // ─── Activity log ─────────────────────────────────────────────────────────────
  function logActivity(entry) {
    const now = Date.now();
    const log = loadLog().filter(e => now - e.ts < LOG_TTL).slice(-(LOG_MAX - 1));
    log.push({ ts: now, ...entry });
    saveLog(log);
  }

  function buildSparkline(log, width = 460, height = 52) {
    const now = Date.now();
    const HOURS = 12;
    const buckets = Array.from({ length: HOURS }, (_, i) => ({
      label: new Date(now - (HOURS - 1 - i) * 3_600_000).getHours(),
      count: 0, level: 'normal'
    }));
    const lvlRank   = { normal: 0, info: 1, warning: 2, critical: 3 };
    const lvlColors = { normal: 'var(--t-ok)', info: 'var(--t-info)', warning: 'var(--t-warn)', critical: 'var(--t-crit)' };
    for (const e of log) {
      const ageSec = (now - e.ts) / 3_600_000;
      if (ageSec > HOURS) continue;
      const idx = HOURS - 1 - Math.floor(ageSec);
      if (idx < 0) continue;
      buckets[idx].count++;
      if ((lvlRank[e.level] || 0) > (lvlRank[buckets[idx].level] || 0)) buckets[idx].level = e.level || 'normal';
    }
    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    const barW = Math.floor((width - (HOURS - 1) * 4) / HOURS);
    const chartH = height - 16;
    const bars = buckets.map((b, i) => {
      const x = i * (barW + 4);
      const h = b.count ? Math.max(4, (b.count / maxCount) * chartH) : 2;
      const y = chartH - h;
      const color = lvlColors[b.level] || lvlColors.normal;
      const opacity = b.count ? 0.85 : 0.2;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${color}" opacity="${opacity}"/>
              <text x="${x + barW / 2}" y="${height - 2}" text-anchor="middle" font-size="7" fill="var(--t-text3)" font-family="inherit">${b.label}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;display:block;overflow:visible">${bars}</svg>`;
  }

  // ─── Snooze helpers ───────────────────────────────────────────────────────────
  function snoozeAlert(viewKey, durationMs) {
    const s = loadSnooze();
    s[viewKey] = Date.now() + durationMs;
    saveSnooze(s);
    clearAlert(viewKey);
  }
  function isViewSnoozed(viewKey) {
    const s = loadSnooze();
    if (!s[viewKey]) return false;
    if (Date.now() > s[viewKey]) { delete s[viewKey]; saveSnooze(s); return false; }
    return true;
  }
  function snoozeUntilStr(viewKey) {
    const s = loadSnooze();
    if (!s[viewKey]) return '';
    return hhMM(s[viewKey]);
  }

  // ─── View prefs ───────────────────────────────────────────────────────────────
  function titleDefaultPref(title) {
    const t = (title || '').toLowerCase();
    for (const r of DEFAULTS_BY_TITLE)
      if (t.includes(r.contains.toLowerCase()))
        return { mode: r.mode, priority: r.priority, level: r.level };
    return null;
  }
  function getPref(viewKey, title) {
    const prefs = loadPrefs();
    if (prefs[viewKey]) return prefs[viewKey];
    if (DEFAULTS_BY_ID[viewKey]) return { ...DEFAULTS_BY_ID[viewKey] };
    return titleDefaultPref(title) || { mode: 'off', priority: 0, level: 'normal' };
  }
  function setPref(viewKey, patch) {
    const prefs = loadPrefs();
    prefs[viewKey] = { ...(prefs[viewKey] || {}), ...patch };
    savePrefs(prefs);
  }

  // ─── DOM row collection (dot injection only — no count reading) ───────────────
  // Used solely to locate sidebar anchor elements so we can inject/update dots.
  // Count data is now sourced exclusively from the API.
  function collectDomRows() {
    const pane = document.querySelector(VIEWS_PANE_SEL);
    if (!pane) return [];
    const rows = [];
    for (const a of pane.querySelectorAll('a[href^="/agent/filters/"]')) {
      const viewKey = getViewKey(a.getAttribute('href'));
      if (!viewKey) continue;
      const countEl =
        a.querySelector('div[data-test-id="views_views-list_item_count"]') ||
        a.querySelector('div[data-test-id="views_views-list_row_count"]');
      if (!countEl) continue;
      rows.push({ a, viewKey, countEl });
    }
    return rows;
  }

  // ─── Row alert dots ───────────────────────────────────────────────────────────
  function ensureDot(countEl) {
    const parent = countEl?.parentElement;
    if (!parent) return null;
    let dot = parent.querySelector('[data-tcws-dot]');
    if (!dot) {
      dot = document.createElement('span');
      dot.setAttribute('data-tcws-dot', '1');
      dot.className = 'tcws-dot';
      dot.innerHTML = '<i></i><b></b>';
      parent.appendChild(dot);
    }
    return dot;
  }
  function setDot(countEl, obj) {
    const dot = ensureDot(countEl);
    if (!dot) return;
    const b = dot.querySelector('b');
    if (!obj) { dot.style.display = 'none'; dot.dataset.pulse = '0'; if (b) b.textContent = ''; return; }
    dot.style.display = 'inline-flex';
    dot.dataset.level = obj.level || 'normal';
    dot.dataset.pulse = (obj.level === 'critical' || obj.level === 'warning') ? '1' : '0';
    if (b) b.textContent = obj.delta > 0 ? `+${obj.delta}` : '';
  }
  function refreshDots() {
    const unread = loadUnread();
    for (const r of collectDomRows()) setDot(r.countEl, unread[r.viewKey] || null);
  }

  // ─── Alert management ─────────────────────────────────────────────────────────
  function clearDot(viewKey) {
    for (const r of collectDomRows())
      if (r.viewKey === viewKey) setDot(r.countEl, null);
  }
  function clearAlert(viewKey) {
    const u = loadUnread();
    if (!u[viewKey]) return;
    delete u[viewKey];
    saveUnread(u);
    updateNavBtn(); refreshDots(); _syncPanelPeripheral();
    if (panelEl?.classList.contains('open') && panelEl._render) panelEl._render();
  }
  function clearAllAlerts() {
    saveUnread({});
    document.querySelectorAll('[data-tcws-dot]').forEach(el => el.style.display = 'none');
    updateNavBtn(); _syncPanelPeripheral();
    if (panelEl?.classList.contains('open') && panelEl._render) panelEl._render();
  }

  // ─── Stats tracking ───────────────────────────────────────────────────────────
  function recordResponseTime(alertAt) {
    if (!alertAt) return;
    const ms = Date.now() - alertAt;
    if (ms < 0 || ms > 8 * 60 * 60 * 1000) return; // ignore if > 8h
    const stats = loadStats();
    stats.responseTimes = [...(stats.responseTimes || []), ms].slice(-500);
    saveStats(stats);
  }
  function recordStatusChange(tid, from, to) {
    const stats = loadStats();
    stats.statusChanges = [...(stats.statusChanges || []),
      { id: String(tid), from, to, at: Date.now() }].slice(-500);
    saveStats(stats);
  }
  function recordMerge(fromId, toId) {
    const stats = loadStats();
    stats.merges = [...(stats.merges || []),
      { fromId: String(fromId), toId: String(toId), at: Date.now() }].slice(-500);
    saveStats(stats);
  }
  function recordTicketSeen(tid, viewKey, viewTitle) {
    const stats = loadStats();
    const existing = (stats.ticketsSeen || []);
    if (!existing.find(t => t.id === String(tid))) {
      stats.ticketsSeen = [...existing, { id: String(tid), at: Date.now(), viewKey, viewTitle }].slice(-1000);
      saveStats(stats);
    }
  }
  function resetStats() {
    saveStats(_defaultStats());
  }
  function calcAvgResponse() {
    const stats = loadStats();
    const rt = (stats.responseTimes || []).filter(v => v > 0);
    if (!rt.length) return null;
    return rt.reduce((a, b) => a + b, 0) / rt.length;
  }

  // ─── Resolved log ─────────────────────────────────────────────────────────────
  function addResolved(entry) {
    // entry: { id, subject, status, mergedInto, resolvedAt, solvedBy, viewTitle, viewKey }
    const list = loadResolved().filter(e => Date.now() - e.resolvedAt < RESOLVED_TTL);
    if (!list.find(e => e.id === String(entry.id))) {
      list.push({ ...entry, id: String(entry.id), resolvedAt: entry.resolvedAt || Date.now() });
    }
    saveResolved(list);
  }

  // ─── Desktop notifications ────────────────────────────────────────────────────
  function desktopNotify(title, body, tag) {
    if (!loadDNotif() || !('Notification' in window)) return;
    const fire = () => {
      try {
        const n = new Notification(title, { body, tag: tag || 'tcws-nm', icon: '/favicon.ico', requireInteraction: false });
        n.onclick = () => { try { window.focus(); } catch {} n.close(); };
      } catch (e) { console.warn('[TCWS-NM] Notification error:', e); }
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission === 'default')
      Notification.requestPermission().then(p => { if (p === 'granted') { saveDNotif(true); fire(); } });
  }

  // ─── Zendesk-side countdown ───────────────────────────────────────────────────
  const ZD_CD_ID = 'tcws-zd-countdown';
  function ensureZdCountdown() {
    if (document.getElementById(ZD_CD_ID)) return;
    const btn = document.querySelector(REFRESH_BTN_SEL);
    if (!btn) return;
    const wrap = btn.closest('div, li, span') || btn.parentElement;
    if (!wrap) return;
    const cd = document.createElement('span');
    cd.id = ZD_CD_ID;
    cd.style.cssText = ['display:inline-flex','align-items:center','gap:4px','margin-left:8px',
      'font-size:12px','font-weight:800','color:rgba(255,255,255,.55)','letter-spacing:.02em',
      'vertical-align:middle','pointer-events:none','font-family:system-ui,sans-serif','transition:color .3s'].join(';');
    if (btn.nextSibling) wrap.insertBefore(cd, btn.nextSibling); else wrap.appendChild(cd);
  }
  function updateZdCountdown() {
    ensureZdCountdown();
    const cd = document.getElementById(ZD_CD_ID);
    if (!cd) return;
    const en = loadEn();
    if (!en || !nextRefreshAt) { cd.textContent = ''; return; }
    const remaining = Math.max(0, nextRefreshAt - Date.now());
    const sec = Math.ceil(remaining / 1000);
    const pct = remaining / loadMs();
    const g = Math.round(165 * pct + 68 * (1 - pct));
    const b = Math.round(246 * pct + 68 * (1 - pct));
    cd.style.color = `rgba(${Math.round(60 + 195 * (1 - pct))},${g},${b},.75)`;
    cd.textContent = sec > 0 ? `↺ ${sec}s` : '↺ …';
  }

  let refreshTimer   = null;
  let countdownTimer = null;
  let nextRefreshAt  = 0;
  let lastScanAt     = 0;
  let lastScanOk     = true;
  let scanDebounce   = null;
  let refreshScanDebounce = null;
  let bootDebounce   = null;
  let inScan         = false;
  let suppressClose  = false; // kept for compatibility — no longer set by doRefresh
  let panelEl        = null;
  let detailPanelEl  = null;
  let fieldsPanelEl  = null;
  let navBtnEl       = null;

  // In-memory state for v6 features
  let currentUser    = null; // { id, name, email }
  let availGroups    = [];   // [{ id, name }]
  let liveCallsCache  = []; // [{id,ticket_id,agent,group,direction,caller,started_at,status}]
  let callsApiTimer   = null;
  let callsApiLastAt  = 0;
  let monitoredCallId = null;
  let agentStatusCache = {}; // agentId -> {id,name,status,photoUrl,groups}
  let agentPrevStatus  = {}; // agentId -> last-rendered status (for flip detection)
  let agentStatusTimer = null;
  let agentStatusLastAt = 0;

  // Site View state
  let siteViewCache   = { sites: {}, order: [], updatedAt: 0 };
  let siteViewTimer   = null;
  let siteViewPolling = false;

  // getRefreshBtn kept for ensureZdCountdown; doRefresh no longer clicks it
  const getRefreshBtn = () => document.querySelector(REFRESH_BTN_SEL);

  // ─── Auto-refresh engine ──────────────────────────────────────────────────────
  function doRefresh() {
    if (document.visibilityState !== 'visible') return;
    // v1.3.0 No longer clicks the native Zendesk refresh button.
    // Count data is fetched directly from the API in scan().
    nextRefreshAt = Date.now() + loadMs();
    _updateRingUI();
    if (refreshScanDebounce) clearTimeout(refreshScanDebounce);
    refreshScanDebounce = setTimeout(() => scan(), 300);
  }
  function stopAR() {
    if (refreshTimer)   { clearInterval(refreshTimer);  refreshTimer  = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    nextRefreshAt = 0;
    saveEn(false); updateNavBtn(); _updateRingUI(); updateZdCountdown();
  }
  function startAR(ms) {
    stopAR();
    saveMs(ms); saveEn(true);
    nextRefreshAt  = Date.now() + ms;
    refreshTimer   = setInterval(doRefresh, ms);
    countdownTimer = setInterval(_updateRingUI, 900);
    updateNavBtn(); _updateRingUI();
  }
  function _updateRingUI() {
    const ring  = document.getElementById('tcws-cd-ring');
    const label = document.getElementById('tcws-cd-label');
    const en    = loadEn();
    if (!ring || !label) return;
    if (!en || !nextRefreshAt) { ring.style.opacity = '0'; label.textContent = ''; }
    else {
      ring.style.opacity = '1';
      const ms        = loadMs();
      const remaining = Math.max(0, nextRefreshAt - Date.now());
      const fraction  = remaining / ms;
      const offset    = RING_C * (1 - fraction);
      const progress  = ring.querySelector('.tcws-ring-prog');
      if (progress) progress.style.strokeDashoffset = offset.toFixed(2);
      const sec = Math.ceil(remaining / 1000);
      label.textContent = sec > 0 ? `${sec}s` : '…';
    }
    updateZdCountdown();
  }

  // ─── Live Calls API Poll (Zendesk Talk) ──────────────────────────────────────
  async function pollLiveCalls() {
    try {
      const r = await fetch('/api/v2/channels/voice/calls.json', { credentials: 'same-origin' });
      if (!r.ok) return;
      const js = await r.json();
      const raw = js.calls || [];
      // Real call fields (from API):
      //   call.customer.name  — "Caller +1 (501) 786-2259" or org/contact name
      //   call.customer.phone — E.164 number
      //   call.agent.name     — agent display name
      //   call.group_name     — group string
      //   call.pick_up_time   — ISO timestamp (NOT started_at / created_at)
      //   call.ended          — boolean; filter out ended calls
      liveCallsCache = raw
        .filter(c => !c.ended)
        .map(c => ({
          id:         c.id,
          ticket_id:  c.ticket_id || null,
          agent:      c.agent?.name || null,
          group:      c.group_name || null,
          direction:  c.direction || 'inbound',
          caller:     c.customer?.name || c.customer?.phone || null,
          started_at: c.pick_up_time || null,
          on_hold:    c.on_hold || false,
        }));
      callsApiLastAt = Date.now();

      if (monitoredCallId && !liveCallsCache.find(c => c.id === monitoredCallId)) {
        monitoredCallId = null;
      }

      _updateCallBanner();
      _syncCallsBadge();

      if (panelEl?.classList.contains('open') && activeTab === 'calls') panelEl._render?.();
    } catch { /* silently hold last known state */ }
  }

  // ─── Call banner — static (1 call) or flip-card (multiple calls) ─────────────
  // Solid opaque colors so pills are readable on any theme (light or dark bg).
  const _DEPT_PALETTE = [
    { bg: '#0ea5e9', fg: '#ffffff' }, // sky
    { bg: '#10b981', fg: '#ffffff' }, // emerald
    { bg: '#f59e0b', fg: '#ffffff' }, // amber
    { bg: '#8b5cf6', fg: '#ffffff' }, // violet
    { bg: '#f97316', fg: '#ffffff' }, // orange
    { bg: '#ec4899', fg: '#ffffff' }, // pink
    { bg: '#6366f1', fg: '#ffffff' }, // indigo
    { bg: '#14b8a6', fg: '#ffffff' }, // teal
  ];
  let _deptPaletteMap  = {};
  let _deptPaletteNext = 0;
  function _deptColor(group) {
    const k = (group || '').toLowerCase().trim() || '__none__';
    if (_deptPaletteMap[k] === undefined) {
      _deptPaletteMap[k] = _deptPaletteNext % _DEPT_PALETTE.length;
      _deptPaletteNext++;
    }
    return _DEPT_PALETTE[_deptPaletteMap[k]];
  }

  let _bannerDurTimer  = null;
  let _bannerFlipTimer = null;
  let _bannerCardIdx   = 0;

  function _stopBannerTimers() {
    if (_bannerDurTimer)  { clearInterval(_bannerDurTimer);  _bannerDurTimer  = null; }
    if (_bannerFlipTimer) { clearInterval(_bannerFlipTimer); _bannerFlipTimer = null; }
  }

  function _buildBannerCard(call) {
    const card = document.createElement('div');
    card.className = 'tcws-call-banner-card';

    const dirClass  = (call.direction || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
    const deptLabel = call.group || 'Unknown';
    const color     = _deptColor(deptLabel);
    const startMs   = call.started_at ? new Date(call.started_at).getTime() : 0;

    const dept = document.createElement('span');
    dept.className = 'tcws-call-banner-dept';
    dept.style.background = color.bg;
    dept.style.color = color.fg;
    dept.textContent = deptLabel;
    card.appendChild(dept);

    const dir = document.createElement('span');
    dir.className = `tcws-call-banner-dir ${dirClass}`;
    dir.textContent = dirClass === 'outbound' ? 'OUT' : 'IN';
    card.appendChild(dir);

    const caller = document.createElement('span');
    caller.className = 'tcws-call-banner-caller';
    caller.textContent = call.caller || (dirClass === 'outbound' ? 'Outbound' : 'Unknown');
    card.appendChild(caller);

    if (call.agent) {
      const sep = document.createElement('span'); sep.className = 'tcws-call-banner-sep'; sep.textContent = '·';
      const agent = document.createElement('span'); agent.className = 'tcws-call-banner-agent'; agent.textContent = call.agent;
      card.appendChild(sep); card.appendChild(agent);
    }

    const dur = document.createElement('span');
    dur.className = 'tcws-call-banner-dur';
    dur.dataset.startMs = String(startMs);
    dur.textContent = startMs ? fmtDuration(Date.now() - startMs) : '--';
    card.appendChild(dur);

    return card;
  }

  function _updateCallBanner() {
    const banner = document.getElementById('tcws-call-banner');
    if (!banner) return;

    _stopBannerTimers();

    // Hidden when feature disabled or no calls
    if (!featEnabled('callBanner') || !liveCallsCache.length) {
      banner.classList.remove('active');
      banner.innerHTML = '';
      return;
    }

    banner.classList.add('active');
    banner.innerHTML = '';

    // LIVE pill
    const livePill = document.createElement('div');
    livePill.className = 'tcws-call-banner-live';
    livePill.innerHTML = `<span class="tcws-call-banner-live-dot"></span><span class="tcws-call-banner-live-txt">${liveCallsCache.length} Live</span>`;
    banner.appendChild(livePill);

    // Card viewport
    const track = document.createElement('div');
    track.className = 'tcws-call-banner-track';
    banner.appendChild(track);

    // Build all cards (stacked, invisible initially)
    const cards = liveCallsCache.map(call => {
      const card = _buildBannerCard(call);
      track.appendChild(card);
      return card;
    });

    // Counter badge (only shown when >1 call)
    let counter = null;
    if (cards.length > 1) {
      counter = document.createElement('div');
      counter.className = 'tcws-call-banner-counter';
      track.appendChild(counter);
      track.classList.add('has-counter'); // used by CSS to add right padding to cards
    }

    // Activate a card by index — exit old, crossfade in new
    function showCard(idx) {
      cards.forEach((c, i) => {
        if (i === idx) {
          // Refresh duration on the incoming card before it fades in (no stale numbers)
          const durEl = c.querySelector('.tcws-call-banner-dur[data-start-ms]');
          if (durEl) {
            const sm = Number(durEl.dataset.startMs);
            if (sm) durEl.textContent = fmtDuration(Date.now() - sm);
          }
          c.classList.remove('exit');
          c.classList.add('active');
        } else if (c.classList.contains('active')) {
          // Blank the duration immediately so it can't bleed through the crossfade
          // (all cards are absolutely stacked at inset:0, so their dur spans overlap)
          const exitDur = c.querySelector('.tcws-call-banner-dur');
          if (exitDur) exitDur.textContent = '';
          c.classList.remove('active');
          c.classList.add('exit');
          // Clean up exit class after fade-out completes (150ms)
          setTimeout(() => c.classList.remove('exit'), 160);
        }
      });
      if (counter) counter.textContent = `${idx + 1} / ${cards.length}`;
    }

    // Show first card immediately
    _bannerCardIdx = 0;
    showCard(0);

    // Flip timer — only when >1 call.  3.5 s per card (visible) + 0.22 s flip = feels ~3.75 s total
    if (cards.length > 1) {
      _bannerFlipTimer = setInterval(() => {
        if (!banner.isConnected) { _stopBannerTimers(); return; }
        _bannerCardIdx = (_bannerCardIdx + 1) % cards.length;
        showCard(_bannerCardIdx);
      }, 3500);
    }

    // Duration ticker — updates every second, only on the currently active card
    // (avoids numbers bleeding through on exiting cards during transition)
    _bannerDurTimer = setInterval(() => {
      if (!banner.isConnected) { _stopBannerTimers(); return; }
      const activeCard = track.querySelector('.tcws-call-banner-card.active');
      if (!activeCard) return;
      const durEl = activeCard.querySelector('.tcws-call-banner-dur[data-start-ms]');
      if (durEl) {
        const sm = Number(durEl.dataset.startMs);
        if (sm) durEl.textContent = fmtDuration(Date.now() - sm);
      }
    }, 1000);
  }

  function _syncCallsBadge() {
    const count = liveCallsCache.length;
    if (!panelEl) return;
    panelEl.querySelectorAll('[data-tcws-callsbadge]').forEach(b => {
      b.textContent = count > 0 ? String(count) : '';
      b.className   = 'tcws-tab-n' + (count > 0 ? ' vis' : '');
    });
  }

  // ─── Supervisor call actions ────────────────────────────────────────────────
  // Listen/Barge require an active WebRTC Talk session — Zendesk's REST monitor
  // endpoint returns 404 unless the supervisor already has an active call leg
  // registered in their Talk console session. The only reliable path is to use
  // the native /agent/calls console where WebRTC is already wired up.
  //
  // Strategy:
  //   1. Open (or focus) the Talk console in a named popup window
  //   2. Try the REST endpoint — it may succeed on accounts where the supervisor
  //      has an active Talk session (e.g. already online in the sidebar widget)
  //   3. Return { ok: true, native: true } if REST fails so the caller can
  //      show a contextual "use console" message instead of a red error
  // ─── Supervisor call actions ──────────────────────────────────────────────────
  // The REST monitor/barge endpoints (/api/v2/channels/voice/calls/{id}/monitor)
  // return 404 unless the supervisor has an active WebRTC call leg registered by
  // the native Talk console. A userscript cannot establish WebRTC, so we open the
  // console window and let the supervisor click Listen/Barge there directly.
  async function callAction(callId, action) {
    if (action === 'leave') {
      monitoredCallId = null;
      return { ok: true, native: true };
    }
    // Open (or focus) the native Talk console — WebRTC audio lives there
    try {
      const w = window.open('/agent/talk/live_calls', 'tcws_calls_console', 'width=1200,height=680,noopener=0');
      if (w) w.focus();
    } catch {}
    monitoredCallId = callId;
    return { ok: true, native: true };
  }

  function startCallsApiPoll() {
    if (callsApiTimer) clearInterval(callsApiTimer);
    pollLiveCalls(); // immediate first fetch
    callsApiTimer = setInterval(() => {
      pollLiveCalls();
      if (liveCallsCache.length) _updateCallBanner();
    }, 10_000); // 10 s — was 15 s; snappier without hammering the API
  }

  // ─── Agent Status Polling (Zendesk Talk / Availability) ──────────────────────
  // GET /api/v2/channels/voice/stats/agents_activity — returns all agent statuses
  async function pollAgentStatus() {
    // Handles both: { agents_activity: [...] }  and  { agents_activity: { agents: [...] } }
    try {
      const r = await fetch('/api/v2/channels/voice/stats/agents_activity.json', { credentials: 'same-origin' });
      if (!r.ok) return;
      const js = await r.json();
      const raw = js.agents_activity;
      const agents = Array.isArray(raw) ? raw
                   : Array.isArray(raw?.agents) ? raw.agents
                   : [];
      agents.forEach(a => {
        if (!a.agent_id) return;
        const existing = agentStatusCache[a.agent_id] || {};
        agentStatusCache[a.agent_id] = {
          id:       a.agent_id,
          name:     a.name || existing.name || `Agent ${a.agent_id}`,
          status:   _normalizeAgentStatus(a),
          photoUrl: a.avatar_url || existing.photoUrl || null,
        };
      });
      agentStatusLastAt = Date.now();
    } catch {}

    renderTeamSidebar();
  }



  function _normalizeAgentStatus(a) {
    // Real API fields: agent_state = "online"|"away"|"offline"
    //                  call_status = "on_call"|"wrap_up"|null
    const callSt = (a.call_status || '').toLowerCase();
    if (callSt === 'on_call')  return 'on_call';
    if (callSt === 'wrap_up')  return 'busy';
    const st = (a.agent_state || '').toLowerCase();
    if (st === 'online')       return 'online';
    if (st === 'away')         return 'away';
    return 'offline';
  }

  const AGENT_STATUS_LABELS = {
    online: 'Online', offline: 'Offline', on_call: 'On Call',
    transferred: 'Transfer', away: 'Away', busy: 'Wrap-up',
  };

  function startAgentStatusPoll() {
    if (agentStatusTimer) clearInterval(agentStatusTimer);
    pollAgentStatus();
    agentStatusTimer = setInterval(pollAgentStatus, 30_000);
  }

  // ─── Site View (group open tickets by wash location) ──────────────────────────
  async function fetchSiteViewTickets() {
    const r = await fetch(
      '/api/v2/search.json?query=type%3Aticket+status%3Aopen+status%3Apending&per_page=100&sort_by=updated_at&sort_order=desc&include=users',
      { credentials: 'same-origin' }
    );
    if (!r.ok) throw new Error('search_' + r.status);
    const js = await r.json();
    // Build a quick user lookup map (id → { name, email }) from sideloaded users
    const userMap = {};
    for (const u of (js.users || [])) userMap[u.id] = { name: u.name || '', email: (u.email || '').toLowerCase() };
    return { tickets: js.results || [], userMap };
  }

  async function pollSiteView() {
    if (siteViewPolling) return;
    siteViewPolling = true;
    try {
      const { tickets, userMap } = await fetchSiteViewTickets();
      const sites = {};
      for (const t of tickets) {
        const cf = {};
        for (const f of (t.custom_fields || [])) cf[String(f.id)] = f.value;
        const washName   = (cf[CF_WASH_NAME] || '').trim();
        const isWashDown = cf[CF_WASH_DOWN] === true;
        const isCritical = !!(cf[CF_CRITICAL]);
        const timeDown   = cf[CF_TIME_DOWN] || '';

        // If no Wash Name, check the requester
        if (!washName) {
          const req   = userMap[t.requester_id];
          const email = (req?.email || '');
          // External / franchise / vendor ticket — skip entirely (they'll never have a Wash Name)
          if (!email.endsWith('@teamtommys.com')) continue;
          // Internal TCWS ticket with no Wash Name — land in _unknown so we can follow up
          // Fall through with siteKey = '_unknown' and store requester name for accountability display
        }

        const siteKey = washName || '_unknown';
        const req = !washName ? userMap[t.requester_id] : null;

        if (!sites[siteKey]) {
          sites[siteKey] = {
            name:      siteKey === '_unknown' ? 'Unknown Site' : siteKey,
            tickets:   [],
            washDown:  false,
            critical:  false,
            timeDown:  '',
            hasUnnamed: siteKey === '_unknown',
          };
        }
        const site = sites[siteKey];
        site.tickets.push({
          id:            t.id,
          subject:       t.subject || '(no subject)',
          status:        t.status  || 'open',
          updated_at:    t.updated_at || '',
          washDown:      isWashDown,
          critical:      isCritical,
          timeDown,
          // For unknown-site tickets, record who submitted so we can chase them down
          requesterName: req?.name  || '',
          requesterEmail: req?.email || '',
        });
        if (isWashDown) { site.washDown = true; if (timeDown) site.timeDown = timeDown; }
        if (isCritical) site.critical = true;
      }
      // Sort: wash-down → critical → unknown last → alpha
      const order = Object.keys(sites).sort((a, b) => {
        const sa = sites[a], sb = sites[b];
        if (sb.washDown !== sa.washDown) return sb.washDown ? 1 : -1;
        if (sb.critical !== sa.critical) return sb.critical ? 1 : -1;
        if (a === '_unknown') return 1;
        if (b === '_unknown') return -1;
        return a.localeCompare(b);
      });
      siteViewCache = { sites, order, updatedAt: Date.now() };
      if (panelEl?.classList.contains('open') && activeTab === 'sites') panelEl._render?.();
    } catch (e) {
      console.warn('[TCWS-NM] pollSiteView error:', e);
    } finally {
      siteViewPolling = false;
    }
  }

  function startSiteViewPoll() {
    if (siteViewTimer) { clearInterval(siteViewTimer); siteViewTimer = null; }
    pollSiteView();
    siteViewTimer = setInterval(pollSiteView, 120_000);
  }
  function stopSiteViewPoll() {
    if (siteViewTimer) { clearInterval(siteViewTimer); siteViewTimer = null; }
  }

  // ─── Collision detection — reads Zendesk's own #agentCollisionViewerList ──────
  // Zendesk renders this list inside the ticket page whenever other agents are
  // viewing the same ticket. Agent names come from img[alt] attributes.
  // We watch it with a MutationObserver and maintain a per-tid viewer map.
  //
  function renderAgentStatusBar() {
    const bar = document.getElementById('tcws-agent-bar');
    if (!bar) return;

    const pinned = loadPinnedAgents().map(Number);
    bar.innerHTML = '';

    const lbl = document.createElement('span');
    lbl.className = 'tcws-agent-bar-lbl';
    lbl.textContent = 'Team:';
    bar.appendChild(lbl);

    const toShow = pinned.map(id => agentStatusCache[id]).filter(Boolean);

    if (!toShow.length) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:10px;color:var(--t-text3);font-style:italic';
      empty.textContent = 'Add via nav sidebar';
      bar.appendChild(empty);
      return;
    }

    for (const agent of toShow) {
      bar.appendChild(_buildAgentChip(agent, true));
    }
  }

  function _renderFlyoutList(listEl, query, pinned) {
    const pinnedSet = new Set(pinned.map(Number));
    const all = Object.values(agentStatusCache)
      .filter(a => !query || a.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    listEl.innerHTML = '';
    if (!all.length) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--t-text3);padding:4px 6px">No agents found</div>`;
      return;
    }
    for (const agent of all) {
      const row = document.createElement('div');
      row.className = 'tcws-agent-flyout-item';
      const av = _buildAvatarEl(agent, 18);
      const nameEl = document.createElement('span');
      nameEl.className = 'tcws-agent-flyout-item-name';
      nameEl.textContent = agent.name;
      const stEl = document.createElement('span');
      stEl.className = 'tcws-agent-flyout-item-status';
      stEl.textContent = AGENT_STATUS_LABELS[agent.status] || 'Unknown';
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button'; pinBtn.className = 'tcws-agent-flyout-item-pin' + (pinnedSet.has(Number(agent.id)) ? ' pinned' : '');
      pinBtn.textContent = pinnedSet.has(Number(agent.id)) ? 'Unpin' : 'Pin';
      pinBtn.addEventListener('click', e => {
        e.stopPropagation();
        const cur = loadPinnedAgents().map(Number);
        const aid = Number(agent.id);
        const idx = cur.indexOf(aid);
        if (idx === -1) cur.push(aid); else cur.splice(idx, 1);
        savePinnedAgents(cur);
        renderTeamSidebar();
        // Re-render flyout list so Pin/Unpin label flips instantly
        const query = document.querySelector('#tcws-agent-flyout-float input')?.value?.trim() || '';
        _renderFlyoutList(listEl, query, loadPinnedAgents());
      });
      row.appendChild(av); row.appendChild(nameEl); row.appendChild(stEl); row.appendChild(pinBtn);
      listEl.appendChild(row);
    }
  }

  function _buildAgentChip(agent, isPinned) {
    const chip = document.createElement('div');
    chip.className = 'tcws-agent-chip';
    chip.dataset.status = agent.status || 'offline';

    const av = _buildAvatarEl(agent, 20);
    const dot = document.createElement('span');
    dot.className = `tcws-agent-status-dot ${agent.status || 'offline'}`;
    const nm = document.createElement('span');
    nm.className = 'tcws-agent-name';
    nm.textContent = agent.name.split(' ')[0];

    chip.appendChild(av); chip.appendChild(dot); chip.appendChild(nm);

    // Click toggles popup — works reliably vs hover-only
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const existing = document.getElementById('tcws-agent-popup-float');
      if (existing) {
        // If this chip's popup is open, close it; otherwise switch to this one
        _hideAgentPopup();
        if (existing.dataset.agentId === String(agent.id)) return;
      }
      _showAgentPopup(chip, agent, isPinned);
    });

    return chip;
  }

  function _showAgentPopup(chip, agent, isPinned) {
    _hideAgentPopup();
    const popup = document.createElement('div');
    popup.id = 'tcws-agent-popup-float';
    popup.className = 'tcws-agent-popup-float';
    popup.innerHTML = `
      <div class="tcws-agent-popup-name">${escHtml(agent.name)}</div>
      <div class="tcws-agent-popup-status">
        <span class="tcws-agent-status-dot ${agent.status || 'offline'}" style="width:8px;height:8px;flex-shrink:0"></span>
        ${escHtml(AGENT_STATUS_LABELS[agent.status] || 'Unknown')}
      </div>`;
    if (agent.groups?.length) {
      const gDiv = document.createElement('div');
      gDiv.className = 'tcws-agent-popup-group';
      gDiv.textContent = agent.groups.join(', ');
      popup.appendChild(gDiv);
    }
    const pinAction = document.createElement('button');
    pinAction.type = 'button';
    pinAction.className = 'tcws-agent-popup-action' + (isPinned ? ' unpin' : '');
    pinAction.textContent = isPinned ? '✕ Unpin from bar' : '📌 Pin to bar';
    pinAction.addEventListener('click', e => {
      e.stopPropagation();
      const cur = loadPinnedAgents().map(Number);
      const aid = Number(agent.id);
      const idx = cur.indexOf(aid);
      if (idx === -1) cur.push(aid); else cur.splice(idx, 1);
      savePinnedAgents(cur);
      _hideAgentPopup();
      renderTeamSidebar();
    });
    popup.appendChild(pinAction);

    // Tag popup with agent id so we can detect "same chip clicked again"
    popup.dataset.agentId = String(agent.id);
    document.body.appendChild(popup);

    // Defer positioning until browser has painted and offsetWidth is real
    requestAnimationFrame(() => {
      const rect = chip.getBoundingClientRect();
      const pw   = popup.offsetWidth || 180;
      let left   = rect.left + rect.width / 2 - pw / 2;
      const panelEl2 = document.querySelector('.tcws-panel.open');
      if (panelEl2) {
        const pr = panelEl2.getBoundingClientRect();
        left = Math.max(pr.left + 6, Math.min(left, pr.right - pw - 6));
      }
      popup.style.top  = `${rect.bottom + 5}px`;
      popup.style.left = `${Math.max(4, left)}px`;
    });

    // Close on outside click
    const onOutsidePopup = e => {
      if (!popup.contains(e.target) && e.target !== chip) {
        _hideAgentPopup();
        document.removeEventListener('mousedown', onOutsidePopup, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutsidePopup, true), 10);
  }

  function _hideAgentPopup() {
    const old = document.getElementById('tcws-agent-popup-float');
    if (old) old.remove();
  }

  // ─── Team Sidebar (nav) ───────────────────────────────────────────────────────
  // ensureNavSidebar: creates/positions the <li> and + button. Called from the
  // boot retry loop — no API data needed, fires as soon as both nav <ul>s exist.
  function ensureNavSidebar() {
    // The nav always has two <ul data-garden-id="chrome.nav_list"> elements:
    //   [0] = main nav (Home, Views, … Admin, TCWS button)
    //   [1] = apps nav (whatever apps are installed)
    // We append our <li> to the apps <ul> so it appears last, regardless of
    // which apps are present.
    const navLists = document.querySelectorAll(NAV_LIST_SEL);
    const appsUl   = navLists[navLists.length - 1];
    if (!appsUl || navLists.length < 2) return false; // apps ul not ready yet

    let sidebarLi = document.getElementById('tcws-team-sidebar-li');
    if (!sidebarLi) {
      sidebarLi = document.createElement('li');
      sidebarLi.id        = 'tcws-team-sidebar-li';
      sidebarLi.className = 'tcws-nav-li';
    }
    if (sidebarLi.parentElement !== appsUl) appsUl.appendChild(sidebarLi);
    // Respect feature toggle — hide immediately if teamBar disabled
    sidebarLi.style.display = featEnabled('teamBar') ? '' : 'none';

    let sidebar = document.getElementById('tcws-team-sidebar');
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.id = 'tcws-team-sidebar';
      sidebarLi.appendChild(sidebar);
    }

    // + button — always first, created once
    if (!document.getElementById('tcws-team-sidebar-add')) {
      const addBtn = document.createElement('button');
      addBtn.id          = 'tcws-team-sidebar-add';
      addBtn.type        = 'button';
      addBtn.className   = 'tcws-team-add-btn';
      addBtn.title       = 'Add / remove team members';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        _showAgentFlyout(addBtn, loadPinnedAgents());
      });
      sidebar.insertBefore(addBtn, sidebar.firstChild);
    }
    return true;
  }

  function renderTeamSidebar() {
    if (!ensureNavSidebar()) return; // nav not ready yet

    const sidebar   = document.getElementById('tcws-team-sidebar');
    const pinned    = loadPinnedAgents().map(Number);
    const pinnedSet = new Set(pinned.map(String));
    const toShow    = pinned.map(id => agentStatusCache[id]).filter(Boolean);

    // Remove cards for agents no longer pinned
    sidebar.querySelectorAll('.tcws-team-card').forEach(el => {
      if (!pinnedSet.has(el.dataset.agentId)) el.remove();
    });

    // Create/update a card per pinned agent
    for (const agent of toShow) {
      const aid       = String(agent.id);
      const newStatus = agent.status || 'offline';
      const prevSt    = agentPrevStatus[aid];
      const changed   = prevSt !== undefined && prevSt !== newStatus;

      let card = document.getElementById(`tcws-tsc-${aid}`);

      if (!card) {
        // ── Build card from scratch ─────────────────────────────────────────────
        card = document.createElement('div');
        card.id = `tcws-tsc-${aid}`;
        card.className = 'tcws-team-card';
        card.dataset.agentId = aid;
        card.dataset.status  = newStatus;

        const inner = document.createElement('div');
        inner.className = 'tcws-team-card-inner';

        const av = _buildAvatarEl(agent, 24);
        av.className = (av.className || '') + ' tcws-tsc-av';

        const dot = document.createElement('span');
        dot.className = `tcws-agent-status-dot tcws-tsc-dot ${newStatus}`;

        const nm = document.createElement('div');
        nm.className = 'tcws-team-card-name tcws-tsc-nm';
        nm.textContent = agent.name.split(' ')[0];

        const st = document.createElement('div');
        st.className = 'tcws-team-card-status tcws-tsc-st';
        st.textContent = (AGENT_STATUS_LABELS[newStatus] || 'Offline').toUpperCase();

        inner.appendChild(av); inner.appendChild(dot);
        inner.appendChild(nm); inner.appendChild(st);
        card.appendChild(inner);

        card.addEventListener('click', e => {
          e.stopPropagation();
          const existing = document.getElementById('tcws-agent-popup-float');
          if (existing) {
            _hideAgentPopup();
            if (existing.dataset.agentId === aid) return;
          }
          _showAgentPopup(card, agent, true);
        });

        // Append card after the + button (+ is always first)
        sidebar.appendChild(card);

      } else if (changed) {
        // ── Flip animation on status change ────────────────────────────────────
        card.dataset.status = newStatus;
        card.classList.add('flipping');

        // At midpoint of flip (scaleX hits 0) swap the visible content
        setTimeout(() => {
          const dot = card.querySelector('.tcws-tsc-dot');
          const st  = card.querySelector('.tcws-tsc-st');
          if (dot) dot.className = `tcws-agent-status-dot tcws-tsc-dot ${newStatus}`;
          if (st)  st.textContent = (AGENT_STATUS_LABELS[newStatus] || 'Offline').toUpperCase();
        }, 200);

        // Remove class after animation completes
        setTimeout(() => card.classList.remove('flipping'), 480);
      }

      agentPrevStatus[aid] = newStatus;
    }
  }

  function _showAgentFlyout(_anchorEl, _pinned) {
    // Toggle: if already open, close it
    const existing = document.getElementById('tcws-agent-picker');
    if (existing) { _closeAgentPicker(); return; }

    const picker = document.createElement('div');
    picker.id = 'tcws-agent-picker';
    picker.className = 'tcws-panel';
    applyTheme(loadTheme(), picker);
    document.body.appendChild(picker);

    const inner = document.createElement('div');
    inner.className = 'tcws-panel-inner';
    picker.appendChild(inner);

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'tcws-ap-header';
    const ttl = document.createElement('span');
    ttl.className = 'tcws-ap-title';
    ttl.textContent = 'TEAM MEMBERS';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tcws-ap-close'; closeBtn.textContent = '×';
    closeBtn.addEventListener('click', _closeAgentPicker);
    hdr.appendChild(ttl); hdr.appendChild(closeBtn);
    inner.appendChild(hdr);

    // Search
    const srchWrap = document.createElement('div');
    srchWrap.className = 'tcws-ap-search';
    const srchInp = document.createElement('input');
    srchInp.type = 'text'; srchInp.placeholder = 'Search agents…';
    srchWrap.appendChild(srchInp);
    inner.appendChild(srchWrap);

    // List
    const listEl = document.createElement('div');
    listEl.className = 'tcws-ap-list';
    inner.appendChild(listEl);

    const renderList = query => {
      const pinned = new Set(loadPinnedAgents().map(Number));
      const all = Object.values(agentStatusCache)
        .filter(a => !query || a.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));
      listEl.innerHTML = '';
      if (!all.length) {
        listEl.innerHTML = '<div style="font-size:12px;color:var(--t-text3);padding:10px 12px">No agents found</div>';
        return;
      }
      for (const agent of all) {
        const row = document.createElement('div');
        row.className = 'tcws-ap-item';
        const av = _buildAvatarEl(agent, 22);
        const dot = document.createElement('span');
        dot.className = `tcws-agent-status-dot ${agent.status || 'offline'}`;
        dot.style.cssText = 'width:7px;height:7px;flex-shrink:0';
        const info = document.createElement('div');
        info.className = 'tcws-ap-item-info';
        info.innerHTML = `<div class="tcws-ap-item-name">${escHtml(agent.name)}</div>
          <div class="tcws-ap-item-status">${escHtml(AGENT_STATUS_LABELS[agent.status] || 'Offline')}</div>`;
        const isPinned = pinned.has(Number(agent.id));
        const btn = document.createElement('button');
        btn.className = 'tcws-ap-item-btn' + (isPinned ? ' added' : '');
        btn.textContent = isPinned ? 'Remove' : 'Add';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const cur = loadPinnedAgents().map(Number);
          const aid = Number(agent.id);
          const idx = cur.indexOf(aid);
          if (idx === -1) cur.push(aid); else cur.splice(idx, 1);
          savePinnedAgents(cur);
          renderTeamSidebar();
          renderList(srchInp.value.trim());
        });
        row.appendChild(av); row.appendChild(dot); row.appendChild(info); row.appendChild(btn);
        listEl.appendChild(row);
      }
    };

    renderList('');
    srchInp.addEventListener('input', () => renderList(srchInp.value.trim()));

    // Position to the right of the main panel (same as detail panel)
    picker.classList.add('open');
    requestAnimationFrame(() => {
      applyTheme(loadTheme(), picker);
      const pr = panelEl.getBoundingClientRect();
      const ph = picker.offsetHeight || 400;
      let top = pr.top;
      if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
      if (top < 8) top = 8;
      const leftPos = pr.right + 8;
      picker.style.top  = `${top}px`;
      picker.style.left = `${leftPos}px`;
      picker.style.maxHeight = `${Math.max(pr.height, window.innerHeight * 0.9)}px`;
    });

    srchInp.focus();
  }

  function _closeAgentPicker() {
    const p = document.getElementById('tcws-agent-picker');
    if (p) p.remove();
  }

  function _buildAvatarEl(agent, size) {
    if (agent.photoUrl) {
      const img = document.createElement('img');
      img.className = 'tcws-agent-avatar';
      img.src = agent.photoUrl; img.alt = agent.name;
      img.style.width = img.style.height = `${size}px`;
      img.onerror = () => { img.style.display = 'none'; };
      return img;
    }
    const div = document.createElement('div');
    div.className = 'tcws-agent-avatar-init';
    div.style.width = div.style.height = `${size}px`;
    div.style.fontSize = `${Math.floor(size * 0.42)}px`;
    div.textContent = (agent.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return div;
  }

  // ─── User & Groups fetch ──────────────────────────────────────────────────────
  async function fetchCurrentUser() {
    try {
      const r = await fetch('/api/v2/users/me.json', { credentials: 'same-origin' });
      if (!r.ok) return;
      const js = await r.json();
      currentUser = { id: js.user?.id, name: js.user?.name, email: js.user?.email };
      _updateRolePicker();
    } catch {}
  }
  async function fetchGroups() {
    try {
      // Use user-specific groups endpoint — returns only groups this agent belongs to.
      // Falls back to /api/v2/groups.json if user id not yet loaded.
      const uid = currentUser?.id;
      const url = uid
        ? `/api/v2/users/${uid}/groups.json`
        : '/api/v2/groups.json';
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) return;
      const js = await r.json();
      availGroups = (js.groups || [])
        .map(g => ({ id: g.id, name: g.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      _updateRolePicker();
    } catch {}
  }
  function _updateRolePicker() {
    const picker = document.getElementById('tcws-role-picker');
    if (!picker || !availGroups.length) return;
    const curId   = loadActiveRoleId();
    const curName = loadActiveRole();
    // Validate that the saved ID actually exists in the available groups list.
    // If not (e.g. a stale group ID from a different role/session), clear it.
    const validGroup = availGroups.find(g => g.id === curId) || availGroups.find(g => g.name === curName);
    if (curId && !validGroup) {
      // Stale / invalid group ID — clear it to prevent bad assignments
      saveActiveRole('');
      saveActiveRoleId(null);
    }
    const resolvedId   = validGroup ? validGroup.id   : null;
    const resolvedName = validGroup ? validGroup.name : '';
    picker.innerHTML = '<option value="">No group</option>' +
      availGroups.map(g => {
        const sel = (resolvedId && g.id === resolvedId) ? 'selected' : '';
        return `<option value="${g.id}" ${sel}>${escHtml(g.name)}</option>`;
      }).join('');
    if (validGroup) { saveActiveRole(resolvedName); saveActiveRoleId(resolvedId); }
  }

  // ─── Take It ─────────────────────────────────────────────────────────────────

  // Comprehensive CSRF token resolution for Zendesk same-origin requests.
  // Zendesk does NOT always use a <meta> tag — it often embeds the token in
  // window globals or inline script JSON. We try every known location.
  function getCsrfToken() {
    // 1. Standard Rails meta tag (some ZD instances)
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta?.content) return meta.content;

    // 2. Zendesk global window vars (varies by ZD version)
    for (const key of ['authenticity_token', '_token', 'zendesk_csrf_token', 'zd_csrf_token', '__CSRF_TOKEN__']) {
      if (window[key] && typeof window[key] === 'string') return window[key];
    }

    // 3. Search inline <script> tags for authenticity_token JSON field
    try {
      for (const s of document.querySelectorAll('script:not([src])')) {
        const m = s.textContent.match(/"authenticity_token"\s*:\s*"([^"]{20,})"/);
        if (m) return m[1];
      }
    } catch {}

    // 4. window.__pageData (Zendesk embeds some config here)
    try {
      const pd = window.__pageData || window.pageData;
      if (pd?.authenticity_token) return pd.authenticity_token;
    } catch {}

    return null;
  }

  // Attempt to click Zendesk's native "take it" button if this ticket is
  // currently open in the active tab URL. This bypasses all API/CSRF issues.
  function _tryNativeTakeIt(tid) {
    // Only works if the ticket detail page is currently loaded
    if (!location.pathname.includes(`/tickets/${tid}`)) return false;
    const btn = document.querySelector('[data-test-id="assignee-field-take-it-button"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  // Assign the ticket's group via the assignee-field autocomplete DOM.
  // When a group is selected in our role picker, we need to reflect it in
  // Zendesk's own assignee field dropdown so the "take it" action picks up
  // the right group. This forces the group dropdown to the right value.
  async function _setNativeGroup(groupName) {
    if (!groupName) return;
    // Find the group-tag div that shows the current group
    const groupTag = document.querySelector('[data-test-id="assignee-field-selected-group-tag"]');
    if (!groupTag) return;
    const input = document.querySelector('#downshift-5-input, [data-test-id="assignee-field-autocomplete-trigger"] input');
    if (!input) return;

    // Focus the input to open the dropdown
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    // Type the group name to filter options
    input.value = groupName;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    await new Promise(r => setTimeout(r, 250));
    // Look for a matching option in the dropdown
    const opts = document.querySelectorAll('[data-test-id="assignee-field-dropdown-menu"] [role="option"], [id^="downshift-5-item"]');
    for (const opt of opts) {
      if (opt.textContent?.trim().toLowerCase().includes(groupName.toLowerCase())) {
        opt.click();
        await new Promise(r => setTimeout(r, 100));
        return;
      }
    }
    // If no option found, escape out to leave field clean
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  }

  async function takeTicket(tid) {
    if (!currentUser?.id) {
      alert('TCWS: User info not loaded yet. Try again in a moment.');
      return false;
    }

    // ── Path 1: Native "take it" button (ticket open in current tab) ──────────
    // This is the most reliable path — it uses Zendesk's own UI so no CSRF/
    // permissions issues. Only works if you're on that ticket's detail page.
    const activeRole = loadActiveRole();
    if (location.pathname.includes(`/tickets/${tid}`)) {
      // If a group is selected and differs from current, set it first
      if (activeRole) await _setNativeGroup(activeRole);
      if (_tryNativeTakeIt(tid)) {
        delete ticketCache[String(tid)];
        return true;
      }
    }

    // ── Path 2: Zendesk REST API PUT with CSRF + X-Requested-With ─────────────
    const payload = { ticket: { assignee_id: currentUser.id } };
    const grpId = loadActiveRoleId();
    // Only include group_id if the ID matches a real group in our loaded list.
    // This prevents stale/wrong IDs (like a group ID being sent as an agent ID) from
    // causing the ticket to land under the wrong team.
    const isValidGroup = grpId && availGroups.some(g => g.id === grpId);
    if (isValidGroup) payload.ticket.group_id = grpId;

    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    try {
      const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        console.warn(`[TCWS-NM] Take It API failed ${r.status}:`, errBody);

        // 403 with no CSRF token → guide the user
        if (r.status === 403) {
          const msg = csrf
            ? `403 Forbidden — your account may not have permission to reassign ticket #${tid}.\n\nOpen the ticket directly and use the native "take it" button.`
            : `403 Forbidden — could not obtain CSRF token.\n\nOpen ticket #${tid} in the agent view, then click "Take It" from there — the button will work natively.`;
          alert(`TCWS: ${msg}`);
        }
        return false;
      }
      delete ticketCache[String(tid)];
      return true;
    } catch (e) {
      console.warn('[TCWS-NM] Take It error:', e);
      return false;
    }
  }

  // ─── Ticket API ───────────────────────────────────────────────────────────────
  const ticketCache = {};
  async function fetchViaTickets(viewId, n) {
    const r = await fetch(`/api/v2/views/${encodeURIComponent(viewId)}/tickets.json?per_page=${n}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    return ((await r.json()).tickets || []).map(t => t?.id).filter(Boolean);
  }
  async function fetchViaExecute(viewId, n) {
    const r = await fetch(`/api/v2/views/${encodeURIComponent(viewId)}/execute.json?per_page=${n}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    return ((await r.json()).rows || []).map(row => row?.ticket?.id || row?.id || row?.ticket_id).filter(Boolean);
  }
  async function fetchIds(viewId, n = 25) {
    const mode = loadApiMode();
    if (mode === 'tickets') { try { return await fetchViaTickets(viewId, n); } catch {} }
    if (mode === 'execute') { try { return await fetchViaExecute(viewId, n); } catch {} }
    try { const ids = await fetchViaTickets(viewId, n); saveApiMode('tickets'); return ids; } catch {}
    const ids = await fetchViaExecute(viewId, n); saveApiMode('execute'); return ids;
  }

  // ─── Views API (replaces DOM scraping) ────────────────────────────────────────
  const VIEWS_CACHE_TTL = 30 * 60 * 1000; // 30 min

  async function fetchCompactViews() {
    const r = await fetch('/api/v2/views/compact', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    return (js.views || [])
      .filter(v => v.active !== false)
      .map(v => ({ viewKey: String(v.id), title: v.title || String(v.id) }));
  }

  // Batch-fetch counts for an array of view IDs via count_many (50 IDs per request).
  // Falls back to individual /count calls if count_many returns nothing (some ZD plans don't support it).
  async function fetchViewCounts(viewIds) {
    if (!viewIds.length) return {};
    const BATCH = 50;
    const out   = {};
    for (let i = 0; i < viewIds.length; i += BATCH) {
      const chunk = viewIds.slice(i, i + BATCH);
      try {
        const r = await fetch(`/api/v2/views/count_many?ids=${chunk.join(',')}`, { credentials: 'same-origin' });
        if (!r.ok) continue;
        const js = await r.json();
        for (const vc of (js.view_counts || [])) {
          // Zendesk returns `value` in count_many; guard with `count` as fallback
          const val = vc.value ?? vc.count;
          if (val != null) out[String(vc.view_id)] = Number(val);
        }
      } catch {}
    }
    // If count_many returned nothing at all, fall back to individual count endpoints.
    // This handles ZD plans where count_many is unsupported or returns an empty array.
    if (!Object.keys(out).length && viewIds.length) {
      const FALLBACK_MAX = 20; // cap to avoid hammering API
      for (const id of viewIds.slice(0, FALLBACK_MAX)) {
        try {
          const r = await fetch(`/api/v2/views/${encodeURIComponent(id)}/count.json`, { credentials: 'same-origin' });
          if (!r.ok) continue;
          const js = await r.json();
          const val = js.view_count?.value ?? js.view_count?.count;
          if (val != null) out[String(id)] = Number(val);
        } catch {}
      }
    }
    return out;
  }

  // Returns cached views list, re-fetching from API if stale or forced
  async function fetchAndCacheViews(force) {
    const stale = force || (Date.now() - loadViewsCacheAt() > VIEWS_CACHE_TTL);
    if (!stale) {
      const cached = loadViewsCache();
      if (cached.length) return cached;
    }
    try {
      const views = await fetchCompactViews();
      saveViewsCache(views);
      saveViewsCacheAt(Date.now());
      return views;
    } catch (e) {
      console.warn('[TCWS-NM] fetchAndCacheViews error:', e);
      return loadViewsCache(); // fall back to potentially stale cache
    }
  }
  async function fetchTicketDetail(tid) {
    if (ticketCache[tid]) return ticketCache[tid];
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json?include=users`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    const t = js.ticket || {};
    const users = Array.isArray(js.users) ? js.users : [];
    const req   = users.find(u => u.id === t.requester_id);
    const asg   = users.find(u => u.id === t.assignee_id);
    const data  = {
      id: t.id,
      subject: t.subject || '(no subject)',
      status: t.status || 'unknown',
      type: t.type || '',
      priority: t.priority || '',
      requester: req ? req.name : '',
      requester_email: req ? req.email : '',
      assignee_id: t.assignee_id || 0,
      assignee: asg ? asg.name : '',
      organization_id: t.organization_id || 0,
      updated_at: t.updated_at || '',
      created_at: t.created_at || '',
      tags: Array.isArray(t.tags) ? t.tags : [],
      description: (t.description || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      via: t.via?.channel || '',
    };
    ticketCache[tid] = data; return data;
  }

  // ─── Ticket audit helpers ─────────────────────────────────────────────────────
  async function fetchTicketAudits(tid, per = 25) {
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}/audits.json?per_page=${per}&include=users`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    const audits = Array.isArray(js.audits) ? js.audits : [];
    const users  = Array.isArray(js.users)  ? js.users  : [];
    const uMap = {};
    for (const u of users) if (u && u.id) uMap[u.id] = (u.name || u.email || String(u.id));
    return { audits, uMap };
  }
  // ─── Custom / standard ticket fields ─────────────────────────────────────────
  // Cache the field definitions (id → title) so we don't fetch on every open.
  let _ticketFieldDefs = null;
  async function fetchTicketFieldDefs() {
    if (_ticketFieldDefs) return _ticketFieldDefs;
    const r = await fetch('/api/v2/ticket_fields.json?per_page=100', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    const map = {};
    for (const f of (js.ticket_fields || [])) {
      map[f.id] = f.title || f.raw_title || String(f.id);
    }
    _ticketFieldDefs = map;
    return map;
  }
  async function fetchRawTicketFields(tid) {
    // Returns the raw ticket object including custom_fields array
    const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    return js.ticket || {};
  }

  // ─── Org interaction history ──────────────────────────────────────────────────
  // Fetch recent tickets for the same organization (or requester) to show
  // in the detail panel's interaction history section.
  const _orgHistoryCache = {}; // orgId → { at, tickets }
  async function fetchOrgHistory(orgId, requesterId) {
    if (!orgId && !requesterId) return [];
    const cacheKey = orgId ? `org_${orgId}` : `req_${requesterId}`;
    const cached = _orgHistoryCache[cacheKey];
    if (cached && Date.now() - cached.at < 90_000) return cached.tickets;

    try {
      let url;
      if (orgId) {
        url = `/api/v2/organizations/${encodeURIComponent(orgId)}/tickets.json?per_page=20&sort_by=updated_at&sort_order=desc`;
      } else {
        url = `/api/v2/users/${encodeURIComponent(requesterId)}/tickets/requested.json?per_page=20&sort_by=updated_at&sort_order=desc`;
      }
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) return [];
      const js = await r.json();
      const tickets = (js.tickets || []).map(t => ({
        id: t.id,
        subject: t.subject || '(no subject)',
        status: t.status,
        updated_at: t.updated_at,
        type: t.type,
        priority: t.priority,
      }));
      _orgHistoryCache[cacheKey] = { at: Date.now(), tickets };
      return tickets;
    } catch { return []; }
  }

  // Cache individual field definitions (for combobox option lists)
  const _fieldOptionsCache = {};
  async function fetchFieldOptions(fieldId) {
    if (_fieldOptionsCache[fieldId]) return _fieldOptionsCache[fieldId];
    const r = await fetch(`/api/v2/ticket_fields/${encodeURIComponent(fieldId)}.json`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    const js = await r.json();
    const opts = (js.ticket_field?.custom_field_options || []).map(o => ({
      value: o.value,
      label: o.raw_name || o.name || o.value,
    }));
    _fieldOptionsCache[fieldId] = opts;
    return opts;
  }

  // CA1 (Content Area) option value → CA2 field ID.
  // CA1 values are Zendesk tagger strings; matched loosely against the CA2 field names.
  // Key = normalized CA2 field name suffix (lowercase, spaces→_, slashes stripped).
  const CA1_TO_CA2_FIELD = {
    'air_compressors':             15681205949847,
    'airlift_doors':               15681245125143,
    'lpr_recognition':             15758945656087,
    'all_in_one':                  15758974801943,
    'blowers':                     15758998034199,
    'arches':                      15759006905623,
    'building':                    15759027636887,
    'city_booster_pump':           15759074530583,
    'conveyor':                    15759213092631,
    'dashboard':                   15759240936983,
    'entrance_module':             15759303443607,
    'exit_module':                 15759337291927,
    'flight_deck':                 15759425414551,
    'geovision':                   15759449956247,
    'hmi':                         15759472374423,
    'hvac':                        15759491703575,
    'heated_blowers':              15759497080087,
    'hydraulics':                  15759544803479,
    'it_email_access_isp_phone':   15759550273943,
    'mat_washer':                  15759560090903,
    'lane_controller_lane_gates':  15759598852119,
    'mccs':                        15759635995287,
    'plc':                         15759649030679,
    'pods':                        15759669299479,
    'pos':                         15759712259735,
    'reclaim':                     15759811530519,
    'ro':                          15759828585751,
    'push_button_station':         15759830106647,
    'sensors':                     15759886621463,
    'sic_it_cabinet':              15760125816727,
    'signage':                     15760136903959,
    'tire_shine':                  15760144112407,
    'vacuums':                     15760204632727,
    'water_heaters':               15760223174679,
    'water_softeners':             15760225708823,
    'wraps_rockers_huggers_mitters':15760242875671,
    'manager_app':                 19402198476055,
    'witness':                     25352149696663,
    'water_treatment_center':      25352153913751,
    'non_standard':                25352202458775,
  };
  // Resolve a CA1 tagger value string to the matching CA2 field ID.
  // Normalizes by lowercasing and stripping non-alphanumeric chars.
  function _ca1ToCA2FieldId(ca1Value) {
    if (!ca1Value) return null;
    const norm = v => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const key = norm(ca1Value);
    // Direct match
    if (CA1_TO_CA2_FIELD[key] !== undefined) return CA1_TO_CA2_FIELD[key];
    // Fuzzy: find best key that is contained in or contains the query
    for (const [k, id] of Object.entries(CA1_TO_CA2_FIELD)) {
      if (key.includes(k) || k.includes(key)) return id;
    }
    return null;
  }

  function _maxAuditId(audits) {
    let mx = 0;
    for (const a of audits) { const id = a && a.id ? Number(a.id) : 0; if (id > mx) mx = id; }
    return mx;
  }
  function _summarizeBody(body, max = 180) {
    const s = String(body || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? (s.slice(0, max - 1) + '…') : s;
  }
  function _parseMergedIntoIdFromText(body) {
    const s = String(body || '');
    let m = s.match(/merged\s+into\s+request[^#\d]*#?(\d{5,})/i);
    if (m) return Number(m[1]) || 0;
    m = s.match(/\/agent\/tickets\/(\d{5,})/i);
    if (m) return Number(m[1]) || 0;
    m = s.match(/rel=["']ticket["'][^>]*>\s*#(\d{5,})/i);
    if (m) return Number(m[1]) || 0;
    return 0;
  }
  function _mergeTargetIdFromEvent(ev) {
    if (!ev) return 0;
    const keys = ['merged_into_ticket_id','merged_into_id','to_ticket_id','to_id',
      'target_ticket_id','target_id','destination_ticket_id','destination_id','new_ticket_id','new_id'];
    for (const k of keys) { const v = ev[k]; const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
    const toId = Number(ev?.to?.id || 0); if (toId > 0) return toId;
    const tgtId = Number(ev?.target?.id || 0); if (tgtId > 0) return tgtId;
    return Number(_parseMergedIntoIdFromText(ev.value || ev.body || ev.text || '')) || 0;
  }
  function _extractCommentUpdates(audits, uMap, sinceAuditId) {
    const out = [];
    const seen = new Set();
    function push(kind, text) {
      const k = String(kind || 'update'), t = String(text || '').trim();
      if (!t) return;
      const key = k + '|' + t; if (seen.has(key)) return; seen.add(key);
      out.push({ kind: k, text: t });
    }
    const newer = (audits || []).filter(a => (Number(a?.id) || 0) > (Number(sinceAuditId) || 0));
    newer.sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0));
    for (const au of newer) {
      const author = uMap && au?.author_id ? (uMap[au.author_id] || '') : '';
      const events = Array.isArray(au?.events) ? au.events : [];
      for (const ev of events) {
        if (!ev?.type) continue;
        if (ev.type === 'Comment') {
          const body = ev.body || '';
          if (!String(body).trim()) continue;
          const pub = ev.public === true;
          const label = pub ? 'Public reply' : 'Internal note';
          const by = author ? ` by ${author}` : '';
          push(pub ? 'reply' : 'note', `${label} added${by}: ${_summarizeBody(body)}`);
          const mergeId = _parseMergedIntoIdFromText(body);
          if (mergeId) push('merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`);
          continue;
        }
        if (/merge/i.test(String(ev.type))) {
          const mergeId = _mergeTargetIdFromEvent(ev);
          if (mergeId) push('merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`);
          continue;
        }
        const fn = String(ev.field_name || ev.field || '').toLowerCase();
        if (fn && fn.includes('merge')) {
          const mergeId = _mergeTargetIdFromEvent(ev) || Number(ev?.value || ev?.new_value || ev?.new || 0) || 0;
          if (mergeId) push('merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`);
        }
      }
    }
    return { updates: out, maxId: newer.length ? _maxAuditId(newer) : 0 };
  }

  // ─── Alert ticket tracking ────────────────────────────────────────────────────
  function _ensureTicketMeta(alertObj, tid) {
    if (!alertObj.tmeta) alertObj.tmeta = {};
    if (!alertObj.tmeta[tid]) alertObj.tmeta[tid] = { snap: null, updates: [], lastAuditId: 0 };
    if (!Array.isArray(alertObj.tmeta[tid].updates)) alertObj.tmeta[tid].updates = [];
    return alertObj.tmeta[tid];
  }
  function _pushTicketUpdate(rec, kind, text, atMs) {
    rec.updates.push({ at: atMs || Date.now(), kind: kind || 'update', text: String(text || '').trim() });
    if (rec.updates.length > 60) rec.updates = rec.updates.slice(-60);
  }

  // Sound levels for each change type
  const CHANGE_SOUND = {
    reply:  'warning',  // requester replied - important
    note:   'info',     // internal note
    pickup: 'info',     // assignment
    update: 'info',     // general assignment change
    status: 'info',     // status change
    merge:  'warning',  // merged (notable)
  };

  async function rescanActiveAlertTickets() {
    const unread = loadUnread();
    const keys = Object.keys(unread || {});
    if (!keys.length) return false;

    let changed = false;
    const now = Date.now();
    const deskLines = [];

    for (const viewKey of keys) {
      const a = unread[viewKey];
      if (!a || a.isWatch) continue;
      const tickets = Array.isArray(a.tickets) ? a.tickets.map(String) : [];
      if (!tickets.length) continue;

      for (const tid of tickets) {
        const rec = _ensureTicketMeta(a, tid);
        try {
          delete ticketCache[tid];
          const d = await fetchTicketDetail(tid);
          const snap = {
            status:      String(d.status || ''),
            subject:     String(d.subject || ''),
            assignee_id: Number(d.assignee_id || 0),
            assignee:    String(d.assignee || ''),
            updated_at:  String(d.updated_at || ''),
          };

          // Record ticket seen in stats
          recordTicketSeen(tid, viewKey, a.title || viewKey);

          if (!rec.snap) {
            // ── Auto-move on first observation: ticket may already be resolved/assigned ──
            if (['solved', 'closed'].includes(snap.status)) {
              // Already resolved/closed — move straight to Resolved tab
              addResolved({
                id: tid, subject: d.subject, status: snap.status,
                mergedInto: null, resolvedAt: now,
                solvedBy: snap.assignee || '', viewTitle: a.title || viewKey, viewKey,
              });
              if (Array.isArray(a.tickets)) {
                a.tickets = a.tickets.filter(t => String(t) !== String(tid));
                if (a.tickets.length === 0) delete unread[viewKey];
              }
              changed = true;
              rec.snap = snap;
              continue;
            }
            if (snap.assignee_id) {
              // Already assigned — move straight to Assigned tab
              addAssigned({
                id: tid, subject: d.subject, assignee: snap.assignee,
                assignee_id: snap.assignee_id, at: now, viewTitle: a.title || viewKey,
              });
              if (Array.isArray(a.tickets)) {
                a.tickets = a.tickets.filter(t => String(t) !== String(tid));
                if (a.tickets.length === 0) delete unread[viewKey];
              }
              changed = true;
              rec.snap = snap;
              continue;
            }
            // Ticket is open and unassigned — store initial snapshot and check audit history
            rec.snap = snap;
            try {
              const { audits, uMap } = await fetchTicketAudits(tid, 25);
              const maxId = _maxAuditId(audits);
              if (!rec.lastAuditId) rec.lastAuditId = maxId;
              let foundMerge = false;
              for (const au of (audits || [])) {
                const author = uMap && au?.author_id ? (uMap[au.author_id] || '') : '';
                const events = Array.isArray(au?.events) ? au.events : [];
                for (const ev of events) {
                  if (!ev?.type) continue;
                  if (ev.type === 'Comment') {
                    const mergeId = _parseMergedIntoIdFromText(ev.body || '');
                    if (mergeId) { foundMerge = true; _pushTicketUpdate(rec, 'merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`, now); break; }
                  } else if (/merge/i.test(String(ev.type))) {
                    const mergeId = _mergeTargetIdFromEvent(ev);
                    if (mergeId) { foundMerge = true; _pushTicketUpdate(rec, 'merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`, now); break; }
                  }
                  const fn = String(ev.field_name || ev.field || '').toLowerCase();
                  if (fn.includes('merge')) {
                    const mergeId = _mergeTargetIdFromEvent(ev) || Number(ev?.value || 0) || 0;
                    if (mergeId) { foundMerge = true; _pushTicketUpdate(rec, 'merge', `Closed and merged into #${mergeId}${author ? ` (by ${author})` : ''}`, now); break; }
                  }
                }
                if (foundMerge) break;
              }
            } catch {
              if (!rec.lastAuditId) {
                try { const { audits } = await fetchTicketAudits(tid, 1); rec.lastAuditId = _maxAuditId(audits); } catch {}
              }
            }
            continue;
          }

          const prev = rec.snap;
          let hadDelta = false;
          let soundKind = null;

          // Assignee / pickup detection
          if (Number(prev.assignee_id || 0) !== Number(snap.assignee_id || 0)) {
            hadDelta = true;
            const fromName = String(prev.assignee || '').trim();
            const toName   = String(snap.assignee || '').trim();
            if (!prev.assignee_id && snap.assignee_id) {
              _pushTicketUpdate(rec, 'pickup', `Picked up by ${toName || 'someone'}`, now);
              pushTicker(`#${tid}: picked up by ${toName || 'someone'}`, 'ok');
              soundKind = 'pickup';
              // Track in Assigned tab + remove from active alert queue
              addAssigned({ id: tid, subject: d.subject, assignee: toName, assignee_id: snap.assignee_id, at: now, viewTitle: a.title || viewKey });
              if (Array.isArray(a.tickets)) {
                a.tickets = a.tickets.filter(t => String(t) !== String(tid));
                if (a.tickets.length === 0) {
                  delete unread[viewKey];
                  changed = true;
                  rec.snap = snap;
                  continue;
                }
              }
            } else if (prev.assignee_id && !snap.assignee_id) {
              _pushTicketUpdate(rec, 'update', `Unassigned (was ${fromName || 'assigned'})`, now);
              soundKind = 'update';
            } else {
              _pushTicketUpdate(rec, 'update', `Assignee: ${fromName || 'Unassigned'} → ${toName || 'Unassigned'}`, now);
              soundKind = 'update';
              // Also track re-assignment + remove from active alert queue
              addAssigned({ id: tid, subject: d.subject, assignee: toName, assignee_id: snap.assignee_id, at: now, viewTitle: a.title || viewKey });
              if (Array.isArray(a.tickets)) {
                a.tickets = a.tickets.filter(t => String(t) !== String(tid));
                if (a.tickets.length === 0) {
                  delete unread[viewKey];
                  changed = true;
                  rec.snap = snap;
                  continue;
                }
              }
            }
          }

          // Status change
          if (String(prev.status || '') !== String(snap.status || '')) {
            hadDelta = true;
            _pushTicketUpdate(rec, 'status', `Status: ${prev.status || 'unknown'} → ${snap.status || 'unknown'}`, now);
            pushTicker(`#${tid}: ${prev.status || '?'} → ${snap.status || '?'}`, ['solved','closed'].includes(snap.status) ? 'ok' : 'info');
            recordStatusChange(tid, prev.status, snap.status);
            soundKind = 'status';
            // Track resolved + remove from active alert
            if (['solved', 'closed'].includes(snap.status)) {
              addResolved({
                id: tid, subject: d.subject, status: snap.status,
                mergedInto: null, resolvedAt: now,
                solvedBy: snap.assignee || '', viewTitle: a.title || viewKey, viewKey,
              });
              // ── Auto-move: remove this ticket pill from active alert ──
              if (Array.isArray(a.tickets)) {
                a.tickets = a.tickets.filter(t => String(t) !== String(tid));
                if (a.tickets.length === 0) {
                  delete unread[viewKey];
                  changed = true;
                  rec.snap = snap;
                  continue; // skip rest of processing for this ticket
                }
              }
            }
          }

          // Subject change
          if (String(prev.subject || '') !== String(snap.subject || '')) {
            hadDelta = true;
            _pushTicketUpdate(rec, 'update', `Subject updated: ${snap.subject}`, now);
            if (!soundKind) soundKind = 'update';
          }

          // Comment/note/merge detection
          if (prev.updated_at && snap.updated_at && prev.updated_at !== snap.updated_at) {
            try {
              const { audits, uMap } = await fetchTicketAudits(tid, 25);
              const { updates, maxId } = _extractCommentUpdates(audits, uMap, rec.lastAuditId || 0);
              if (maxId) rec.lastAuditId = Math.max(Number(rec.lastAuditId || 0), Number(maxId || 0));
              if (updates && updates.length) {
                hadDelta = true;
                for (const u of updates) {
                  _pushTicketUpdate(rec, u.kind || 'update', u.text || 'Ticket updated', now);
                  // Pick highest priority sound kind
                  const uk = u.kind || 'update';
                  if (uk === 'reply') soundKind = 'reply';
                  else if (uk === 'merge') {
                    soundKind = soundKind === 'reply' ? 'reply' : 'merge';
                    // Add to resolved log for merge
                    const mergeId = _parseMergedIntoIdFromText(u.text || '');
                    if (mergeId) {
                      addResolved({
                        id: tid, subject: d.subject, status: 'merged',
                        mergedInto: mergeId, resolvedAt: now,
                        solvedBy: snap.assignee || '', viewTitle: a.title || viewKey, viewKey,
                      });
                      recordMerge(tid, mergeId);
                    }
                  } else if (uk === 'note' && soundKind !== 'reply') {
                    soundKind = 'note';
                  } else if (!soundKind) {
                    soundKind = uk;
                  }
                }
              } else if (!hadDelta) {
                hadDelta = true;
                _pushTicketUpdate(rec, 'update', 'Ticket updated', now);
                if (!soundKind) soundKind = 'update';
              }
            } catch {}
          }

          if (hadDelta) {
            changed = true;
            a.at = now;
            const lastU = rec.updates && rec.updates.length ? rec.updates[rec.updates.length - 1] : null;
            const lastKind = String(lastU?.kind || '');
            if (!a.changeDesc || String(a.changeDesc).startsWith('+') || ['Updates:','Picked up:','Merged:'].some(p => String(a.changeDesc).startsWith(p))) {
              if (lastKind === 'merge') {
                const mid = _parseMergedIntoIdFromText(lastU?.text || '');
                a.changeDesc = mid ? `Merged: #${tid} → #${mid}` : `Merged: #${tid}`;
              } else if (lastKind === 'pickup') {
                a.changeDesc = `Picked up: #${tid}`;
              } else if (lastKind === 'reply') {
                a.changeDesc = `Reply on #${tid}`;
              } else if (lastKind === 'note') {
                a.changeDesc = `Note on #${tid}`;
              } else {
                a.changeDesc = `Updates: #${tid}`;
              }
            }
            // Play sound for this change type
            if (soundKind) playSound(CHANGE_SOUND[soundKind] || 'info');

            const pref = getPref(viewKey, a.title || viewKey);
            if (pref?.mode === 'desktop' && loadDNotif()) {
              const last = rec.updates?.length ? rec.updates[rec.updates.length - 1] : null;
              if (last) deskLines.push(`${a.title || viewKey}: #${tid} ${last.text}`);
            }
          }
          rec.snap = snap;
        } catch {}
      }
    }

    if (changed) {
      saveUnread(unread);
      const hasCrit = Object.values(loadUnread()).some(u => u.level === 'critical');
      if (navBtnEl) navBtnEl.dataset.critical = hasCrit ? '1' : '0';
      refreshUI();
      requestPanelUpdate();
      if (deskLines.length) {
        desktopNotify('Zendesk — Ticket Updates', deskLines.slice(0, 6).join('\n'), 'tcws-alert-updates');
      }
    }
    return changed;
  }

  // ─── Watchlist polling ────────────────────────────────────────────────────────
  let watchTimer = null;
  function startWatchPolling(intervalMs) {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    if (!loadWatchlist().length) return;
    watchTimer = setInterval(pollWatchlist, intervalMs);
  }
  async function pollWatchlist() {
    const list = loadWatchlist(); if (!list.length) return;
    const states = loadWatchStates();
    const unread = loadUnread();
    let changed = false;
    for (const item of list) {
      const tid = String(item.id);
      try {
        delete ticketCache[tid];
        const data = await fetchTicketDetail(tid);
        const prev = states[tid];
        const curr = { status: data.status, updated_at: data.updated_at };
        states[tid] = curr;
        if (prev && (prev.status !== curr.status || prev.updated_at !== curr.updated_at)) {
          const desc = prev.status !== curr.status ? `Status: ${prev.status} → ${curr.status}` : 'Ticket updated';
          const key  = `watch_${tid}`;
          unread[key] = { delta: 1, at: Date.now(), level: 'info', title: `#${tid} - ${data.subject.slice(0, 55)}`, tickets: [tid], isWatch: true, changeDesc: desc };
          desktopNotify(`Watched Ticket #${tid}`, `${data.subject}\n${desc}`, `tcws-watch-${tid}`);
          playSound('info');
          logActivity({ level: 'info', title: `Watch #${tid}`, viewKey: `watch_${tid}` });
          changed = true;
        }
      } catch {}
    }
    saveWatchStates(states);
    if (changed) { saveUnread(unread); refreshUI(); requestPanelUpdate(); }
  }

  // ─── Queue Monitor polling ────────────────────────────────────────────────────
  let queueMonitorTimer = null;
  let queueMonitorPolling = false;

  async function pollQueueMonitor() {
    if (queueMonitorPolling) return;
    const queues = loadQueueMonitor();
    if (!queues.length) return;
    queueMonitorPolling = true;
    try {
      const cache = loadQueueCache();
      for (const q of queues) {
        try {
          const ids = await fetchIds(q.viewId, 30);
          cache[q.viewId] = { ids: ids.map(String), at: Date.now(), label: q.label, viewId: q.viewId };
        } catch (e) {
          // Keep old cache on error, just update timestamp to signal attempted
          if (cache[q.viewId]) cache[q.viewId].errAt = Date.now();
        }
      }
      saveQueueCache(cache);
      // Re-render alerts tab if panel is open
      if (panelEl?.classList.contains('open') && activeTab === 'alerts') panelEl._render?.();
    } finally {
      queueMonitorPolling = false;
    }
  }

  function startQueueMonitorPoll(intervalMs) {
    if (queueMonitorTimer) { clearInterval(queueMonitorTimer); queueMonitorTimer = null; }
    if (!loadQueueMonitor().length) return;
    pollQueueMonitor(); // immediate fetch on start
    queueMonitorTimer = setInterval(pollQueueMonitor, intervalMs || 60_000);
  }

  function stopQueueMonitorPoll() {
    if (queueMonitorTimer) { clearInterval(queueMonitorTimer); queueMonitorTimer = null; }
  }

  // ─── Main scan ────────────────────────────────────────────────────────────────
  async function scan() {
    if (!isAgentRoute() || inScan) return;
    inScan = true;
    try {
      // v1.3.0: Fetch view list and counts from API — no DOM scraping.
      const views = await fetchAndCacheViews();
      if (!views.length) { await rescanActiveAlertTickets(); refreshUI(); return; }

      let countMap = {};
      try {
        countMap = await fetchViewCounts(views.map(v => v.viewKey));
      } catch { lastScanOk = false; return; }

      const lastCounts = loadCounts();
      const current    = {};
      const unread     = loadUnread();
      const changed    = [];
      for (const v of views) {
        const count = countMap[v.viewKey];
        if (count == null) continue;
        current[v.viewKey] = count;
        const pref = getPref(v.viewKey, v.title);
        if (pref.mode === 'off' || !isNum(lastCounts[v.viewKey])) continue;
        if (isViewSnoozed(v.viewKey)) continue;
        if (count > lastCounts[v.viewKey])
          changed.push({ viewKey: v.viewKey, title: v.title, delta: count - lastCounts[v.viewKey], pref });
      }
      saveCounts(current);
      lastScanAt = Date.now(); lastScanOk = true;
      if (!changed.length) { await rescanActiveAlertTickets(); refreshUI(); return; }

      const lastTickets = loadTickets();
      const notified    = pruneNotified(loadNotif());
      const now         = Date.now();
      const ticketViews = {};
      const deskBuckets = {};
      let   topLevel    = 'normal';
      const lvlRank     = { normal: 0, info: 1, warning: 2, critical: 3 };

      for (const c of changed) {
        const level = c.pref.level || 'normal';
        if ((lvlRank[level] || 0) > (lvlRank[topLevel] || 0)) topLevel = level;
        unread[c.viewKey] = { delta: c.delta, at: now, level, title: c.title || c.viewKey, tickets: [...new Set([...(unread[c.viewKey]?.tickets || [])])] };
        logActivity({ level, title: c.title, viewKey: c.viewKey, delta: c.delta });
        pushTicker(`+${c.delta} new · ${c.title || c.viewKey}`, level);
        if (c.pref.mode === 'desktop') {
          if (!deskBuckets[c.viewKey]) deskBuckets[c.viewKey] = { title: c.title || c.viewKey, tickets: [] };
        }
        let ids = [];
        try { ids = await fetchIds(c.viewKey); } catch {}
        const prev = Array.isArray(lastTickets[c.viewKey]) ? lastTickets[c.viewKey] : null;
        lastTickets[c.viewKey] = ids;
        if (!prev) continue;
        const prevSet = new Set(prev.map(String));
        const newOnes = ids.filter(id => !prevSet.has(String(id)));
        if (!newOnes.length) continue;
        unread[c.viewKey].tickets = [...new Set([...unread[c.viewKey].tickets, ...newOnes.map(String)])];
        // Mark newly seen IDs for pill highlight (cleared on first render)
        if (newOnes.length) {
          unread[c.viewKey].newTids = [...new Set([...(unread[c.viewKey].newTids || []), ...newOnes.map(String)])];
        }
        for (const tid of newOnes) {
          const k = String(tid);
          if (!ticketViews[k]) ticketViews[k] = [];
          ticketViews[k].push({ viewId: c.viewKey, title: c.title, pref: c.pref });
        }
        if (c.pref.mode === 'desktop' && deskBuckets[c.viewKey]) deskBuckets[c.viewKey].tickets.push(...newOnes.map(String));
      }
      saveTickets(lastTickets);

      for (const tid of Object.keys(ticketViews)) {
        if (notified[tid]) { for (const v of ticketViews[tid]) { const b = deskBuckets[v.viewId]; if (b) b.tickets = b.tickets.filter(t => t !== tid); } continue; }
        notified[tid] = now;
      }
      saveNotif(notified);

      // Sound fires for ANY new alert if sound is enabled — independent of notification mode.
      // Desktop pop-up only fires for views explicitly set to mode='desktop'.
      playSound(topLevel);

      const deskItems = Object.values(deskBuckets);
      if (deskItems.length) {
        deskItems.sort((a, b) => b.tickets.length - a.tickets.length);
        const body = deskItems.slice(0, 4).map(it => { const t = it.tickets.slice(0, 3).map(x => `#${x}`).join(', '); return t ? `${it.title}: ${t}` : it.title; }).join('\n');
        desktopNotify('Zendesk — New Tickets', body, 'tcws-view-alert');
      }

      saveUnread(unread);
      await rescanActiveAlertTickets();
      const hasCrit = Object.values(loadUnread()).some(u => u.level === 'critical');
      if (navBtnEl) navBtnEl.dataset.critical = hasCrit ? '1' : '0';
      refreshUI();
      requestPanelUpdate();
    } catch { lastScanOk = false; } finally { inScan = false; }
  }

  function pruneNotified(obj) {
    const out = { ...(obj || {}) };
    for (const k of Object.keys(out)) if (!isNum(out[k]) || Date.now() - out[k] > NOTIFIED_TTL) delete out[k];
    return out;
  }
  function scheduleScan() {
    if (scanDebounce) clearTimeout(scanDebounce);
    scanDebounce = setTimeout(() => { ensureUI(); scan(); }, 1200);
  }

  // ─── Animated theme — canvas particle engine ─────────────────────────────────
  // Each animated panel gets a <canvas class="tcws-anim-canvas"> injected as a
  // direct child of the .tcws-panel element.  mix-blend-mode:screen means dark
  // canvas pixels (alpha=0 / cleared areas) are transparent; colored particles
  // additively light the content behind them without blocking clicks or text.
  const _animCleanup = new Map(); // el → cleanup fn

  function _stopParticles(el) {
    const fn = _animCleanup.get(el);
    if (fn) { fn(); _animCleanup.delete(el); }
    el.querySelector('.tcws-anim-canvas')?.remove();
  }

  function _startParticles(el, animClass) {
    _stopParticles(el);
    const canvas = document.createElement('canvas');
    canvas.className = 'tcws-anim-canvas';
    // z-index must beat .tcws-panel-inner (z-index:2) to appear above child backgrounds
    canvas.style.zIndex = '9998';
    el.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let raf = null;
    let stopped = false;

    function resize() {
      canvas.width  = el.offsetWidth  || 600;
      canvas.height = el.offsetHeight || 500;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // ── Aurora ──────────────────────────────────────────────────────────────────
    // 60 glowing firefly particles drift upward; a slow aurora band pulses across
    // the upper third of the panel shifting teal → indigo → cyan.
    if (animClass === 'tcws-anim-aurora') {
      const COLS = ['#38d9a9','#5e81f4','#00b4d8','#a0e9d4','#74c7ec'];
      const pts = [];
      function spawnP(randomLife) {
        const W = canvas.width, H = canvas.height;
        return {
          x: Math.random() * W,
          y: randomLife ? Math.random() * H : H * 0.5 + Math.random() * H * 0.5,
          r: Math.random() * 2.5 + 0.8,
          alpha: Math.random() * 0.45 + 0.15,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -(Math.random() * 0.5 + 0.15),
          color: COLS[Math.floor(Math.random() * COLS.length)],
          life: randomLife ? Math.random() : 0,
        };
      }
      for (let i = 0; i < 60; i++) pts.push(spawnP(true));
      let band = 0;
      function tick() {
        if (stopped) return;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        band += 0.0025;
        // aurora band — wide soft gradient across the upper portion
        const t = (Math.sin(band) + 1) / 2;
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0,    `rgba(56,217,169,${0.05 + t * 0.05})`);
        g.addColorStop(0.30, `rgba(94,129,244,${0.07 + t * 0.06})`);
        g.addColorStop(0.60, `rgba(0,180,216,${0.06 + t * 0.05})`);
        g.addColorStop(1,    `rgba(160,233,212,${0.04 + t * 0.04})`);
        ctx.fillStyle = g;
        const bH = H * 0.45;
        const bY = H * 0.06 + Math.sin(band * 0.7) * H * 0.08;
        ctx.fillRect(0, bY, W, bH);
        // particles
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          p.x += p.vx; p.y += p.vy; p.life += 0.003;
          if (p.life >= 1 || p.y < 0) { pts[i] = spawnP(false); continue; }
          const fade = p.life < 0.12 ? p.life / 0.12 : p.life > 0.82 ? (1 - (p.life - 0.82) / 0.18) : 1;
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.5);
          grd.addColorStop(0, p.color + 'cc'); grd.addColorStop(1, p.color + '00');
          ctx.globalAlpha = p.alpha * fade;
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      }
      tick();

    // ── Synthwave ───────────────────────────────────────────────────────────────
    // Perspective grid scrolls toward the viewer in the lower half of the panel.
    // Magenta/cyan streaks rain down in the upper half like falling stars.
    } else if (animClass === 'tcws-anim-synthwave') {
      const streaks = [];
      function spawnStreak() {
        const W = canvas.width, H = canvas.height;
        return {
          x: Math.random() * W,
          y: -(Math.random() * H * 0.3),
          len: Math.random() * 55 + 22,
          alpha: Math.random() * 0.32 + 0.10,
          speed: Math.random() * 2.0 + 0.7,
          color: Math.random() > 0.5 ? '#fe75fe' : '#00e5ff',
        };
      }
      for (let i = 0; i < 32; i++) {
        const s = spawnStreak();
        s.y = Math.random() * (canvas.height * 0.5); // scatter initial positions
        streaks.push(s);
      }
      let scroll = 0;
      function drawGrid() {
        const W = canvas.width, H = canvas.height;
        const hz = H * 0.52, mx = W * 0.5;
        const VL = 14;
        for (let i = 0; i <= VL; i++) {
          const t = i / VL, bx = t * W;
          ctx.beginPath(); ctx.moveTo(mx, hz); ctx.lineTo(bx, H);
          ctx.strokeStyle = `rgba(254,117,254,${0.04 + Math.abs(t - 0.5) * 0.06})`;
          ctx.lineWidth = 0.75; ctx.stroke();
        }
        const HL = 14;
        for (let i = 0; i < HL; i++) {
          const raw = (i / HL + scroll) % 1;
          const persp = Math.pow(raw, 2.5);
          const y = hz + (H - hz) * persp;
          if (y <= hz) continue;
          const sp = (y - hz) / (H - hz);
          const x1 = mx - sp * W * 0.5, x2 = mx + sp * W * 0.5;
          const alpha = sp * 0.12 + 0.025;
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y);
          ctx.strokeStyle = `rgba(${i % 3 === 0 ? '0,229,255' : '254,117,254'},${alpha})`;
          ctx.lineWidth = 0.65; ctx.stroke();
        }
      }
      function tick() {
        if (stopped) return;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        scroll = (scroll + 0.004) % 1;
        drawGrid();
        for (let i = 0; i < streaks.length; i++) {
          const s = streaks[i];
          s.y += s.speed;
          if (s.y > H * 0.52) { streaks[i] = spawnStreak(); continue; }
          const grd = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
          grd.addColorStop(0, s.color + '00'); grd.addColorStop(1, s.color + 'bb');
          ctx.strokeStyle = grd; ctx.lineWidth = 0.85;
          ctx.globalAlpha = s.alpha;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.len); ctx.stroke();
          // bright hot tip at the leading edge
          const tipGrd = ctx.createRadialGradient(s.x, s.y + s.len, 0, s.x, s.y + s.len, 3);
          tipGrd.addColorStop(0, s.color + 'ff'); tipGrd.addColorStop(1, s.color + '00');
          ctx.fillStyle = tipGrd;
          ctx.beginPath(); ctx.arc(s.x, s.y + s.len, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      }
      tick();

    // ── Plasma ──────────────────────────────────────────────────────────────────
    // 6 large soft orbs drift with sinusoidal paths, cycling color.
    // 50 bright micro-sparks orbit randomly and fade in/out.
    } else if (animClass === 'tcws-anim-plasma') {
      const ORB_C  = ['#a855f7','#6366f1','#ec4899','#8b5cf6','#c084fc'];
      const SPK_C  = ['#f0abfc','#c4b5fd','#fbcfe8','#e879f9'];
      const orbs   = Array.from({length: 6}, () => ({
        x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
        r: Math.random() * 75 + 45,
        vx: (Math.random() - 0.5) * 0.38, vy: (Math.random() - 0.5) * 0.38,
        color: ORB_C[Math.floor(Math.random() * ORB_C.length)],
        phase: Math.random() * Math.PI * 2,
        ci: Math.floor(Math.random() * ORB_C.length), // colour index for cycling
      }));
      const sparks = Array.from({length: 50}, () => ({
        x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 0.5,
        alpha: Math.random() * 0.45 + 0.12,
        vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
        life: Math.random(),
        color: SPK_C[Math.floor(Math.random() * SPK_C.length)],
      }));
      let t = 0, colorT = 0;
      function tick() {
        if (stopped) return;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        t += 0.007; colorT += 0.002;
        for (const o of orbs) {
          o.x += o.vx + Math.sin(t + o.phase) * 0.22;
          o.y += o.vy + Math.cos(t * 0.75 + o.phase) * 0.18;
          if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
          if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
          // slowly cycle hue by blending toward next colour
          const blend = (Math.sin(colorT + o.phase) + 1) / 2;
          const next = ORB_C[(o.ci + 1) % ORB_C.length];
          const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
          grd.addColorStop(0,    o.color + '2e');
          grd.addColorStop(0.40, o.color + '16');
          grd.addColorStop(0.75, next    + '0a');
          grd.addColorStop(1,    o.color + '00');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
          if (blend > 0.98) { o.ci = (o.ci + 1) % ORB_C.length; o.color = ORB_C[o.ci]; }
        }
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i];
          s.x += s.vx; s.y += s.vy; s.life += 0.004;
          if (s.life > 1) {
            sparks[i] = {
              x: Math.random() * W, y: Math.random() * H,
              r: Math.random() * 1.8 + 0.5, alpha: Math.random() * 0.45 + 0.12,
              vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
              life: 0, color: SPK_C[Math.floor(Math.random() * SPK_C.length)],
            };
            continue;
          }
          const fade = s.life < 0.15 ? s.life / 0.15 : s.life > 0.78 ? (1 - (s.life - 0.78) / 0.22) : 1;
          const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4.5);
          grd.addColorStop(0, s.color + 'ff'); grd.addColorStop(1, s.color + '00');
          ctx.globalAlpha = s.alpha * fade;
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      }
      tick();

    // ── Matrix ──────────────────────────────────────────────────────────────────
    // Cascading columns of katakana/latin/digit characters fall downward.
    // Each column has an independent speed and length. The leading character
    // glows bright white; the trail fades out with the configured tint color.
    } else if (animClass === 'tcws-anim-matrix') {
      const CHARS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF'.split('');
      const FONT_SIZE = 13;
      let matrixColor = loadMatrixColor(); // e.g. '#00ff41'

      // Re-read color when it changes (interval check is cheap)
      const colorRefresh = setInterval(() => { matrixColor = loadMatrixColor(); }, 1500);

      function hexToRgbParts(hex) {
        const h = (hex || '#00ff41').replace('#','');
        const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
        return [parseInt(full.slice(0,2),16), parseInt(full.slice(2,4),16), parseInt(full.slice(4,6),16)];
      }

      let cols = [];
      function initCols() {
        const W = canvas.width;
        const count = Math.floor(W / FONT_SIZE);
        cols = Array.from({length: count}, () => ({
          y:      -(Math.random() * canvas.height),      // current head y (px)
          speed:  Math.random() * 1.4 + 0.7,             // px per frame
          len:    Math.floor(Math.random() * 18) + 8,     // trail length in chars
          chars:  Array.from({length: 32}, () => CHARS[Math.floor(Math.random()*CHARS.length)]),
          mutIdx: 0,                                       // index to mutate next
        }));
      }
      initCols();

      function tick() {
        if (stopped) return;
        const W = canvas.width, H = canvas.height;
        const [mr, mg, mb] = hexToRgbParts(matrixColor);

        // Dim the canvas with a semi-transparent black (creates trail effect)
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(0, 0, W, H);

        ctx.font = `bold ${FONT_SIZE}px "Courier New",monospace`;
        ctx.textAlign = 'center';

        for (let ci = 0; ci < cols.length; ci++) {
          const col = cols[ci];
          col.y += col.speed;

          // Occasionally mutate a random character in the trail
          if (Math.random() < 0.04) {
            col.chars[col.mutIdx % col.chars.length] = CHARS[Math.floor(Math.random()*CHARS.length)];
            col.mutIdx++;
          }

          const x = ci * FONT_SIZE + FONT_SIZE / 2;

          // Draw trail characters
          for (let ti = 0; ti < col.len; ti++) {
            const charY = col.y - ti * FONT_SIZE;
            if (charY < 0 || charY > H) continue;
            const fade = Math.pow(1 - ti / col.len, 1.6); // non-linear fade
            if (ti === 0) {
              // Bright leading character — near white with a green tint
              ctx.fillStyle = `rgba(200,255,220,${Math.min(1, fade * 1.8)})`;
            } else {
              ctx.fillStyle = `rgba(${mr},${mg},${mb},${fade * 0.85})`;
            }
            const ch = col.chars[ti % col.chars.length];
            ctx.fillText(ch, x, charY);
          }

          // Reset column when it scrolls off screen
          if (col.y - col.len * FONT_SIZE > H) {
            col.y = -(Math.random() * H * 0.5);
            col.speed = Math.random() * 1.4 + 0.7;
            col.len   = Math.floor(Math.random() * 18) + 8;
          }
        }

        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(tick);
      }
      tick();

      // Override cleanup to also clear the color refresh interval
      _animCleanup.set(el, () => {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(colorRefresh);
        ro.disconnect();
        canvas.remove();
      });
      return; // skip the generic cleanup below
    }

    // Generic cleanup for aurora / synthwave / plasma
    _animCleanup.set(el, () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.remove();
    });
  }

  // ─── Scale application ────────────────────────────────────────────────────────
  function applyScale(el) {
    el.style.setProperty('--tcws-scale', String(loadScale()));
  }
  function applyNMWidth(el) {
    if (!el) return;
    el.style.setProperty('--tcws-nm-width', loadNMWidth() + 'px');
  }
  function applyDetWidth(el) {
    if (!el) return;
    el.style.setProperty('--tcws-det-width', loadDetWidth() + 'px');
    el.style.setProperty('--tcws-fld-width', loadFldWidth() + 'px');
  }

  // ─── Theme application ────────────────────────────────────────────────────────
  function applyTheme(themeKey, el) {
    // Remove any existing animation class
    [...el.classList].forEach(c => { if (c.startsWith('tcws-anim-')) el.classList.remove(c); });

    let theme, vars;
    if (themeKey === 'custom') {
      const cfg = loadCustomTheme();
      theme = { glow: '0 8px 40px rgba(0,0,0,.55)', radius: '12px', font: 'system-ui,-apple-system,sans-serif', scanline: false };
      vars = buildCustomVars(cfg);
    } else {
      theme = THEMES[themeKey] || THEMES.dusk;
      vars = theme.vars;
    }

    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    // Animated themes self-manage box-shadow via CSS @keyframes — setting it inline
    // would fight the animation. Clear it so CSS wins cleanly.
    el.style.boxShadow    = theme.animClass ? '' : theme.glow;
    el.style.borderRadius = theme.radius;
    el.style.fontFamily   = theme.font;
    el.setAttribute('data-theme',    themeKey);
    el.setAttribute('data-scanline', theme.scanline ? '1' : '0');
    if (theme.animClass) { el.classList.add(theme.animClass); _startParticles(el, theme.animClass); }
    else _stopParticles(el);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('tcws-nm6-style')) return;
    const s = document.createElement('style');
    s.id = 'tcws-nm6-style';
    s.textContent = `
      /* ── Settings sub-tabs ──────────────────────────────────────── */
      .tcws-stab-bar{display:flex;flex-wrap:wrap;gap:1px;padding:8px 12px 0;border-bottom:1px solid var(--t-border);flex-shrink:0}
      .tcws-stab{flex-shrink:0;padding:5px 11px 7px;border:none;border-bottom:2px solid transparent;background:transparent;color:var(--t-text3);font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.04em;text-transform:uppercase;transition:color .12s,border-color .12s;font-family:inherit}
      .tcws-stab:hover{color:var(--t-text2)}
      .tcws-stab[data-on="1"]{color:var(--t-text1);border-bottom-color:var(--t-accent)}
      .tcws-stab-content{flex:1;overflow-y:auto;padding:10px 12px 12px}

      /* ── Animated themes — outer glow only; interior handled by canvas particle engine ── */
      @keyframes tcwsAuroraGlow {
        0%,100% { box-shadow:0 8px 48px rgba(0,0,0,.70),0 0 0 1px rgba(56,217,169,.28),0 0 24px rgba(56,217,169,.15) }
        33%     { box-shadow:0 8px 48px rgba(0,0,0,.70),0 0 0 1px rgba(94,129,244,.32),0 0 28px rgba(94,129,244,.17) }
        66%     { box-shadow:0 8px 48px rgba(0,0,0,.70),0 0 0 1px rgba(0,180,216,.30),0 0 26px rgba(0,180,216,.16) }
      }
      .tcws-panel.tcws-anim-aurora,#tcws-detail-panel.tcws-anim-aurora { animation:tcwsAuroraGlow 9s ease-in-out infinite }

      @keyframes tcwsSynthwaveGlow {
        0%,100% { box-shadow:0 8px 40px rgba(0,0,0,.85),0 0 22px rgba(254,117,254,.28),0 0 0 1px rgba(254,117,254,.35) }
        50%     { box-shadow:0 8px 40px rgba(0,0,0,.85),0 0 36px rgba(0,229,255,.28),0 0 0 1px rgba(0,229,255,.48) }
      }
      @keyframes tcwsSynthwaveText {
        0%,100% { text-shadow:0 0 8px rgba(254,117,254,.40) }
        50%     { text-shadow:0 0 8px rgba(0,229,255,.40) }
      }
      .tcws-panel.tcws-anim-synthwave,#tcws-detail-panel.tcws-anim-synthwave { animation:tcwsSynthwaveGlow 3.5s ease-in-out infinite }
      .tcws-panel.tcws-anim-synthwave .tcws-hdr-title,#tcws-detail-panel.tcws-anim-synthwave .tcws-hdr-title { animation:tcwsSynthwaveText 3.5s ease-in-out infinite }

      @keyframes tcwsPlasmaGlow {
        0%   { box-shadow:0 8px 48px rgba(0,0,0,.80),0 0 28px rgba(168,85,247,.22),0 0 0 1px rgba(168,85,247,.32) }
        33%  { box-shadow:0 8px 48px rgba(0,0,0,.80),0 0 32px rgba(99,102,241,.28),0 0 0 1px rgba(99,102,241,.40) }
        66%  { box-shadow:0 8px 48px rgba(0,0,0,.80),0 0 28px rgba(236,72,153,.22),0 0 0 1px rgba(236,72,153,.35) }
        100% { box-shadow:0 8px 48px rgba(0,0,0,.80),0 0 28px rgba(168,85,247,.22),0 0 0 1px rgba(168,85,247,.32) }
      }
      @keyframes tcwsPlasmaAccent {
        0%   { color:rgba(168,85,247,1)  }
        33%  { color:rgba(99,102,241,1)  }
        66%  { color:rgba(236,72,153,1)  }
        100% { color:rgba(168,85,247,1)  }
      }
      .tcws-panel.tcws-anim-plasma,#tcws-detail-panel.tcws-anim-plasma { animation:tcwsPlasmaGlow 5s ease-in-out infinite }
      .tcws-panel.tcws-anim-plasma .tcws-hdr-icon svg circle,
      .tcws-panel.tcws-anim-plasma .tcws-hdr-icon svg path { animation:tcwsPlasmaAccent 5s ease-in-out infinite }

      @keyframes tcwsMatrixGlow {
        0%,100% { box-shadow:0 0 0 2px #003b10,0 0 28px rgba(0,255,65,.20),0 8px 40px rgba(0,0,0,.98) }
        50%     { box-shadow:0 0 0 2px #006420,0 0 42px rgba(0,255,65,.35),0 8px 40px rgba(0,0,0,.98) }
      }
      @keyframes tcwsMatrixText {
        0%,100% { text-shadow:0 0 7px rgba(0,255,65,.55) }
        50%     { text-shadow:0 0 14px rgba(0,255,65,.90) }
      }
      .tcws-panel.tcws-anim-matrix,#tcws-detail-panel.tcws-anim-matrix { animation:tcwsMatrixGlow 2.8s ease-in-out infinite }
      .tcws-panel.tcws-anim-matrix .tcws-hdr-title,#tcws-detail-panel.tcws-anim-matrix .tcws-hdr-title { animation:tcwsMatrixText 2.8s ease-in-out infinite }

      /* Canvas particle layer — position:absolute inside the panel, rendered via JS */
      .tcws-anim-canvas { position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;border-radius:inherit;display:block }

      /* ── Light mode support ──────────────────────────────────────── */
      .tcws-panel[data-theme="arctic"] .tcws-badge,
      .tcws-panel[data-theme="arcticblast"] .tcws-badge { color:#fff }
      .tcws-panel[data-theme="arctic"] .tcws-hdr,
      .tcws-panel[data-theme="arcticblast"] .tcws-hdr { border-bottom:1px solid var(--t-border2) }

      /* ── Queue Monitor ──────────────────────────────────────── */
      .tcws-qmon-card{background:var(--t-bg2);border:1px solid var(--t-border);border-radius:8px;padding:10px 12px;margin-bottom:8px}
      .tcws-qmon-hdr{display:flex;align-items:center;gap:6px;margin-bottom:6px}
      .tcws-qmon-title{font-size:12px;font-weight:600;color:var(--t-text1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-qmon-meta{font-size:12px;color:var(--t-text3);white-space:nowrap}

      /* ── Row dots ─────────────────────────────────────────── */
      .tcws-dot{display:none;align-items:center;gap:5px;margin-left:8px;vertical-align:middle;user-select:none}
      .tcws-dot i{width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:background .3s}
      .tcws-dot b{font-size:10px;font-weight:700;font-family:system-ui,sans-serif}
      .tcws-dot[data-level="critical"] i{background:#ef4444}
      .tcws-dot[data-level="warning"]  i{background:#f59e0b}
      .tcws-dot[data-level="info"]     i{background:#3b82f6}
      .tcws-dot[data-level="normal"]   i{background:#10b981}
      .tcws-dot[data-pulse="1"] i{animation:tcwsPulse 1.1s ease-in-out infinite}
      @keyframes tcwsPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(2.2);opacity:.2}}

      /* ── Nav button ────────────────────────────────────────── */
      .tcws-nav-li{list-style:none}
      .tcws-nav-btn{position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;border:none;background:transparent;cursor:pointer;transition:background .15s,box-shadow .2s;padding:0}
      .tcws-nav-btn:hover{background:rgba(255,255,255,.1)}
      .tcws-nav-btn[data-active="1"]{background:rgba(59,130,246,.18)}
      .tcws-nav-btn svg{display:block}
      .tcws-nav-btn .icon-ring{stroke:rgba(255,255,255,.5);transition:stroke .15s}
      .tcws-nav-btn:hover .icon-ring,.tcws-nav-btn[data-active="1"] .icon-ring{stroke:rgba(255,255,255,.9)}
      .tcws-nav-btn .icon-fill{fill:rgba(255,255,255,.5);transition:fill .15s}
      .tcws-nav-btn:hover .icon-fill,.tcws-nav-btn[data-active="1"] .icon-fill{fill:rgba(255,255,255,.9)}
      .tcws-badge{display:none;position:absolute;top:2px;right:2px;min-width:15px;height:15px;padding:0 3px;border-radius:99px;background:#ef4444;color:#fff;font-size:9px;font-weight:800;line-height:15px;text-align:center;box-shadow:0 1px 8px rgba(239,68,68,.6);pointer-events:none;font-family:system-ui,sans-serif}
      .tcws-nav-btn[data-has-alerts="1"] .tcws-badge{display:block}
      .tcws-ar-dot{display:none;position:absolute;bottom:4px;right:4px;width:6px;height:6px;border-radius:50%;background:#3b82f6;box-shadow:0 0 8px #3b82f6}
      .tcws-nav-btn[data-ar-on="1"] .tcws-ar-dot{display:block}
      @keyframes tcwsNavPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}50%{box-shadow:0 0 0 7px rgba(239,68,68,0)}}
      .tcws-nav-btn[data-critical="1"]{animation:tcwsNavPulse 1.4s ease-in-out infinite}

      /* ── Strobe — full nav bar ───────────────────────────────── */
      @keyframes tcwsStrobeCrit{
        0%,100%{box-shadow:inset -3px 0 0 0 #ef4444, inset -10px 0 28px -6px rgba(239,68,68,.45), 3px 0 18px -4px rgba(239,68,68,.55)}
        48%  {box-shadow:inset -3px 0 0 0 rgba(239,68,68,.12), inset -4px 0 6px -2px rgba(239,68,68,.08), 1px 0 4px -2px rgba(239,68,68,.1)}
      }
      @keyframes tcwsStrobeWarn{
        0%,100%{box-shadow:inset -3px 0 0 0 #f59e0b, inset -10px 0 24px -6px rgba(245,158,11,.4), 3px 0 16px -4px rgba(245,158,11,.45)}
        52%  {box-shadow:inset -3px 0 0 0 rgba(245,158,11,.12), inset -4px 0 6px -2px rgba(245,158,11,.08), 1px 0 4px -2px rgba(245,158,11,.1)}
      }
      @keyframes tcwsStrobeInfo{
        0%,100%{box-shadow:inset -3px 0 0 0 #3b82f6, inset -10px 0 22px -6px rgba(59,130,246,.35), 3px 0 14px -4px rgba(59,130,246,.4)}
        55%  {box-shadow:inset -3px 0 0 0 rgba(59,130,246,.12), inset -4px 0 6px -2px rgba(59,130,246,.08), 1px 0 4px -2px rgba(59,130,246,.1)}
      }
      nav[data-tcws-strobe="critical"]{animation:tcwsStrobeCrit 1.1s ease-in-out infinite}
      nav[data-tcws-strobe="warning"] {animation:tcwsStrobeWarn 1.4s ease-in-out infinite}
      nav[data-tcws-strobe="info"]    {animation:tcwsStrobeInfo 1.8s ease-in-out infinite}

      /* ── Views ticker ────────────────────────────────────────── */
      #tcws-views-ticker{padding:1px 0 2px;overflow:hidden}
      .tcws-ticker-item{display:flex;align-items:center;gap:5px;padding:2px 12px 2px 15px;font-size:10px;font-weight:600;font-family:system-ui,sans-serif;white-space:nowrap;overflow:hidden;opacity:1;transition:opacity 1.8s ease-out;color:rgba(255,255,255,.5);line-height:1.5;min-height:0}
      .tcws-ticker-item.fading{opacity:0}
      .tcws-ticker-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,.25)}
      .tcws-ticker-item[data-level="critical"] .tcws-ticker-dot{background:#ef4444}
      .tcws-ticker-item[data-level="warning"]  .tcws-ticker-dot{background:#f59e0b}
      .tcws-ticker-item[data-level="info"]     .tcws-ticker-dot{background:#3b82f6}
      .tcws-ticker-item[data-level="ok"]       .tcws-ticker-dot{background:#10b981}
      .tcws-ticker-item[data-level="critical"]{color:rgba(239,68,68,.82)}
      .tcws-ticker-item[data-level="warning"] {color:rgba(245,158,11,.78)}
      .tcws-ticker-item[data-level="info"]    {color:rgba(148,163,184,.65)}
      .tcws-ticker-item[data-level="ok"]      {color:rgba(52,211,153,.72)}
      .tcws-ticker-txt{flex:1;overflow:hidden;text-overflow:ellipsis}
      .tcws-ticker-ts{font-size:9px;font-weight:700;opacity:.45;flex-shrink:0;letter-spacing:.02em;margin-left:2px}

      /* ── Panel shell ────────────────────────────────────────── */
      .tcws-panel{position:fixed;z-index:2147483644;background:var(--t-bg1);color:var(--t-text1);border:1px solid var(--t-border2);font-family:inherit;font-size:12px;display:none}
      @keyframes tcwsPanelIn{from{opacity:0;transform:translateX(-14px) scale(.97)}to{opacity:1;transform:none}}
      .tcws-panel.open{display:flex;flex-direction:column}
      .tcws-panel.open .tcws-panel-inner{animation:tcwsPanelIn .2s cubic-bezier(.22,.68,0,1.2)}
      .tcws-panel[data-scanline="1"]::before{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;border-radius:inherit;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 3px,rgba(0,0,0,.07) 3px,rgba(0,0,0,.07) 4px)}
      .tcws-panel-inner{width:var(--tcws-nm-width,600px);max-width:95vw;display:flex;flex-direction:column;max-height:86vh;overflow:hidden;border-radius:inherit;position:relative;z-index:2;zoom:var(--tcws-scale,1)}

      /* ── Detail panel ────────────────────────────────────────── */
      #tcws-detail-panel .tcws-panel-inner{display:flex;flex-direction:row;width:var(--tcws-det-width,940px);max-width:94vw;max-height:92vh;overflow:hidden}
      /* Fields column — left side of detail panel, hidden by default */
      .tcws-det-fields-col{display:none;flex-direction:column;width:var(--tcws-fld-width,340px);min-width:var(--tcws-fld-width,340px);max-width:var(--tcws-fld-width,340px);border-right:1px solid var(--t-border2);background:var(--t-bg0);overflow:hidden;flex-shrink:0}
      .tcws-det-fields-col.open{display:flex}
      #tcws-detail-panel.fields-open .tcws-panel-inner{width:min(1340px,94vw)}
      /* Main column — always visible */
      .tcws-det-main-col{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
      .tcws-det-composer{margin-top:10px;border-top:1px solid var(--t-border2);padding-top:10px;display:flex;flex-direction:column;gap:6px}
      .tcws-det-composer-type{display:flex;gap:4px}
      .tcws-det-composer-type button{flex:1;padding:4px 0;font-size:13px;border-radius:6px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;transition:all .15s}
      .tcws-det-composer-type button.active{background:var(--t-accent-dim);border-color:var(--t-accent-brd);color:var(--t-accent-txt)}
      .tcws-det-composer textarea{width:100%;box-sizing:border-box;min-height:80px;resize:vertical;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:8px;color:var(--t-text1);font-size:12px;padding:7px 9px;font-family:inherit;line-height:1.5}
      .tcws-det-composer textarea:focus{outline:none;border-color:var(--t-accent-brd)}
      .tcws-det-composer-actions{display:flex;gap:6px;justify-content:flex-end}
      .tcws-det-composer-send{background:var(--t-accent);color:#fff;border:none;border-radius:7px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600}
      .tcws-det-composer-send:disabled{opacity:.5;cursor:default}
      .tcws-det-composer-send:hover:not(:disabled){filter:brightness(1.1)}
      @keyframes tcwsDetailIn{from{opacity:0;transform:translateX(10px) scale(.97)}to{opacity:1;transform:none}}
      /* ── Agent picker side panel ─────────────────────────────── */
      #tcws-agent-picker.open{animation:tcwsDetailIn .18s cubic-bezier(.22,.68,0,1.2)}
      #tcws-agent-picker .tcws-panel-inner{width:280px;max-width:92vw;max-height:92vh}
      .tcws-ap-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--t-border);background:var(--t-bg0);flex-shrink:0}
      .tcws-ap-title{font-size:13px;font-weight:800;color:var(--t-text1);letter-spacing:.04em}
      .tcws-ap-close{background:none;border:none;color:var(--t-text3);cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px;font-family:inherit}
      .tcws-ap-close:hover{color:var(--t-text1);background:var(--t-btn-hover)}
      .tcws-ap-search{padding:8px 10px;border-bottom:1px solid var(--t-border);flex-shrink:0}
      .tcws-ap-search input{width:100%;box-sizing:border-box;padding:5px 8px;background:var(--t-bg0);border:1px solid var(--t-border2);border-radius:6px;color:var(--t-text1);font-size:11px;font-family:inherit;outline:none}
      .tcws-ap-search input:focus{border-color:var(--t-accent-brd)}
      .tcws-ap-list{flex:1;overflow-y:auto;padding:4px 0}
      .tcws-ap-item{display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;transition:background .1s}
      .tcws-ap-item:hover{background:var(--t-btn-hover)}
      .tcws-ap-item-info{flex:1;min-width:0}
      .tcws-ap-item-name{font-size:13px;font-weight:600;color:var(--t-text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tcws-ap-item-status{font-size:12px;color:var(--t-text3)}
      .tcws-ap-item-btn{flex-shrink:0;padding:3px 9px;font-size:12px;font-weight:600;border-radius:5px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;font-family:inherit}
      .tcws-ap-item-btn:hover{background:var(--t-btn-hover)}
      .tcws-ap-item-btn.added{background:var(--t-accent-dim);border-color:var(--t-accent-brd);color:var(--t-accent-txt)}
      #tcws-detail-panel.open{animation:tcwsDetailIn .18s cubic-bezier(.22,.68,0,1.2)}
      .tcws-det-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--t-border);background:var(--t-bg0);flex-shrink:0}
      .tcws-det-title{font-size:13px;font-weight:800;color:var(--t-text1);letter-spacing:.04em}
      .tcws-det-close{background:none;border:none;color:var(--t-text3);cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px;font-family:inherit}
      .tcws-det-close:hover{color:var(--t-text1);background:var(--t-btn-hover)}
      .tcws-det-body{flex:1;overflow-y:auto;padding:14px}
      .tcws-det-body::-webkit-scrollbar{width:4px}
      .tcws-det-body::-webkit-scrollbar-track{background:transparent}
      .tcws-det-body::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      /* ── Three-zone layout: meta / convo / footer ── */
      .tcws-det-meta{flex-shrink:0;max-height:220px;overflow-y:auto;padding:12px 14px;border-bottom:1px solid var(--t-border)}
      .tcws-det-meta::-webkit-scrollbar{width:3px}
      .tcws-det-meta::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      .tcws-det-date-row{display:flex;gap:0;margin-bottom:4px;font-size:13px;flex-wrap:wrap}
      .tcws-det-date-item{display:flex;align-items:flex-start;gap:8px;flex:1;min-width:180px}
      .tcws-det-convo{flex:1;overflow-y:auto;padding:0;display:flex;flex-direction:column;min-height:0;background:var(--t-bg1);border:2px solid var(--t-border2);border-radius:8px;margin:8px 10px;}
      .tcws-det-convo::-webkit-scrollbar{width:4px}
      .tcws-det-convo::-webkit-scrollbar-track{background:transparent}
      .tcws-det-convo::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      .tcws-det-footer{flex-shrink:0;padding:10px 14px;border-top:1px solid var(--t-border);background:var(--t-bg0);overflow-y:auto;max-height:340px}
      .tcws-det-footer::-webkit-scrollbar{width:3px}
      .tcws-det-footer::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      /* ── Convo header bar ── */
      .tcws-convo-hdr{display:flex;align-items:center;justify-content:space-between;padding:7px 14px 6px;border-bottom:1px solid var(--t-border);background:var(--t-bg0);flex-shrink:0}
      .tcws-convo-hdr-label{font-size:10px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase}
      .tcws-convo-hdr-count{font-size:10px;font-weight:600;color:var(--t-text3)}
      /* ── Date separators ── */
      .tcws-convo-date-sep{text-align:center;font-size:10px;font-weight:700;color:var(--t-text3);letter-spacing:.06em;padding:10px 0 4px;flex-shrink:0}
      /* ── Chat bubbles ── */
      .tcws-convo-bubble{margin:6px 12px;border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.55;word-break:break-word}
      .tcws-convo-bubble.tcws-convo-reply{background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.22)}
      .tcws-convo-bubble.tcws-convo-note{background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.22)}
      .tcws-convo-bubble-hdr{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap}
      .tcws-convo-avatar{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:800;flex-shrink:0}
      .tcws-convo-avatar.tcws-convo-reply{background:rgba(59,130,246,.3);color:#93c5fd}
      .tcws-convo-avatar.tcws-convo-note{background:rgba(249,115,22,.3);color:#fdba74}
      .tcws-convo-author{font-size:12px;font-weight:700;color:var(--t-text1);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tcws-convo-kind-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap}
      .tcws-convo-kind-badge.tcws-convo-reply{background:rgba(59,130,246,.18);color:#93c5fd}
      .tcws-convo-kind-badge.tcws-convo-note{background:rgba(249,115,22,.18);color:#fdba74}
      .tcws-convo-ts{font-size:10px;color:var(--t-text3);white-space:nowrap;margin-left:auto}
      .tcws-convo-bubble-body{color:var(--t-text2);white-space:pre-wrap}
      /* ── Event chips (status/assign) ── */
      .tcws-convo-event{display:flex;align-items:center;gap:6px;padding:4px 14px;font-size:11px;flex-shrink:0}
      .tcws-convo-event-icon{font-size:10px;color:var(--t-text3);flex-shrink:0}
      .tcws-convo-event-text{color:var(--t-text3);font-weight:600}
      .tcws-convo-event.tcws-convo-status .tcws-convo-event-text{color:var(--t-warn)}
      .tcws-convo-event.tcws-convo-assign .tcws-convo-event-text{color:var(--t-ok)}
      .tcws-convo-event-by{color:var(--t-text3);font-size:10px}
      .tcws-convo-event-ts{font-size:10px;color:var(--t-text3);margin-left:auto}
      .tcws-convo-empty{padding:20px 14px;font-size:12px;color:var(--t-text3);text-align:center}

      /* ── Media Viewer ─────────────────────────────────────────────────────── */
      .tcws-media-viewall-btn{margin-left:auto;background:var(--t-bg2);border:1px solid var(--t-border2);color:var(--t-accent);border-radius:5px;font-size:10px;font-weight:700;padding:2px 8px;cursor:pointer;font-family:inherit;letter-spacing:.03em;white-space:nowrap}
      .tcws-media-viewall-btn:hover{background:var(--t-btn-hover);border-color:var(--t-accent-brd)}
      .tcws-media-thumb-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
      .tcws-media-thumb-wrap{width:80px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--t-border2);cursor:pointer;flex-shrink:0;background:var(--t-bg0);display:flex;align-items:center;justify-content:center}
      .tcws-media-thumb-wrap:hover{border-color:var(--t-accent-brd);box-shadow:0 0 0 2px rgba(var(--t-accent-rgb,.5,.7,1),.25)}
      .tcws-media-thumb{width:100%;height:100%;object-fit:cover;display:block}
      .tcws-media-audio-wrap{margin-top:7px;display:flex;flex-direction:column;gap:3px}
      .tcws-media-audio-label{font-size:10px;font-weight:700;color:var(--t-text3);letter-spacing:.04em}
      .tcws-media-audio{width:100%;height:32px;border-radius:6px;accent-color:var(--t-accent)}
      /* Lightbox / grid overlay */
      .tcws-media-lightbox{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
      .tcws-media-lightbox-box{background:var(--t-bg1,#1e1e2e);border:1px solid var(--t-border2,#333);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-width:min(90vw,860px);max-height:90vh;width:100%}
      .tcws-media-lightbox-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--t-border,#2a2a3a);background:var(--t-bg0,#13131f);flex-shrink:0}
      .tcws-media-lightbox-name{font-size:12px;font-weight:700;color:var(--t-text1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-media-lightbox-close{background:none;border:none;color:var(--t-text3);font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:4px;font-family:inherit;flex-shrink:0}
      .tcws-media-lightbox-close:hover{color:var(--t-text1);background:var(--t-btn-hover)}
      .tcws-media-lightbox-imgwrap{position:relative;display:flex;align-items:center;justify-content:center;flex:1;overflow:auto;padding:16px;background:var(--t-bg0,#13131f);min-height:200px}
      .tcws-media-lightbox-img{max-width:100%;max-height:calc(90vh - 80px);object-fit:contain;border-radius:4px;display:block}
      .tcws-media-lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:22px;line-height:1;border-radius:6px;cursor:pointer;padding:4px 10px;transition:background .15s}
      .tcws-media-lb-nav:hover{background:rgba(0,0,0,.8)}
      .tcws-media-lb-prev{left:8px}
      .tcws-media-lb-next{right:8px}
      .tcws-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;padding:12px;overflow-y:auto;max-height:calc(90vh - 56px)}
      .tcws-media-grid-cell{aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--t-border2);cursor:pointer;background:var(--t-bg0)}
      .tcws-media-grid-cell:hover{border-color:var(--t-accent-brd);box-shadow:0 0 0 2px rgba(120,140,255,.25)}
      .tcws-media-grid-img{width:100%;height:100%;object-fit:cover;display:block}
      .tcws-det-ticket-id{font-size:11px;font-weight:700;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
      .tcws-det-subject{font-size:14px;font-weight:800;color:var(--t-text1);line-height:1.35;margin-bottom:10px;word-break:break-word;text-shadow:var(--t-text-glow,none)}
      .tcws-det-badges{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
      .tcws-det-field{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;font-size:13px}
      .tcws-det-field-lbl{font-size:11px;font-weight:700;color:var(--t-text3);letter-spacing:.06em;text-transform:uppercase;width:64px;flex-shrink:0;padding-top:1px}
      .tcws-det-field-val{color:var(--t-text2);flex:1;line-height:1.4;word-break:break-word}
      .tcws-det-desc{font-size:12px;color:var(--t-text3);line-height:1.6;padding:10px 12px;border-radius:6px;background:var(--t-bg3);margin:10px 0;border:1px solid var(--t-border);max-height:120px;overflow-y:auto}
      .tcws-det-merge-box{padding:10px 12px;border-radius:7px;border:1px solid var(--t-crit-brd);background:var(--t-crit-dim);margin-bottom:12px}
      .tcws-det-merge-lbl{font-size:11px;font-weight:800;color:var(--t-crit);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}
      .tcws-det-merge-target{font-size:13px;font-weight:700;color:var(--t-crit)}
      .tcws-det-merge-target a{color:inherit;text-decoration:underline}
      .tcws-det-timeline{margin-top:12px;border-top:1px solid var(--t-border);padding-top:10px}
      .tcws-det-timeline-hdr{font-size:11px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
      .tcws-det-titem{display:flex;gap:8px;margin-bottom:8px;font-size:12px}
      .tcws-det-titem:last-child{margin-bottom:0}
      .tcws-det-titem-time{font-size:11px;font-weight:700;color:var(--t-text3);white-space:nowrap;min-width:36px;padding-top:1px}
      .tcws-det-titem-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:3px}
      .tcws-det-titem-dot.reply{background:#3b82f6}
      .tcws-det-titem-dot.note{background:#f97316}
      .tcws-det-titem-dot.pickup{background:var(--t-ok)}
      .tcws-det-titem-dot.status{background:var(--t-warn)}
      .tcws-det-titem-dot.merge{background:var(--t-crit)}
      .tcws-det-titem-dot.update{background:var(--t-text3)}
      .tcws-det-titem-text{color:var(--t-text2);line-height:1.4;flex:1;word-break:break-word}
      .tcws-det-titem-text.reply{color:#60a5fa}
      .tcws-det-titem-text.note{color:#fb923c}
      .tcws-det-titem-text.pickup{color:var(--t-ok)}
      .tcws-det-titem-text.merge{color:var(--t-crit)}
      .tcws-det-titem-author{display:inline-block;font-size:11px;font-weight:700;padding:1px 5px;border-radius:4px;margin-right:4px;white-space:nowrap;vertical-align:middle}
      .tcws-det-titem-author.reply{background:rgba(59,130,246,.18);color:#93c5fd}
      .tcws-det-titem-author.note{background:rgba(249,115,22,.18);color:#fdba74}
      .tcws-det-titem-author.pickup{background:rgba(16,185,129,.15);color:#6ee7b7}
      .tcws-det-titem-author.status{background:rgba(245,158,11,.15);color:#fcd34d}
      .tcws-det-titem-author.merge{background:rgba(239,68,68,.15);color:#fca5a5}
      .tcws-det-titem-author.update{background:rgba(255,255,255,.08);color:var(--t-text3)}
      .tcws-det-loading{font-size:13px;color:var(--t-text3);padding:20px 0;text-align:center}
      .tcws-det-action-row{display:flex;gap:8px;margin-top:12px}
      .tcws-det-action-row .tcws-btn{flex:1;justify-content:center;padding:8px 6px;font-size:12px;font-weight:700}
      .tcws-det-take-btn{flex:1;padding:8px 6px;border-radius:7px;border:1px solid var(--t-accent-brd);background:var(--t-accent-dim);color:var(--t-accent-txt);font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;transition:filter .12s;text-align:center}
      .tcws-det-take-btn:hover{filter:brightness(1.2)}
      .tcws-det-take-btn:disabled{opacity:.5;cursor:not-allowed;filter:none}
      .tcws-det-fields-btn{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .12s;white-space:nowrap}
      .tcws-det-fields-btn:hover{background:var(--t-btn-hover);color:var(--t-text1)}
      .tcws-det-fields-btn[data-active="1"]{background:var(--t-accent-dim);border-color:var(--t-accent-brd);color:var(--t-accent-txt)}
      .tcws-det-custom-fields{margin-top:10px;border-top:1px solid var(--t-border);padding-top:10px}
      .tcws-det-custom-fields-hdr{font-size:11px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
      .tcws-det-cf-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}
      .tcws-det-cf-item{display:flex;flex-direction:column;gap:1px;padding:5px 8px;border-radius:6px;background:var(--t-bg3);border:1px solid var(--t-border)}
      .tcws-det-cf-lbl{font-size:11px;font-weight:700;color:var(--t-text3);letter-spacing:.05em;text-transform:uppercase}
      .tcws-det-cf-val{font-size:13px;color:var(--t-text1);font-weight:500;word-break:break-word;line-height:1.35}

      /* ── Fields editor panel ──────────────────────────────────── */
      #tcws-fields-panel .tcws-panel-inner{width:${FIELDS_PANEL_W}px;max-width:92vw;max-height:92vh}
      #tcws-fields-panel.open{animation:tcwsDetailIn .18s cubic-bezier(.22,.68,0,1.2)}
      .tcws-fp-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--t-border);background:var(--t-bg0);flex-shrink:0}
      .tcws-fp-title{font-size:13px;font-weight:800;color:var(--t-text1);letter-spacing:.04em;display:flex;align-items:center;gap:7px}
      .tcws-fp-title-badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--t-accent-dim);color:var(--t-accent-txt);border:1px solid var(--t-accent-brd)}
      .tcws-fp-close{background:none;border:none;color:var(--t-text3);cursor:pointer;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px;font-family:inherit}
      .tcws-fp-close:hover{color:var(--t-text1);background:var(--t-btn-hover)}
      .tcws-fp-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
      .tcws-fp-body::-webkit-scrollbar{width:4px}
      .tcws-fp-body::-webkit-scrollbar-track{background:transparent}
      .tcws-fp-body::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      .tcws-fp-section{display:flex;flex-direction:column;gap:8px}
      .tcws-fp-section-hdr{font-size:11px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;padding-bottom:5px;border-bottom:1px solid var(--t-border);margin-bottom:2px}
      .tcws-fp-field{display:flex;flex-direction:column;gap:4px}
      .tcws-fp-field-lbl{font-size:12px;font-weight:700;color:var(--t-text3);letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:5px}
      .tcws-fp-field-lbl-dirty{width:5px;height:5px;border-radius:50%;background:var(--t-warn);flex-shrink:0;display:none}
      .tcws-fp-field.dirty .tcws-fp-field-lbl-dirty{display:inline-block}
      .tcws-fp-input{width:100%;box-sizing:border-box;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:6px;color:var(--t-text1);font-size:12px;padding:6px 10px;font-family:inherit;transition:border-color .12s;outline:none;min-height:32px}
      .tcws-fp-input:focus{border-color:var(--t-accent-brd);background:var(--t-bg3)}
      .tcws-fp-input.dirty{border-color:rgba(245,158,11,.7)}
      .tcws-fp-textarea{min-height:80px;resize:vertical;line-height:1.5;padding:8px 10px}
      .tcws-fp-select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}
      .tcws-fp-checkbox-row{display:flex;align-items:center;gap:8px;padding:5px 2px}
      .tcws-fp-checkbox{width:15px;height:15px;accent-color:var(--t-accent);cursor:pointer;flex-shrink:0}
      .tcws-fp-checkbox-lbl{font-size:12px;color:var(--t-text1);cursor:pointer;font-weight:500}
      .tcws-fp-footer{padding:10px 14px;border-top:1px solid var(--t-border);background:var(--t-bg0);flex-shrink:0;display:flex;flex-direction:column;gap:6px}
      .tcws-fp-save-row{display:flex;gap:6px;align-items:center}
      .tcws-fp-save-btn{flex:1;padding:7px 12px;border-radius:7px;border:none;background:var(--t-accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:filter .12s}
      .tcws-fp-save-btn:hover:not(:disabled){filter:brightness(1.1)}
      .tcws-fp-save-btn:disabled{opacity:.5;cursor:not-allowed}
      .tcws-fp-discard-btn{padding:7px 12px;border-radius:7px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s}
      .tcws-fp-discard-btn:hover{background:var(--t-btn-hover);color:var(--t-text1)}
      .tcws-fp-status-bar{font-size:12px;font-weight:600;padding:4px 8px;border-radius:5px;text-align:center;display:none}
      .tcws-fp-status-bar.ok{display:block;background:rgba(16,185,129,.15);color:#6ee7b7;border:1px solid rgba(16,185,129,.3)}
      .tcws-fp-status-bar.err{display:block;background:var(--t-crit-dim);color:var(--t-crit);border:1px solid var(--t-crit-brd)}
      .tcws-fp-status-bar.saving{display:block;background:var(--t-accent-dim);color:var(--t-accent-txt);border:1px solid var(--t-accent-brd)}

      /* ── Interaction history (detail panel) ──────────────────── */
      .tcws-det-history{margin-top:14px;border-top:1px solid var(--t-border);padding-top:10px}
      .tcws-det-history-hdr{font-size:11px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
      .tcws-det-history-hdr span{font-size:9px;font-weight:600;color:var(--t-text3);cursor:pointer;padding:2px 7px;border-radius:4px;background:var(--t-btn-bg);border:1px solid var(--t-border)}
      .tcws-det-history-hdr span:hover{background:var(--t-btn-hover)}
      .tcws-det-hist-row{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:6px;border:1px solid var(--t-border);background:var(--t-bg2);margin-bottom:5px;cursor:pointer;transition:background .1s}
      .tcws-det-hist-row:hover{background:var(--t-bg3);border-color:var(--t-border2)}
      .tcws-det-hist-badge{font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:.04em;white-space:nowrap;flex-shrink:0}
      .tcws-det-hist-badge[data-s="open"]{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.3)}
      .tcws-det-hist-badge[data-s="new"]{background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)}
      .tcws-det-hist-badge[data-s="pending"]{background:rgba(245,158,11,.15);color:#fcd34d;border:1px solid rgba(245,158,11,.3)}
      .tcws-det-hist-badge[data-s="hold"]{background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.3)}
      .tcws-det-hist-badge[data-s="solved"]{background:rgba(255,255,255,.06);color:var(--t-text3);border:1px solid var(--t-border)}
      .tcws-det-hist-badge[data-s="closed"]{background:rgba(255,255,255,.04);color:var(--t-text3);border:1px solid var(--t-border);opacity:.7}
      .tcws-det-hist-subject{flex:1;font-size:13px;color:var(--t-text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-det-hist-id{font-size:12px;color:var(--t-text3);font-weight:700;flex-shrink:0}
      .tcws-det-hist-age{font-size:11px;color:var(--t-text3);flex-shrink:0;opacity:.7}
      .tcws-fp-dirty-count{font-size:12px;color:var(--t-warn);font-weight:700;display:none}
      .tcws-fp-dirty-count.visible{display:block}

      /* ── Combobox (searchable dropdown, escapes overflow clipping via fixed) ── */
      .tcws-combo-wrap{position:relative;width:100%}
      .tcws-combo-input{width:100%;box-sizing:border-box;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:6px;color:var(--t-text1);font-size:12px;padding:6px 28px 6px 10px;font-family:inherit;outline:none;cursor:pointer;transition:border-color .12s;min-height:32px}
      .tcws-combo-input:focus{border-color:var(--t-accent-brd);background:var(--t-bg3)}
      .tcws-combo-input.dirty{border-color:rgba(245,158,11,.7)}
      .tcws-combo-arrow{position:absolute;right:9px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--t-text3)}
      .tcws-combo-clear{position:absolute;right:24px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--t-text3);cursor:pointer;font-size:14px;line-height:1;padding:0 3px;display:none;font-family:inherit}
      .tcws-combo-clear.visible{display:block}
      .tcws-combo-clear:hover{color:var(--t-text1)}
      /* Dropdown is appended to body so it escapes overflow:hidden */
      .tcws-combo-dropdown{position:fixed;z-index:2147483647;background:var(--t-bg1,#111827);border:1px solid var(--t-border2,rgba(255,255,255,.2));border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.7);overflow:hidden;display:none;flex-direction:column;min-width:220px;max-width:420px}
      .tcws-combo-dropdown.open{display:flex}
      .tcws-combo-search{padding:8px 10px;border-bottom:1px solid var(--t-border);flex-shrink:0}
      .tcws-combo-search input{width:100%;box-sizing:border-box;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:5px;color:var(--t-text1);font-size:13px;padding:5px 8px;font-family:inherit;outline:none}
      .tcws-combo-search input:focus{border-color:var(--t-accent-brd)}
      .tcws-combo-list{overflow-y:auto;max-height:220px}
      .tcws-combo-option{padding:7px 12px;font-size:12px;color:var(--t-text1);cursor:pointer;transition:background .08s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tcws-combo-option:hover,.tcws-combo-option.focused{background:var(--t-btn-hover)}
      .tcws-combo-option.selected{background:var(--t-accent-dim);color:var(--t-text1)}
      .tcws-combo-option.none-opt{color:var(--t-text3);font-style:italic}
      .tcws-combo-empty{padding:10px 12px;font-size:13px;color:var(--t-text3);text-align:center}

      /* ── Call banner ─────────────────────────────────────────────── */
      .tcws-call-banner{display:none;align-items:stretch;height:36px;background:linear-gradient(90deg,rgba(239,68,68,.12) 0%,rgba(239,68,68,.04) 100%);border-bottom:1px solid rgba(239,68,68,.28);flex-shrink:0;overflow:hidden;position:relative}
      .tcws-call-banner.active{display:flex}
      /* Left LIVE pill */
      .tcws-call-banner-live{display:flex;align-items:center;gap:5px;padding:0 12px;background:rgba(239,68,68,.14);border-right:1px solid rgba(239,68,68,.25);flex-shrink:0;z-index:2}
      .tcws-call-banner-live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:tcwsBannerPulse 1.2s ease-in-out infinite}
      .tcws-call-banner-live-txt{font-size:9px;font-weight:900;letter-spacing:.14em;color:var(--t-crit);text-transform:uppercase;white-space:nowrap}
      @keyframes tcwsBannerPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.7);opacity:1}50%{box-shadow:0 0 0 5px rgba(239,68,68,0);opacity:.6}}
      /* Card crossfade viewport — no perspective; avoids 3D clipping artifacts */
      .tcws-call-banner-track{flex:1;overflow:hidden;display:flex;align-items:center;position:relative}
      /* Each card — absolutely stacked; crossfade in/out, no 3D flip */
      .tcws-call-banner-card{position:absolute;inset:0;display:flex;align-items:center;gap:8px;padding:0 16px;opacity:0;pointer-events:none;transition:none}
      .tcws-call-banner-track.has-counter .tcws-call-banner-card{padding-right:46px}
      .tcws-call-banner-card.active{opacity:1;pointer-events:auto;transition:opacity .2s ease}
      .tcws-call-banner-card.exit{opacity:0;pointer-events:none;transition:opacity .15s ease}
      /* Dept pill — solid fill so it reads on both light and dark themes */
      .tcws-call-banner-dept{display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:900;letter-spacing:.10em;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
      /* Direction tag — solid fill */
      .tcws-call-banner-dir{font-size:8px;font-weight:800;letter-spacing:.08em;padding:1px 5px;border-radius:3px;text-transform:uppercase;flex-shrink:0}
      .tcws-call-banner-dir.inbound{background:#3b82f6;color:#ffffff}
      .tcws-call-banner-dir.outbound{background:#8b5cf6;color:#ffffff}
      /* Text elements — CSS vars so they adapt to light/dark themes */
      .tcws-call-banner-caller{font-size:11px;font-weight:600;color:var(--t-text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
      .tcws-call-banner-sep{color:var(--t-text3);font-size:10px;margin:0 1px;flex-shrink:0}
      .tcws-call-banner-agent{font-size:10px;font-weight:700;color:var(--t-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
      .tcws-call-banner-dur{font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--t-text3);white-space:nowrap;margin-left:auto;flex-shrink:0}
      /* Counter badge (top-right of track, multi-call only) */
      .tcws-call-banner-counter{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:800;color:var(--t-text3);letter-spacing:.06em;pointer-events:none;z-index:3}

      /* ── Role picker strip ───────────────────────────────────── */
      .tcws-role-strip{display:flex;align-items:center;gap:8px;padding:7px 16px;background:var(--t-bg0);border-bottom:1px solid var(--t-border);flex-shrink:0;flex-wrap:wrap}
      .tcws-role-strip-lbl{font-size:11px;font-weight:800;color:var(--t-text3);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
      .tcws-role-select{-webkit-appearance:none;appearance:none;background:var(--t-btn-bg);border:1px solid var(--t-border2);color:var(--t-text2);border-radius:6px;padding:6px 28px 6px 10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;outline:none;line-height:normal;height:auto;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;min-width:0;max-width:100%;text-overflow:ellipsis}
      .tcws-role-strip .tcws-role-select{flex:1;min-width:120px}
      .tcws-role-select:focus{border-color:var(--t-accent)}
      .tcws-role-select option{background:var(--t-bg1);color:var(--t-text1)}
      .tcws-user-chip{font-size:12px;font-weight:700;color:var(--t-text3);white-space:nowrap}

      /* ── Header ─────────────────────────────────────────────── */
      .tcws-hdr{display:flex;align-items:center;justify-content:space-between;padding:13px 16px 12px;flex-shrink:0;background:var(--t-hdr-grad);border-bottom:1px solid var(--t-border)}
      .tcws-hdr-left{display:flex;align-items:center;gap:11px}
      .tcws-hdr-icon{width:32px;height:32px;border-radius:9px;flex-shrink:0;background:var(--t-accent-dim);border:1px solid var(--t-accent-brd);display:flex;align-items:center;justify-content:center;box-shadow:var(--t-border-glow,none)}
      .tcws-hdr-icon svg{width:16px;height:16px;display:block}
      .tcws-title-stack{display:flex;flex-direction:column;gap:1px}
      .tcws-hdr-title{font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--t-text1);text-shadow:var(--t-text-glow,none);line-height:1}
      .tcws-hdr-sub{font-size:11px;font-weight:600;color:var(--t-text3);letter-spacing:.03em}
      .tcws-hdr-right{display:flex;align-items:center;gap:8px}

      /* Countdown ring */
      .tcws-cd-wrap{position:relative;width:36px;height:36px;flex-shrink:0;transition:opacity .3s}
      .tcws-cd-svg{display:block;transform:rotate(-90deg)}
      .tcws-ring-track{fill:none;stroke:var(--t-border2);stroke-width:2.8}
      .tcws-ring-prog{fill:none;stroke:var(--t-accent);stroke-width:2.8;stroke-linecap:round;stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:0;transition:stroke-dashoffset .85s linear;filter:drop-shadow(0 0 3px var(--t-accent))}
      .tcws-cd-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;color:var(--t-accent-txt);pointer-events:none}
      .tcws-ar-chip{font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--t-accent-dim);color:var(--t-accent-txt);border:1px solid var(--t-accent-brd);white-space:nowrap;box-shadow:var(--t-border-glow,none)}
      .tcws-ar-chip[data-on="0"]{background:var(--t-btn-bg);color:var(--t-text3);border-color:var(--t-border);box-shadow:none}
      .tcws-hdr-btn{padding:5px 11px;border-radius:6px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;font-size:13px;font-weight:700;transition:background .12s,color .12s;white-space:nowrap;font-family:inherit}
      .tcws-hdr-btn:hover{background:var(--t-btn-hover);color:var(--t-text1)}

      /* ── Tabs ───────────────────────────────────────────────── */
      .tcws-tabs{display:flex;flex-shrink:0;border-bottom:1px solid var(--t-border);background:var(--t-bg0);overflow-x:auto}
      .tcws-tabs::-webkit-scrollbar{display:none}
      .tcws-tab{flex:1;min-width:52px;padding:9px 5px;border:none;border-bottom:2.5px solid transparent;background:transparent;color:var(--t-text3);cursor:pointer;font-size:8.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;transition:color .12s,border-color .12s,background .12s;display:flex;align-items:center;justify-content:center;gap:3px;font-family:inherit;white-space:nowrap}
      .tcws-tab:hover:not([data-on="1"]){color:var(--t-text2);background:var(--t-btn-bg)}
      .tcws-tab[data-on="1"]{color:var(--t-accent-txt);border-bottom-color:var(--t-accent)}
      .tcws-tab-n{display:none;min-width:15px;height:15px;padding:0 3px;border-radius:99px;background:var(--t-crit);color:#fff;font-size:9px;font-weight:800;line-height:15px;text-align:center}
      .tcws-tab-n.vis{display:inline-block}

      /* ── Body ───────────────────────────────────────────────── */
      .tcws-body{flex:1;overflow-y:auto;overflow-x:hidden;min-width:0;padding:14px 16px;background:var(--t-bg2)}
      .tcws-body::-webkit-scrollbar{width:4px}
      .tcws-body::-webkit-scrollbar-track{background:transparent}
      .tcws-body::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}

      /* ── Section header ─────────────────────────────────────── */
      .tcws-sec{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--t-text3);margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid var(--t-border);display:flex;align-items:center;justify-content:space-between}
      .tcws-sec-action{cursor:pointer;color:var(--t-accent-txt);font-size:11px;font-weight:700;background:none;border:none;padding:0;font-family:inherit}
      .tcws-sec-action:hover{text-decoration:underline}
      .tcws-sec-action.danger{color:var(--t-crit)}
      .tcws-sec-actions{display:flex;gap:10px;align-items:center}

      /* ── Alert cards ────────────────────────────────────────── */
      @keyframes tcwsCardIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
      .tcws-acard{border:1px solid var(--t-border);border-left:3px solid var(--t-border2);border-radius:8px;background:var(--t-bg3);padding:12px 14px;margin-bottom:8px;animation:tcwsCardIn .18s ease-out}
      .tcws-acard:last-child{margin-bottom:0}
      .tcws-acard[data-level="critical"]{border-left-color:var(--t-crit);box-shadow:inset 3px 0 12px -4px var(--t-crit-dim)}
      .tcws-acard[data-level="warning"] {border-left-color:var(--t-warn)}
      .tcws-acard[data-level="info"]    {border-left-color:var(--t-info)}
      .tcws-acard[data-level="normal"]  {border-left-color:var(--t-ok)}
      .tcws-acard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .tcws-acard-info{flex:1;min-width:0}
      .tcws-level-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t-text3);margin-bottom:5px}
      .tcws-level-tag i{width:5px;height:5px;border-radius:50%;flex-shrink:0;display:inline-block}
      .tcws-acard[data-level="critical"] .tcws-level-tag{color:var(--t-crit)}
      .tcws-acard[data-level="critical"] .tcws-level-tag i{background:var(--t-crit)}
      .tcws-acard[data-level="warning"]  .tcws-level-tag{color:var(--t-warn)}
      .tcws-acard[data-level="warning"]  .tcws-level-tag i{background:var(--t-warn)}
      .tcws-acard[data-level="info"]     .tcws-level-tag i{background:var(--t-info)}
      .tcws-acard[data-level="normal"]   .tcws-level-tag i{background:var(--t-ok)}
      .tcws-acard-title{font-size:13px;font-weight:800;color:var(--t-text1);line-height:1.35;word-break:break-word}
      .tcws-acard-meta{font-size:12px;color:var(--t-text3);margin-top:3px}
      .tcws-acard-btns{display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end}
      .tcws-acard-pill-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
      .tcws-acard-take-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}

      /* ── Snooze row ─────────────────────────────────────────── */
      .tcws-snooze-row{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px;align-items:center}
      .tcws-snooze-lbl{font-size:11px;font-weight:700;color:var(--t-text3);letter-spacing:.05em;text-transform:uppercase;margin-right:2px}

      /* ── Buttons ────────────────────────────────────────────── */
      .tcws-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;font-size:13px;font-weight:700;transition:background .12s,color .12s;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-family:inherit}
      .tcws-btn:hover{background:var(--t-btn-hover);color:var(--t-text1)}
      .tcws-btn.xs{padding:3px 8px;font-size:10px;border-radius:4px}
      .tcws-btn.accent{background:var(--t-accent-dim);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-btn.accent:hover{filter:brightness(1.2)}
      .tcws-btn.danger{border-color:var(--t-crit-brd)}
      .tcws-btn.danger:hover{background:var(--t-crit-dim);color:var(--t-crit)}
      .tcws-btn.ok{background:rgba(16,185,129,.12);color:#34d399;border-color:rgba(16,185,129,.3)}
      .tcws-btn.ok:hover{filter:brightness(1.2)}
      .tcws-btn.snooze-xs{padding:2px 7px;font-size:9px;border-radius:3px;font-weight:700}
      .tcws-full-btn{width:100%;padding:9px;border-radius:7px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;transition:filter .12s;margin-top:8px;display:block;text-align:center}
      .tcws-full-btn.start{border:1px solid var(--t-accent-brd);background:var(--t-accent-dim);color:var(--t-accent-txt)}
      .tcws-full-btn.stop{border:1px solid var(--t-crit-brd);background:var(--t-crit-dim);color:var(--t-crit)}
      .tcws-full-btn:hover{filter:brightness(1.2)}

      /* ── Ticket pills ────────────────────────────────────────── */
      .tcws-pills{display:flex;gap:4px;flex-wrap:wrap;margin-top:10px}
      .tcws-pill{padding:3px 9px;border-radius:99px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);font-size:10px;font-weight:700;cursor:pointer;transition:background .12s,color .12s,border-color .12s;display:inline-flex;align-items:center;gap:4px;user-select:none;font-family:inherit}
      .tcws-pill:hover,.tcws-pill.active{background:var(--t-accent-dim);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-pill.detail-open{background:var(--t-accent-dim);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-pill.is-new{background:rgba(16,185,129,.18);border-color:rgba(16,185,129,.55);color:#6ee7b7;animation:tcws-newpill .6s ease 3}
      @keyframes tcws-newpill{0%,100%{box-shadow:none}50%{box-shadow:0 0 0 3px rgba(16,185,129,.25)}}
      .tcws-pill-note{font-size:9px;font-weight:800;opacity:.9;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
      .tcws-pill-note.pickup{color:var(--t-ok)}
      .tcws-pill-note.status{color:var(--t-warn)}
      .tcws-pill-note.reply{color:var(--t-warn)}
      .tcws-pill-note.note{color:var(--t-accent-txt)}
      .tcws-pill-note.merge{color:var(--t-crit)}
      /* ── Assigned tab ─────────────────────────────────────────── */
      .tcws-ascard{background:var(--t-bg2);border:1px solid var(--t-border);border-radius:9px;padding:10px 13px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px}
      .tcws-ascard-info{flex:1;min-width:0}
      .tcws-ascard-id{font-size:13px;font-weight:700;color:var(--t-accent-txt)}
      .tcws-ascard-id a{color:inherit;text-decoration:none}
      .tcws-ascard-id a:hover{text-decoration:underline}
      .tcws-ascard-subject{font-size:12px;color:var(--t-text1);font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tcws-ascard-meta{font-size:12px;color:var(--t-text2);margin-top:3px}
      .tcws-ascard-assignee{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--t-ok);margin-top:4px}
      /* ── Calls tab ───────────────────────────────────────────── */
      .tcws-calls-updated{font-size:12px;color:var(--t-text3);padding:4px 14px 8px;text-align:right}
      .tcws-callcard{background:var(--t-bg2);border:1px solid var(--t-border);border-left:3px solid var(--t-ok);border-radius:9px;padding:10px 13px;margin-bottom:8px}
      .tcws-callcard-monitored{border-left-color:var(--t-accent);background:var(--t-accent-dim)}
      .tcws-callcard-row{display:flex;align-items:center;gap:7px;margin-bottom:5px}
      .tcws-callcard-badge{padding:2px 7px;border-radius:4px;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0}
      .tcws-callcard-badge.inbound{background:rgba(16,185,129,.18);color:#6ee7b7;border:1px solid rgba(16,185,129,.35)}
      .tcws-callcard-badge.outbound{background:rgba(59,130,246,.18);color:#93c5fd;border:1px solid rgba(59,130,246,.35)}
      .tcws-callcard-caller{font-size:13px;font-weight:700;color:var(--t-text1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-callcard-meta{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t-text2);margin-bottom:6px;flex-wrap:wrap}
      .tcws-callcard-agent{font-weight:600;color:var(--t-text1)}
      .tcws-callcard-group{color:var(--t-text3)}
      .tcws-callcard-sep{color:var(--t-border2);margin:0 1px}
      .tcws-callcard-foot{display:flex;align-items:center;justify-content:space-between;margin-top:4px;margin-bottom:7px}
      .tcws-callcard-ticket{font-size:11px;font-weight:800;color:var(--t-accent-txt);text-decoration:none;background:var(--t-accent-dim);border:1px solid var(--t-accent-brd);border-radius:5px;padding:2px 8px}
      .tcws-callcard-ticket:hover{filter:brightness(1.2)}
      .tcws-callcard-ticket-none{font-size:10px;color:var(--t-text3);font-style:italic}
      .tcws-callcard-dur{font-size:11px;font-weight:700;color:var(--t-warn);font-variant-numeric:tabular-nums}
      .tcws-callcard-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}
      .tcws-callaction{padding:4px 10px;border-radius:5px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text1);font-family:inherit;transition:background .1s,color .1s;letter-spacing:.03em}
      .tcws-callaction:hover:not(:disabled){background:var(--t-btn-hover);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-callaction:disabled{opacity:.5;cursor:default}
      .tcws-callaction.warn{border-color:rgba(245,158,11,.35);color:var(--t-warn)}
      .tcws-callaction.warn:hover:not(:disabled){background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.55)}
      .tcws-callaction.danger{border-color:var(--t-crit-brd);color:var(--t-crit)}
      .tcws-callaction.danger:hover:not(:disabled){background:var(--t-crit-dim)}
      .tcws-callcard-monbanner{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--t-accent-dim);border:1px solid var(--t-accent-brd);border-radius:8px;font-size:11px;color:var(--t-accent-txt);margin-bottom:8px}
      .tcws-calls-toast{display:none;padding:8px 12px;border-radius:7px;font-size:11px;font-weight:600;background:rgba(16,185,129,.18);border:1px solid rgba(16,185,129,.35);color:#6ee7b7;margin-top:6px}
      .tcws-calls-toast.err{background:var(--t-crit-dim);border-color:var(--t-crit-brd);color:var(--t-crit)}
      /* ── Agent Status Bar ───────────────────────────────────────────────── */
      /* ── Team sidebar (nav) ─────────────────────────────────────── */
      #tcws-team-sidebar{display:flex;flex-direction:column;align-items:center;gap:3px;padding:2px 0 4px}
      .tcws-team-card{width:40px;position:relative;cursor:pointer;flex-shrink:0}
      .tcws-team-card-inner{
        display:flex;flex-direction:column;align-items:center;gap:2px;
        padding:5px 3px 4px;border-radius:9px;
        background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);
        transition:background .15s,border-color .2s;
        will-change:transform;
      }
      .tcws-team-card:hover .tcws-team-card-inner{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.22)}
      .tcws-team-card[data-status="online"]   .tcws-team-card-inner{border-color:rgba(16,185,129,.40);box-shadow:0 0 8px rgba(16,185,129,.12)}
      .tcws-team-card[data-status="on_call"]  .tcws-team-card-inner{border-color:rgba(59,130,246,.48);box-shadow:0 0 8px rgba(59,130,246,.14)}
      .tcws-team-card[data-status="away"]     .tcws-team-card-inner{border-color:rgba(245,158,11,.42)}
      .tcws-team-card[data-status="busy"]     .tcws-team-card-inner{border-color:rgba(239,68,68,.42)}
      .tcws-team-card-name{font-size:9px;font-weight:700;color:rgba(255,255,255,.72);text-align:center;max-width:36px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:system-ui,sans-serif;line-height:1.2}
      .tcws-team-card-status{font-size:7.5px;font-weight:800;letter-spacing:.04em;text-align:center;color:rgba(255,255,255,.40);font-family:system-ui,sans-serif;line-height:1.2}
      .tcws-team-card[data-status="online"]  .tcws-team-card-status{color:#34d399}
      .tcws-team-card[data-status="on_call"] .tcws-team-card-status{color:#60a5fa}
      .tcws-team-card[data-status="away"]    .tcws-team-card-status{color:#fbbf24}
      .tcws-team-card[data-status="busy"]    .tcws-team-card-status{color:#f87171}
      /* Flip animation — scaleX squish, content swaps at midpoint */
      @keyframes tcwsCardFlip{
        0%   {transform:scaleX(1);filter:brightness(1)}
        35%  {transform:scaleX(0);filter:brightness(1.6)}
        65%  {transform:scaleX(0);filter:brightness(1.6)}
        100% {transform:scaleX(1);filter:brightness(1)}
      }
      .tcws-team-card.flipping .tcws-team-card-inner{animation:tcwsCardFlip .48s cubic-bezier(.4,0,.2,1)}
      /* + button in nav sidebar */
      .tcws-team-add-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;border:1.5px dashed rgba(255,255,255,.22);background:transparent;color:rgba(255,255,255,.38);cursor:pointer;font-size:17px;font-weight:300;flex-shrink:0;transition:border-color .15s,color .15s,background .15s;line-height:1;font-family:inherit;margin-top:2px}
      .tcws-team-add-btn:hover{border-color:rgba(255,255,255,.55);color:rgba(255,255,255,.85);background:rgba(255,255,255,.08)}

      /* ── Light mode (arctic / arcticblast) overrides ─────────────── */
      .tcws-panel[data-theme="arctic"] .tcws-tab[data-on="1"],
      .tcws-panel[data-theme="arcticblast"] .tcws-tab[data-on="1"]{color:var(--t-accent)}
      .tcws-panel[data-theme="arctic"] .tcws-stab[data-on="1"],
      .tcws-panel[data-theme="arcticblast"] .tcws-stab[data-on="1"]{color:var(--t-accent);border-bottom-color:var(--t-accent)}
      .tcws-panel[data-theme="arctic"] .tcws-callcard-badge.inbound,
      .tcws-panel[data-theme="arcticblast"] .tcws-callcard-badge.inbound{background:rgba(16,135,90,.12);color:#0d6e50;border-color:rgba(16,135,90,.30)}
      .tcws-panel[data-theme="arctic"] .tcws-callcard-badge.outbound,
      .tcws-panel[data-theme="arcticblast"] .tcws-callcard-badge.outbound{background:rgba(30,90,180,.12);color:#1a4fa0;border-color:rgba(30,90,180,.28)}
      .tcws-panel[data-theme="arctic"] .tcws-tab-n.vis,
      .tcws-panel[data-theme="arcticblast"] .tcws-tab-n.vis{background:#1a4fa0;color:#fff}
      .tcws-panel[data-theme="arctic"] .tcws-ticker-item,
      .tcws-panel[data-theme="arcticblast"] .tcws-ticker-item{color:rgba(26,42,58,.6)}

      /* ── Agent bar ──────────────────────────────────────────── */
      .tcws-agent-bar{display:flex;align-items:center;gap:6px;padding:5px 14px;background:var(--t-bg0);border-bottom:1px solid var(--t-border);flex-shrink:0;overflow-x:auto;min-height:36px}
      .tcws-agent-bar::-webkit-scrollbar{height:3px}
      .tcws-agent-bar::-webkit-scrollbar-track{background:transparent}
      .tcws-agent-bar::-webkit-scrollbar-thumb{background:var(--t-border2);border-radius:2px}
      .tcws-agent-bar-lbl{font-size:8.5px;font-weight:800;color:var(--t-text3);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
      .tcws-agent-chip{position:relative;display:flex;align-items:center;gap:5px;background:var(--t-bg2);border:1px solid var(--t-border);border-radius:20px;padding:3px 8px 3px 4px;cursor:pointer;flex-shrink:0;transition:border-color .12s,background .12s}
      .tcws-agent-chip:hover{border-color:var(--t-border2);background:var(--t-btn-hover)}
      .tcws-agent-chip[data-status="online"]{border-color:rgba(16,185,129,.35)}
      .tcws-agent-chip[data-status="on_call"]{border-color:rgba(59,130,246,.4)}
      .tcws-agent-chip[data-status="transferred"]{border-color:rgba(245,158,11,.4)}
      .tcws-agent-avatar{width:20px;height:20px;border-radius:50%;object-fit:cover;background:var(--t-border2);flex-shrink:0;display:block}
      .tcws-agent-avatar-init{width:20px;height:20px;border-radius:50%;background:var(--t-accent-dim);border:1px solid var(--t-accent-brd);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:var(--t-accent-txt);flex-shrink:0;text-transform:uppercase}
      .tcws-agent-name{font-size:10px;font-weight:700;color:var(--t-text1);white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis}
      .tcws-agent-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;border:1px solid rgba(0,0,0,.15)}
      .tcws-agent-status-dot.online{background:#10b981;box-shadow:0 0 5px rgba(16,185,129,.5)}
      .tcws-agent-status-dot.offline{background:var(--t-text3)}
      .tcws-agent-status-dot.on_call{background:#3b82f6;box-shadow:0 0 5px rgba(59,130,246,.5)}
      .tcws-agent-status-dot.transferred{background:#f59e0b;box-shadow:0 0 5px rgba(245,158,11,.4)}
      .tcws-agent-status-dot.away{background:#f59e0b}
      .tcws-agent-status-dot.busy{background:#ef4444}
      /* Hover popup */
      /* agent-popup styles moved to .tcws-agent-popup-float (position:fixed) */
      .tcws-agent-popup-name{font-size:12px;font-weight:800;color:var(--t-text1);margin-bottom:3px}
      .tcws-agent-popup-status{font-size:10px;color:var(--t-text2);margin-bottom:8px;display:flex;align-items:center;gap:5px}
      .tcws-agent-popup-group{font-size:9px;color:var(--t-text3);margin-bottom:8px}
      .tcws-agent-popup-action{width:100%;padding:5px 8px;background:var(--t-btn-bg);border:1px solid var(--t-border2);border-radius:5px;color:var(--t-text2);font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;transition:background .1s,color .1s}
      .tcws-agent-popup-action:hover{background:var(--t-btn-hover);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-agent-popup-action.unpin{color:var(--t-crit);border-color:var(--t-crit-brd)}
      .tcws-agent-popup-action.unpin:hover{background:var(--t-crit-dim)}
      /* Add agents hover button on bar */
      .tcws-agent-bar-add{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;border:1px dashed var(--t-border2);background:transparent;color:var(--t-text3);cursor:pointer;font-size:14px;flex-shrink:0;transition:border-color .12s,color .12s;line-height:1;font-family:inherit}
      .tcws-agent-bar-add:hover{border-color:var(--t-accent-brd);color:var(--t-accent-txt);background:var(--t-accent-dim)}
      /* Add-agent flyout */
      /* Agent chip popup — position:fixed so it escapes overflow:hidden panel */
      .tcws-agent-popup-float{position:fixed;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:9px;padding:10px 12px;z-index:2147483647;min-width:170px;max-width:220px;box-shadow:0 8px 28px rgba(0,0,0,.5)}
      /* Agent flyout — fixed position, opened by JS on + click */
      .tcws-agent-flyout-float{position:fixed;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:9px;padding:10px;z-index:2147483647;width:230px;box-shadow:0 8px 28px rgba(0,0,0,.5)}
      .tcws-agent-flyout input{width:100%;padding:5px 8px;background:var(--t-bg0);border:1px solid var(--t-border2);border-radius:5px;color:var(--t-text1);font-size:11px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:6px}
      .tcws-agent-flyout-list{max-height:160px;overflow-y:auto}
      .tcws-agent-flyout-item{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:5px;cursor:pointer;transition:background .1s}
      .tcws-agent-flyout-item:hover{background:var(--t-btn-hover)}
      .tcws-agent-flyout-item-name{font-size:11px;font-weight:600;color:var(--t-text1);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-agent-flyout-item-status{font-size:9px;color:var(--t-text3)}
      .tcws-agent-flyout-item-pin{padding:2px 6px;border-radius:4px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);font-size:9px;font-weight:800;cursor:pointer;flex-shrink:0;font-family:inherit}
      .tcws-agent-flyout-item-pin:hover{background:var(--t-accent-dim);border-color:var(--t-accent-brd);color:var(--t-accent-txt)}
      .tcws-agent-flyout-item-pin.pinned{background:var(--t-crit-dim);border-color:var(--t-crit-brd);color:var(--t-crit)}
      /* ── Macro picker ─────────────────────────────────────────── */
      .tcws-macro-bar{display:flex;gap:5px;align-items:center;margin-bottom:6px}
      .tcws-macro-input{width:50%;max-width:280px;background:var(--t-bg2);border:1px solid var(--t-border2);border-radius:7px;color:var(--t-text1);font-size:11px;padding:5px 9px;font-family:inherit}
      .tcws-macro-input:focus{outline:none;border-color:var(--t-accent-brd)}
      .tcws-macro-input::placeholder{color:var(--t-text3)}
      .tcws-macro-list{background:var(--t-bg1);border:1px solid var(--t-border2);border-radius:8px;overflow:hidden;margin-bottom:6px;display:none}
      .tcws-macro-list.open{display:block}
      .tcws-macro-item{padding:6px 10px;font-size:11px;color:var(--t-text1);cursor:pointer;border-bottom:1px solid var(--t-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tcws-macro-item:last-child{border-bottom:none}
      .tcws-macro-item:hover{background:var(--t-btn-hover);color:var(--t-accent-txt)}
      .tcws-macro-preview{background:var(--t-bg3);border:1px solid var(--t-border2);border-radius:7px;padding:7px 10px;font-size:11px;color:var(--t-text2);margin-bottom:6px;display:none}
      .tcws-macro-preview.open{display:block}
      .tcws-macro-preview-row{display:flex;gap:6px;align-items:baseline;margin-bottom:3px}
      .tcws-macro-preview-lbl{font-size:10px;font-weight:700;color:var(--t-text3);text-transform:uppercase;min-width:52px}
      .tcws-macro-preview-val{color:var(--t-text1);font-weight:500}

      /* ── Resolved tab ────────────────────────────────────────── */
      .tcws-rcard{border:1px solid var(--t-border);border-left:3px solid var(--t-ok);border-radius:8px;background:var(--t-bg3);padding:11px 13px;margin-bottom:7px}
      .tcws-rcard:last-child{margin-bottom:0}
      .tcws-rcard[data-merged="1"]{border-left-color:var(--t-crit)}
      .tcws-rcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .tcws-rcard-info{flex:1;min-width:0}
      .tcws-rcard-id{font-size:11px;font-weight:800;color:var(--t-accent-txt);margin-bottom:3px}
      .tcws-rcard-id a{color:inherit;text-decoration:none}
      .tcws-rcard-id a:hover{text-decoration:underline}
      .tcws-rcard-subject{font-size:12px;font-weight:700;color:var(--t-text1);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-rcard-meta{font-size:10px;color:var(--t-text3)}
      .tcws-rcard-merge{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10px;font-weight:700;color:var(--t-crit)}
      .tcws-rcard-merge a{color:inherit;text-decoration:underline}
      .tcws-resolved-empty{text-align:center;padding:28px 16px;color:var(--t-text3);font-size:12px}

      /* ── Slider ─────────────────────────────────────────────── */
      .tcws-slider-val{text-align:center;margin:8px 0 2px;line-height:1}
      .tcws-slider-num{font-size:44px;font-weight:900;color:var(--t-accent-txt);letter-spacing:-.06em;text-shadow:var(--t-text-glow,none)}
      .tcws-slider-unit{font-size:14px;font-weight:600;color:var(--t-text3);margin-left:4px}
      .tcws-slider{-webkit-appearance:none;appearance:none;width:100%;height:5px;border-radius:99px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--t-accent) var(--pct,50%),var(--t-border2) var(--pct,50%));transition:background .06s;margin:10px 0 4px;display:block}
      .tcws-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:var(--t-accent);border:2.5px solid var(--t-bg1);box-shadow:0 0 12px var(--t-accent),var(--t-border-glow,none);cursor:pointer;transition:transform .1s}
      .tcws-slider::-webkit-slider-thumb:hover{transform:scale(1.2)}
      .tcws-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--t-accent);border:2.5px solid var(--t-bg1);cursor:pointer}
      .tcws-slider-ticks{display:flex;justify-content:space-between;font-size:9px;color:var(--t-text3);font-weight:700;margin-top:2px}
      .tcws-presets{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px;margin-bottom:14px}
      .tcws-preset{padding:5px 12px;border-radius:5px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;font-size:11px;font-weight:700;transition:background .12s,color .12s,border-color .12s;font-family:inherit}
      .tcws-preset:hover{background:var(--t-btn-hover);color:var(--t-text1)}
      .tcws-preset[data-on="1"]{background:var(--t-accent-dim);color:var(--t-accent-txt);border-color:var(--t-accent-brd)}
      .tcws-after-hours{width:100%;padding:9px 14px;border-radius:7px;cursor:pointer;border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:#fbbf24;font-size:11px;font-weight:700;transition:filter .12s,background .12s;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit}
      .tcws-after-hours:hover{filter:brightness(1.2)}
      .tcws-after-hours[data-on="1"]{background:rgba(245,158,11,.2);border-color:rgba(245,158,11,.5)}

      /* ── Dashboard ──────────────────────────────────────────── */
      .tcws-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
      .tcws-stat-grid.wide{grid-template-columns:repeat(3,1fr)}
      .tcws-stat{padding:12px 10px;border-radius:8px;border:1px solid var(--t-border2);background:var(--t-bg3);text-align:center}
      .tcws-stat-val{font-size:26px;font-weight:900;color:var(--t-accent-txt);line-height:1;margin-bottom:4px;text-shadow:var(--t-text-glow,none)}
      .tcws-stat-lbl{font-size:9px;font-weight:700;color:var(--t-text3);text-transform:uppercase;letter-spacing:.07em}
      .tcws-stat-sub{font-size:9px;color:var(--t-text3);margin-top:2px}
      .tcws-stat[data-alert="1"] .tcws-stat-val{color:var(--t-crit)}
      .tcws-stat[data-warn="1"]  .tcws-stat-val{color:var(--t-warn)}
      .tcws-stat[data-ok="1"]    .tcws-stat-val{color:var(--t-ok)}
      .tcws-chart-wrap{padding:14px;border-radius:8px;border:1px solid var(--t-border);background:var(--t-bg3);margin-bottom:14px}
      .tcws-chart-ttl{font-size:9px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}
      .tcws-top-views{border-radius:8px;border:1px solid var(--t-border);background:var(--t-bg3);overflow:hidden}
      .tcws-top-view-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-bottom:1px solid var(--t-border)}
      .tcws-top-view-row:last-child{border-bottom:none}
      .tcws-top-view-name{font-size:11px;font-weight:700;color:var(--t-text1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-top-view-count{font-size:10px;font-weight:800;color:var(--t-text3);flex-shrink:0}
      .tcws-scan-health{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:7px;border:1px solid var(--t-border);background:var(--t-bg3);margin-bottom:14px}
      .tcws-scan-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--t-ok)}
      .tcws-scan-dot[data-err="1"]{background:var(--t-crit)}
      .tcws-scan-txt{font-size:10px;color:var(--t-text2);flex:1}

      /* ── Watchlist ──────────────────────────────────────────── */
      .tcws-watch-row{display:flex;gap:6px;margin-bottom:12px}
      .tcws-watch-inp{flex:1;padding:8px 12px;border-radius:7px;border:1px solid var(--t-border2);background:var(--t-bg3);color:var(--t-text1);font-size:12px;font-weight:600;outline:none;transition:border-color .12s;font-family:inherit}
      .tcws-watch-inp:focus{border-color:var(--t-accent)}
      .tcws-watch-inp::placeholder{color:var(--t-text3)}
      .tcws-watch-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 13px;border-radius:7px;border:1px solid var(--t-border);background:var(--t-bg3);margin-bottom:6px}
      .tcws-watch-item:last-child{margin-bottom:0}
      .tcws-watch-item-id{font-size:12px;font-weight:800;color:var(--t-text1)}
      .tcws-watch-item-id a{color:var(--t-accent-txt);text-decoration:none}
      .tcws-watch-item-id a:hover{text-decoration:underline}
      .tcws-watch-item-meta{font-size:10px;color:var(--t-text3);margin-top:2px}
      .tcws-int-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .tcws-int-lbl{font-size:10px;font-weight:700;color:var(--t-text2)}

      /* ── Settings ───────────────────────────────────────────── */
      .tcws-set-block{margin-bottom:18px}
      .tcws-set-block:last-child{margin-bottom:0}
      .tcws-set-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-radius:7px;border:1px solid var(--t-border);background:var(--t-bg3);margin-bottom:6px}
      .tcws-set-card:last-child{margin-bottom:0}
      .tcws-set-card-left{flex:1;min-width:0}
      .tcws-set-card-lbl{font-size:11px;font-weight:700;color:var(--t-text1)}
      .tcws-set-card-desc{font-size:10px;color:var(--t-text3);margin-top:1px;line-height:1.4}
      .tcws-tgl{position:relative;width:40px;height:22px;flex-shrink:0;cursor:pointer;display:block}
      .tcws-tgl input{opacity:0;width:0;height:0;position:absolute}
      .tcws-tgl-track{position:absolute;inset:0;border-radius:99px;background:var(--t-btn-hover);border:1px solid var(--t-border2);transition:background .18s}
      .tcws-tgl input:checked ~ .tcws-tgl-track{background:var(--t-accent)}
      .tcws-tgl-thumb{position:absolute;top:2.5px;left:2.5px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.5);transition:left .15s}
      .tcws-tgl input:checked ~ .tcws-tgl-thumb{left:21px}
      .tcws-theme-grid{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0}
      .tcws-theme-swatch{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}
      .tcws-theme-circle{width:36px;height:36px;border-radius:10px;border:2px solid transparent;transition:transform .12s,border-color .12s,box-shadow .12s}
      .tcws-theme-circle:hover{transform:scale(1.1)}
      .tcws-theme-swatch[data-active="1"] .tcws-theme-circle{border-color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.5),0 4px 12px rgba(0,0,0,.5)}
      .tcws-theme-name{font-size:9px;color:var(--t-text3);font-weight:700;text-align:center;font-family:system-ui,sans-serif}
      .tcws-theme-cat-hdr{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t-text3);margin:12px 0 5px;display:flex;align-items:center;gap:7px}
      .tcws-theme-cat-hdr:first-child{margin-top:4px}
      .tcws-theme-cat-pulse{font-size:8px;font-weight:800;padding:2px 6px;border-radius:99px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);animation:tcwsPulse 1.5s ease-in-out infinite;letter-spacing:.06em}
      @keyframes tcwsCircleShimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      .tcws-theme-circle-anim{background-size:200% 200%!important;animation:tcwsCircleShimmer 3s ease infinite}
      .tcws-custom-theme-wrap{background:var(--t-bg2);border:1px solid var(--t-border);border-radius:9px;padding:12px 14px;margin-top:2px}
      .tcws-custom-activate-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--t-border)}
      .tcws-custom-picker-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
      .tcws-custom-picker-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .tcws-custom-picker-lbl{font-size:11px;font-weight:700;color:var(--t-text2)}
      .tcws-custom-picker-inp{width:38px;height:28px;border:1px solid var(--t-border2);border-radius:6px;background:var(--t-bg3);cursor:pointer;padding:2px 3px;box-sizing:border-box}
      .tcws-vcard{padding:11px 13px;margin-bottom:6px;border:1px solid var(--t-border);border-radius:8px;background:var(--t-bg3)}
      .tcws-vcard:last-child{margin-bottom:0}
      .tcws-vcard-name{font-size:11px;font-weight:700;color:var(--t-text1);margin-bottom:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-vcard-row{display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap}
      .tcws-vcard-row:last-child{margin-bottom:0}
      .tcws-vcard-lbl{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t-text3);width:52px;flex-shrink:0}
      .tcws-tog-grp{display:flex;gap:3px;flex-wrap:wrap}
      .tcws-tog{padding:3px 9px;border-radius:4px;border:1px solid var(--t-border);background:var(--t-btn-bg);color:var(--t-text2);cursor:pointer;font-size:11px;font-weight:700;transition:background .1s,border-color .1s,color .1s;user-select:none;font-family:inherit}
      .tcws-tog:hover{background:var(--t-btn-hover);color:var(--t-text1)}
      .tcws-tog[data-on="1"]{background:var(--t-accent-dim);border-color:var(--t-accent-brd);color:var(--t-accent-txt)}
      .tcws-tog[data-on="1"][data-warn="1"]{background:var(--t-crit-dim);border-color:var(--t-crit-brd);color:var(--t-crit)}

      /* ── Badge pills ────────────────────────────────────────── */
      .tcws-badge-pill{padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:var(--t-btn-bg);color:var(--t-text2);border:1px solid var(--t-border2)}
      .tcws-badge-pill[data-s="open"]   {background:rgba(34,197,94,.14);color:#4ade80;border-color:rgba(34,197,94,.3)}
      .tcws-badge-pill[data-s="pending"]{background:rgba(234,179,8,.11);color:#facc15;border-color:rgba(234,179,8,.3)}
      .tcws-badge-pill[data-s="new"]    {background:rgba(239,68,68,.14);color:#f87171;border-color:rgba(239,68,68,.3)}
      .tcws-badge-pill[data-s="solved"] {background:var(--t-btn-bg);color:var(--t-text3);border-color:var(--t-border)}
      .tcws-badge-pill[data-s="merged"] {background:rgba(239,68,68,.12);color:var(--t-crit);border-color:var(--t-crit-brd)}

      /* ── Footer ─────────────────────────────────────────────── */
      .tcws-footer{flex-shrink:0;padding:7px 16px;border-top:1px solid var(--t-border);background:var(--t-bg0);display:flex;align-items:center;justify-content:space-between}
      .tcws-footer-kbs{font-size:9px;color:var(--t-text3);letter-spacing:.04em}
      .tcws-footer-ver{font-size:9px;color:var(--t-text3);font-weight:700;letter-spacing:.03em}
      kbd{display:inline-block;padding:1px 5px;border-radius:3px;border:1px solid var(--t-border2);background:var(--t-btn-bg);font-size:9px;color:var(--t-text2);font-family:inherit}

      /* ── Empty ──────────────────────────────────────────────── */
      .tcws-empty{text-align:center;padding:30px 20px;color:var(--t-text3);font-size:12px;line-height:1.7}
      .tcws-empty-icon{font-size:28px;display:block;margin-bottom:8px;opacity:.3}

      /* ── Site cards ─────────────────────────────────────────── */
      .tcws-site-card{border:1px solid var(--t-border);border-left:3px solid var(--t-border2);border-radius:8px;background:var(--t-bg3);padding:11px 14px;margin-bottom:8px;animation:tcwsCardIn .18s ease-out}
      .tcws-site-card:last-child{margin-bottom:0}
      .tcws-site-card.wash-down{border-left-color:var(--t-crit);box-shadow:inset 3px 0 14px -4px var(--t-crit-dim)}
      .tcws-site-card.critical{border-left-color:var(--t-warn)}
      .tcws-site-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .tcws-site-name{font-size:12px;font-weight:800;color:var(--t-text1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcws-site-badges{display:flex;gap:4px;flex-wrap:wrap;align-items:center;flex-shrink:0}
      .tcws-site-badge{padding:2px 8px;border-radius:99px;font-size:9px;font-weight:800;letter-spacing:.03em;border:1px solid transparent}
      .tcws-site-badge.count{background:var(--t-btn-bg);color:var(--t-text3);border-color:var(--t-border)}
      .tcws-site-badge.washdown{background:var(--t-crit-dim);color:var(--t-crit);border-color:var(--t-crit-brd);animation:tcwsSitePulse 1.8s ease-in-out infinite}
      .tcws-site-badge.critical{background:rgba(245,158,11,.14);color:var(--t-warn);border-color:rgba(245,158,11,.3)}
      .tcws-site-badge.unnamed{background:rgba(245,158,11,.14);color:var(--t-warn);border-color:rgba(245,158,11,.3)}
      .tcws-site-card.unnamed-warn{border-left-color:var(--t-warn)}
      .tcws-site-unnamed-note{font-size:10px;color:var(--t-warn);opacity:.85;margin:5px 0 2px;line-height:1.4}
      .tcws-pill-note.unnamed{color:var(--t-warn);opacity:.9;font-weight:600}
      @keyframes tcwsSitePulse{0%,100%{opacity:1}50%{opacity:.55}}
    `;
    document.head.appendChild(s);
  }

  // ─── Nav button ───────────────────────────────────────────────────────────────
  function buildNavButton() {
    const li = document.createElement('li');
    li.className = 'tcws-nav-li';
    li.setAttribute('data-tcws-nav-li', '1');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tcws-nav-btn';
    btn.title = 'TCWS Notification Manager v1.3.7';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path class="icon-ring" d="M9 2.5A6.5 6.5 0 0 1 15.5 9" stroke-width="1.6" stroke-linecap="round"/>
        <path class="icon-ring" d="M15.5 9A6.5 6.5 0 1 1 9 2.5" stroke-width="1.6" stroke-linecap="round"/>
        <polyline class="icon-ring" points="12,1.2 9,2.5 10.5,5.2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="icon-fill" cx="9" cy="9" r="2"/>
      </svg>
      <span class="tcws-badge" data-tcws-badge="1"></span>
      <span class="tcws-ar-dot"></span>`;
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleThePanel(); });
    li.appendChild(btn);
    return { li, btn };
  }

  function updateNavBtn() {
    if (!navBtnEl) return;
    const en     = loadEn();
    const unread = loadUnread();
    const count  = Object.keys(unread).length;
    const hasCrit= Object.values(unread).some(u => u.level === 'critical');
    navBtnEl.dataset.arOn      = en    ? '1' : '0';
    navBtnEl.dataset.hasAlerts = count ? '1' : '0';
    navBtnEl.dataset.active    = panelEl?.classList.contains('open') ? '1' : '0';
    navBtnEl.dataset.critical  = hasCrit ? '1' : '0';
    const badge = navBtnEl.querySelector('[data-tcws-badge]');
    if (badge) badge.textContent = count > 0 ? String(count) : '';
    navBtnEl.title = ['TCWS Notification Manager v6',
      en ? `AR: ${fmtMs(loadMs())}` : 'AR: off',
      count ? `${count} alert${count !== 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    updateStrobe();
  }

  function refreshUI() {
    updateNavBtn();
    refreshDots();
    _syncPanelPeripheral();
    updateZdCountdown();
  }

  // ─── Alert strobe ─────────────────────────────────────────────────────────────
  const STROBE_NAV_SEL = 'nav[data-test-id="support_nav"], nav[aria-label="Zendesk Support"]';

  function updateStrobe() {
    const nav = document.querySelector(STROBE_NAV_SEL);
    if (!nav) return;
    const unread = loadUnread();
    const count  = Object.keys(unread).length;
    const on     = loadStrobe() && count > 0;
    if (!on) {
      nav.removeAttribute('data-tcws-strobe');
      return;
    }
    const hasCrit = Object.values(unread).some(u => u.level === 'critical');
    const hasWarn = Object.values(unread).some(u => u.level === 'warning');
    nav.dataset.tcwsStrobe = hasCrit ? 'critical' : hasWarn ? 'warning' : 'info';
  }

  // ─── Views ticker ─────────────────────────────────────────────────────────────
  const TICKER_FADE_MS   = 7500;   // ms of full visibility before fade starts
  const TICKER_TRANS_MS  = 1800;   // CSS fade-out duration (must match CSS)
  const TICKER_MAX_ITEMS = 5;      // max concurrent items before oldest is evicted

  const VIEWS_HDR_SEL = '[data-test-id="views_views-list_header"]';
  let _tickerEnsureTimer = null;

  function ensureViewsTicker() {
    if (document.getElementById('tcws-views-ticker')) return;
    const hdr = document.querySelector(VIEWS_HDR_SEL);
    if (!hdr) {
      // Retry once the Views pane renders
      if (_tickerEnsureTimer) clearTimeout(_tickerEnsureTimer);
      _tickerEnsureTimer = setTimeout(ensureViewsTicker, 1200);
      return;
    }
    const ticker = document.createElement('div');
    ticker.id = 'tcws-views-ticker';
    hdr.insertAdjacentElement('afterend', ticker);
  }

  function pushTicker(msg, level) {
    if (!loadTickerEn()) return;
    // Lazy-ensure ticker exists (Views pane may not have rendered yet)
    ensureViewsTicker();
    const ticker = document.getElementById('tcws-views-ticker');
    if (!ticker || !msg) return;

    // Evict oldest items over the limit
    const existing = ticker.querySelectorAll('.tcws-ticker-item');
    if (existing.length >= TICKER_MAX_ITEMS) {
      Array.from(existing).slice(0, existing.length - TICKER_MAX_ITEMS + 1).forEach(el => {
        if (el._tickerTimer) { clearTimeout(el._tickerTimer); clearTimeout(el._tickerRm); }
        el.remove();
      });
    }

    const item = document.createElement('div');
    item.className = 'tcws-ticker-item';
    item.dataset.level = level || 'info';
    item.innerHTML = `<span class="tcws-ticker-dot"></span><span class="tcws-ticker-txt">${escHtml(String(msg))}</span><span class="tcws-ticker-ts">${hhMM(Date.now())}</span>`;
    ticker.appendChild(item);

    // Schedule fade-out then removal
    item._tickerTimer = setTimeout(() => {
      item.classList.add('fading');
      item._tickerRm = setTimeout(() => { if (item.parentElement) item.remove(); }, TICKER_TRANS_MS);
    }, TICKER_FADE_MS);
  }

  function _syncPanelPeripheral() {
    if (!panelEl?.classList.contains('open')) return;
    const en         = loadEn();
    const alertCount = Object.keys(loadUnread()).length;
    const chip = panelEl.querySelector('[data-tcws-ar-status]');
    if (chip) { chip.textContent = en ? `AR ${fmtMs(loadMs())}` : 'AR OFF'; chip.dataset.on = en ? '1' : '0'; }
    panelEl.querySelectorAll('[data-tcws-alertbadge]').forEach(b => {
      b.textContent = alertCount > 0 ? String(alertCount) : '';
      b.className   = 'tcws-tab-n' + (alertCount > 0 ? ' vis' : '');
    });
    // Sync resolved count
    const resolvedCount = loadResolved().length;
    panelEl.querySelectorAll('[data-tcws-resolvedbadge]').forEach(b => {
      b.textContent = resolvedCount > 0 ? String(resolvedCount) : '';
      b.className   = 'tcws-tab-n' + (resolvedCount > 0 ? ' vis' : '');
    });
    // Sync assigned count (24h window)
    const assignedCount = loadAssigned().filter(e => Date.now() - e.at < ASSIGNED_TTL).length;
    panelEl.querySelectorAll('[data-tcws-assignedbadge]').forEach(b => {
      b.textContent = assignedCount > 0 ? String(assignedCount) : '';
      b.className   = 'tcws-tab-n' + (assignedCount > 0 ? ' vis' : '');
    });
    // Sync live calls count
    _syncCallsBadge();
    // Keep calls tab + banner hidden if feature is disabled
    panelEl?._applyTabVisibility?.();
    const _callBanner = document.getElementById('tcws-call-banner');
    if (_callBanner) _callBanner.style.display = featEnabled('calls') ? '' : 'none';
  }

  function requestPanelUpdate() {
    if (!panelEl?.classList.contains('open') || !panelEl._render) return;
    const active = document.activeElement;
    if (active && panelEl.contains(active)) return;
    panelEl._render();
  }

  // ─── Detail panel ─────────────────────────────────────────────────────────────
  let _openDetailTid = null;

  // ─── Fields editor panel ──────────────────────────────────────────────────────
  function buildFieldsPanel() {
    // Fields panel is now embedded as a left column inside detailPanelEl
    // Make sure detailPanelEl exists first
    if (!detailPanelEl) detailPanelEl = buildDetailPanel();
    const col = detailPanelEl.querySelector('.tcws-det-fields-col');
    return col;
  }

  function openFieldsPanel(tid, alertObj) {
    if (!fieldsPanelEl) fieldsPanelEl = buildFieldsPanel();
    fieldsPanelEl.classList.add('open');
    detailPanelEl?.classList.add('fields-open');
    // Re-position the detail panel to accommodate the wider layout
    positionDetailPanel();
    renderFieldsPanel(tid, alertObj);
  }

  function closeFieldsPanel() {
    fieldsPanelEl?.classList.remove('open');
    detailPanelEl?.classList.remove('fields-open');
    positionDetailPanel();
  }

  async function renderFieldsPanel(tid, alertObj) {
    if (!fieldsPanelEl) return;
    // The fields panel IS the column div — render directly into it
    const container = fieldsPanelEl;
    container.innerHTML = '';

    // Header
    const hdr = document.createElement('div'); hdr.className = 'tcws-fp-header';
    const titleEl = document.createElement('div'); titleEl.className = 'tcws-fp-title';
    titleEl.innerHTML = `Edit Fields <span class="tcws-fp-title-badge">#${escHtml(String(tid))}</span>`;
    const closeBtn = document.createElement('button'); closeBtn.className = 'tcws-fp-close';
    closeBtn.textContent = '×'; closeBtn.title = 'Close fields panel';
    closeBtn.addEventListener('click', () => {
      closeFieldsPanel();
      // Flip the Fields button back to inactive state in detail panel
      detailPanelEl?.querySelector('.tcws-det-fields-btn')?.setAttribute('data-active','0');
    });
    hdr.appendChild(titleEl); hdr.appendChild(closeBtn);
    container.appendChild(hdr);

    // Loading state
    const body = document.createElement('div'); body.className = 'tcws-fp-body';
    body.innerHTML = `<div class="tcws-det-loading">Loading fields…</div>`;
    container.appendChild(body);

    // Footer (save/discard) — always present
    const footer = document.createElement('div'); footer.className = 'tcws-fp-footer';
    const dirtyCount = document.createElement('div'); dirtyCount.className = 'tcws-fp-dirty-count';
    const saveRow = document.createElement('div'); saveRow.className = 'tcws-fp-save-row';
    const discardBtn = document.createElement('button'); discardBtn.className = 'tcws-fp-discard-btn'; discardBtn.textContent = 'Discard';
    const saveBtn = document.createElement('button'); saveBtn.className = 'tcws-fp-save-btn'; saveBtn.textContent = 'Save Changes';
    const statusBar = document.createElement('div'); statusBar.className = 'tcws-fp-status-bar';
    saveRow.appendChild(discardBtn); saveRow.appendChild(saveBtn);
    footer.appendChild(dirtyCount); footer.appendChild(saveRow); footer.appendChild(statusBar);
    container.appendChild(footer);

    try {
      const _fetchOptsFields = KEY_FIELDS.filter(f => f.fetchOpts && !f.std);
      const [rawTicket, fieldDefs, ..._fetchedOptsList] = await Promise.all([
        fetchRawTicketFields(tid),
        fetchTicketFieldDefs(),
        ..._fetchOptsFields.map(f => fetchFieldOptions(f.id).catch(() => [])),
      ]);
      // Map of field-id → [{value, label}] for fields that were fetched live
      const prefetchedOpts = {};
      _fetchOptsFields.forEach((f, i) => { prefetchedOpts[String(f.id)] = _fetchedOptsList[i]; });

      // Build a quick lookup: custom field id → current value
      const cfMap = {};
      for (const cf of (rawTicket.custom_fields || [])) cfMap[cf.id] = cf.value;

      body.innerHTML = '';

      // Track dirty state: fieldKey → { originalVal, currentVal, inputEl }
      const dirtyMap = {};

      function markDirty(key, originalVal, inputEl) {
        if (!dirtyMap[key]) dirtyMap[key] = { originalVal, inputEl };
        const currentVal = inputEl.type === 'checkbox' ? inputEl.checked : inputEl.value;
        const isDirty = String(currentVal) !== String(originalVal ?? '');
        dirtyMap[key].dirty = isDirty;
        inputEl.closest('.tcws-fp-field')?.classList.toggle('dirty', isDirty);
        inputEl.classList.toggle('dirty', isDirty && inputEl.tagName !== 'INPUT' || inputEl.type !== 'checkbox');
        updateDirtyCount();
      }

      function updateDirtyCount() {
        const n = Object.values(dirtyMap).filter(d => d.dirty).length;
        if (n > 0) {
          dirtyCount.textContent = `${n} unsaved change${n === 1 ? '' : 's'}`;
          dirtyCount.classList.add('visible');
          saveBtn.disabled = false;
        } else {
          dirtyCount.classList.remove('visible');
          saveBtn.disabled = true;
        }
        statusBar.className = 'tcws-fp-status-bar';
      }

      // ── Combobox builder ──────────────────────────────────────────────────────
      // options: [{value, label}]. Returns { wrap, getValue, setValue, inputEl, destroyDropdown }
      function makeCombobox(options, currentVal, onChange) {
        const wrap = document.createElement('div'); wrap.className = 'tcws-combo-wrap';
        const displayInput = document.createElement('input');
        displayInput.type = 'text'; displayInput.readOnly = true;
        displayInput.className = 'tcws-combo-input';
        displayInput.placeholder = '— select —';
        const arrowEl = document.createElement('span'); arrowEl.className = 'tcws-combo-arrow';
        arrowEl.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>`;
        const clearBtn = document.createElement('button'); clearBtn.type = 'button';
        clearBtn.className = 'tcws-combo-clear'; clearBtn.textContent = '×';
        wrap.appendChild(displayInput); wrap.appendChild(clearBtn); wrap.appendChild(arrowEl);

        const dropdown = document.createElement('div'); dropdown.className = 'tcws-combo-dropdown';
        const searchWrap = document.createElement('div'); searchWrap.className = 'tcws-combo-search';
        const searchIn = document.createElement('input'); searchIn.type = 'text'; searchIn.placeholder = 'Filter…';
        searchWrap.appendChild(searchIn);
        const list = document.createElement('div'); list.className = 'tcws-combo-list';
        dropdown.appendChild(searchWrap); dropdown.appendChild(list);
        document.body.appendChild(dropdown);

        let currentValue = currentVal ?? '';
        let focusedIdx = -1;

        function getLabel(val) {
          if (!val) return '';
          const found = options.find(o => o.value === val);
          return found ? found.label : val;
        }
        function updateDisplay() {
          displayInput.value = getLabel(currentValue);
          clearBtn.classList.toggle('visible', !!currentValue);
        }
        function renderList(filter) {
          list.innerHTML = ''; focusedIdx = -1;
          const q = (filter || '').toLowerCase().trim();
          const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
          if (!filtered.length) { list.innerHTML = `<div class="tcws-combo-empty">No matches</div>`; return; }
          for (let i = 0; i < filtered.length; i++) {
            const o = filtered[i];
            const el = document.createElement('div');
            el.className = 'tcws-combo-option' + (o.value === '' ? ' none-opt' : '') + (o.value === currentValue ? ' selected' : '');
            el.textContent = o.label || '(none)'; el.dataset.value = o.value;
            el.addEventListener('mousedown', e => { e.preventDefault(); selectVal(o.value); closeDropdown(); });
            list.appendChild(el);
          }
        }
        function positionDropdown() {
          const rect = wrap.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom - 8;
          const spaceAbove = rect.top - 8;
          const ddW = Math.max(rect.width, 240);
          dropdown.style.width = `${ddW}px`;
          dropdown.style.left = `${Math.min(rect.left, window.innerWidth - ddW - 8)}px`;
          if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
            dropdown.style.top = `${rect.bottom + 2}px`; dropdown.style.bottom = 'auto';
            dropdown.style.maxHeight = `${Math.max(spaceBelow, 120)}px`;
          } else {
            dropdown.style.bottom = `${window.innerHeight - rect.top + 2}px`; dropdown.style.top = 'auto';
            dropdown.style.maxHeight = `${Math.max(spaceAbove, 120)}px`;
          }
        }
        function openDropdown() {
          renderList(''); searchIn.value = ''; positionDropdown();
          // Apply theme vars directly so dropdown inherits them even though it's a body child
          applyTheme(loadTheme(), dropdown);
          dropdown.classList.add('open');
          setTimeout(() => searchIn.focus(), 20);
        }
        function closeDropdown() { dropdown.classList.remove('open'); searchIn.value = ''; }
        function selectVal(val) { currentValue = val; updateDisplay(); onChange?.(val); }

        displayInput.addEventListener('click', () => dropdown.classList.contains('open') ? closeDropdown() : openDropdown());
        clearBtn.addEventListener('click', e => { e.stopPropagation(); selectVal(''); closeDropdown(); });
        searchIn.addEventListener('input', () => renderList(searchIn.value));
        searchIn.addEventListener('keydown', e => {
          const items = [...list.querySelectorAll('.tcws-combo-option')];
          if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx+1, items.length-1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx-1, 0); }
          else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); selectVal(items[focusedIdx].dataset.value ?? ''); closeDropdown(); return; }
          else if (e.key === 'Escape') { closeDropdown(); return; }
          items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
          items[focusedIdx]?.scrollIntoView({ block: 'nearest' });
        });
        const onOutside = e => { if (!wrap.contains(e.target) && !dropdown.contains(e.target)) closeDropdown(); };
        document.addEventListener('mousedown', onOutside, true);

        updateDisplay();
        return { wrap, inputEl: displayInput, getValue: () => currentValue, setValue: v => { currentValue = v ?? ''; updateDisplay(); }, destroyDropdown: () => { dropdown.remove(); document.removeEventListener('mousedown', onOutside, true); } };
      }

      // ── Input builder ─────────────────────────────────────────────────────────
      function makeInput(fieldDef, currentVal, { onChangeCb } = {}) {
        const wrap = document.createElement('div'); wrap.className = 'tcws-fp-field';
        const lbl = document.createElement('label'); lbl.className = 'tcws-fp-field-lbl';
        const dot = document.createElement('span'); dot.className = 'tcws-fp-field-lbl-dirty';
        lbl.appendChild(dot);
        lbl.appendChild(document.createTextNode(fieldDef.label));
        wrap.appendChild(lbl);

        const originalVal = currentVal;
        let input;

        if (fieldDef.type === 'checkbox') {
          const row = document.createElement('div'); row.className = 'tcws-fp-checkbox-row';
          input = document.createElement('input'); input.type = 'checkbox'; input.className = 'tcws-fp-checkbox'; input.checked = Boolean(currentVal);
          const cbLbl = document.createElement('label'); cbLbl.className = 'tcws-fp-checkbox-lbl'; cbLbl.textContent = fieldDef.label;
          const cbId = `tcws-fp-cb-${fieldDef.id}`; input.id = cbId; cbLbl.htmlFor = cbId;
          row.appendChild(input); row.appendChild(cbLbl); wrap.appendChild(row);
        } else if (fieldDef.type === 'textarea') {
          input = document.createElement('textarea'); input.className = 'tcws-fp-input tcws-fp-textarea'; input.value = currentVal ?? '';
          wrap.appendChild(input);
        } else if (fieldDef.type === 'tagger' && (fieldDef.opts || prefetchedOpts[String(fieldDef.id)])) {
          let rawOpts;
          if (prefetchedOpts[String(fieldDef.id)]?.length) {
            // Live options from Zendesk API — already [{value, label}]
            rawOpts = prefetchedOpts[String(fieldDef.id)].filter(o => o.value);
          } else {
            // Hardcoded string list — map to [{value, label}]
            rawOpts = (fieldDef.opts || []).filter(v => v).map(v => ({ value: v, label: v }));
          }
          const opts = [{ value: '', label: '(none)' }, ...rawOpts];
          const combo = makeCombobox(opts, currentVal ?? '', val => {
            const key = String(fieldDef.id);
            dirtyMap[key].dirty = String(val) !== String(originalVal ?? '');
            wrap.classList.toggle('dirty', dirtyMap[key].dirty);
            updateDirtyCount();
            onChangeCb?.(val);
          });
          const key = String(fieldDef.id);
          dirtyMap[key] = { originalVal, inputEl: combo, dirty: false, fieldDef, getVal: () => combo.getValue() };
          wrap.appendChild(combo.wrap);
          return wrap;
        } else {
          input = document.createElement('input'); input.className = 'tcws-fp-input';
          input.type = fieldDef.type === 'number' ? 'number' : fieldDef.type === 'date' ? 'date' : 'text';
          input.value = currentVal ?? ''; wrap.appendChild(input);
        }

        const key = String(fieldDef.id);
        const getVal = () => input.type === 'checkbox' ? input.checked : input.value;
        input.addEventListener?.('input',  () => { markDirty(key, originalVal, input); onChangeCb?.(input.value); });
        input.addEventListener?.('change', () => { markDirty(key, originalVal, input); onChangeCb?.(input.value); });
        dirtyMap[key] = { originalVal, inputEl: input, dirty: false, fieldDef, getVal };
        return wrap;
      }

      // ── Standard fields section ───────────────────────────────────────────────
      const stdSection = document.createElement('div'); stdSection.className = 'tcws-fp-section';
      stdSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Standard Fields</div>');
      const stdFields = KEY_FIELDS.filter(f => f.std);
      for (const fd of stdFields) {
        const val = rawTicket[fd.id];
        stdSection.appendChild(makeInput(fd, val));
      }
      body.appendChild(stdSection);

      // ── Key custom fields section ─────────────────────────────────────────────
      const siteSection = document.createElement('div'); siteSection.className = 'tcws-fp-section';
      siteSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Site Info</div>');
      const siteFieldIds = [360024203794, 360024223634, 360040366753, 360040366793, 360024204494, 30003883052439];
      for (const fd of KEY_FIELDS.filter(f => !f.std && siteFieldIds.includes(f.id))) {
        siteSection.appendChild(makeInput(fd, cfMap[fd.id] ?? null));
      }
      body.appendChild(siteSection);

      const issueSection = document.createElement('div'); issueSection.className = 'tcws-fp-section';
      issueSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Issue Details</div>');

      // ── Content Area 1 (dynamic combobox from API) ────────────────────────────
      const ca1Wrap = document.createElement('div'); ca1Wrap.className = 'tcws-fp-field';
      const ca1Lbl = document.createElement('label'); ca1Lbl.className = 'tcws-fp-field-lbl';
      ca1Lbl.innerHTML = `<span class="tcws-fp-field-lbl-dirty"></span>Content Area`;
      ca1Wrap.appendChild(ca1Lbl);
      const ca1Loading = document.createElement('div'); ca1Loading.className = 'tcws-fp-input'; ca1Loading.style.cssText = 'opacity:.5;font-style:italic;pointer-events:none'; ca1Loading.textContent = 'Loading options…';
      ca1Wrap.appendChild(ca1Loading);
      issueSection.appendChild(ca1Wrap);

      // ── Content Area 2 (shown after CA1 selected, options depend on CA1) ──────
      const ca2Wrap = document.createElement('div'); ca2Wrap.className = 'tcws-fp-field';
      const ca2Lbl = document.createElement('label'); ca2Lbl.className = 'tcws-fp-field-lbl';
      ca2Lbl.innerHTML = `<span class="tcws-fp-field-lbl-dirty"></span>Content Area 2`;
      ca2Wrap.appendChild(ca2Lbl);
      const ca2Placeholder = document.createElement('div'); ca2Placeholder.className = 'tcws-fp-input'; ca2Placeholder.style.cssText = 'opacity:.4;font-style:italic;pointer-events:none'; ca2Placeholder.textContent = 'Select Content Area 1 first';
      ca2Wrap.appendChild(ca2Placeholder);
      issueSection.appendChild(ca2Wrap);

      let _ca2Combo = null;

      async function buildCA2Combo(ca1Val, currentCA2Val) {
        // Destroy previous CA2 combo if any
        _ca2Combo?.destroyDropdown?.();
        _ca2Combo = null;
        // Remove old input(s) except the label
        while (ca2Wrap.children.length > 1) ca2Wrap.removeChild(ca2Wrap.lastChild);
        delete dirtyMap['ca2'];

        const ca2FieldId = _ca1ToCA2FieldId(ca1Val);
        if (!ca2FieldId) {
          const ph = document.createElement('div'); ph.className = 'tcws-fp-input'; ph.style.cssText = 'opacity:.4;font-style:italic;pointer-events:none'; ph.textContent = 'No sub-field for this category';
          ca2Wrap.appendChild(ph); return;
        }
        const loadPh = document.createElement('div'); loadPh.className = 'tcws-fp-input'; loadPh.style.cssText = 'opacity:.5;font-style:italic;pointer-events:none'; loadPh.textContent = 'Loading options…';
        ca2Wrap.appendChild(loadPh);
        try {
          const ca2Opts = await fetchFieldOptions(ca2FieldId);
          while (ca2Wrap.children.length > 1) ca2Wrap.removeChild(ca2Wrap.lastChild);
          // Get current CA2 value from cfMap
          const curCA2 = cfMap[ca2FieldId] ?? currentCA2Val ?? null;
          const opts = [{ value: '', label: '(none)' }, ...ca2Opts.filter(o => o.value)];
          if (!opts.length || (opts.length === 1 && opts[0].value === '')) {
            // Single-value boolean-style field - just show a checkbox
            const cbRow = document.createElement('div'); cbRow.className = 'tcws-fp-checkbox-row';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'tcws-fp-checkbox'; cb.checked = Boolean(curCA2);
            const cbL = document.createElement('label'); cbL.className = 'tcws-fp-checkbox-lbl'; cbL.textContent = 'Applies to this ticket';
            cbRow.appendChild(cb); cbRow.appendChild(cbL); ca2Wrap.appendChild(cbRow);
            const originalCA2 = curCA2;
            dirtyMap['ca2'] = { originalVal: originalCA2, inputEl: cb, dirty: false, fieldDef: { id: ca2FieldId, type: 'checkbox' }, getVal: () => cb.checked };
            cb.addEventListener('change', () => { dirtyMap['ca2'].dirty = cb.checked !== Boolean(originalCA2); ca2Wrap.classList.toggle('dirty', dirtyMap['ca2'].dirty); updateDirtyCount(); });
          } else {
            _ca2Combo = makeCombobox(opts, curCA2 ?? '', val => {
              const originalCA2 = cfMap[ca2FieldId] ?? null;
              dirtyMap['ca2'] = { ...dirtyMap['ca2'], dirty: String(val) !== String(originalCA2 ?? '') };
              ca2Wrap.classList.toggle('dirty', dirtyMap['ca2'].dirty);
              updateDirtyCount();
            });
            dirtyMap['ca2'] = { originalVal: curCA2, inputEl: _ca2Combo, dirty: false, fieldDef: { id: ca2FieldId, type: 'tagger' }, getVal: () => _ca2Combo.getValue() };
            ca2Wrap.appendChild(_ca2Combo.wrap);
          }
        } catch (e) {
          while (ca2Wrap.children.length > 1) ca2Wrap.removeChild(ca2Wrap.lastChild);
          const errPh = document.createElement('div'); errPh.className = 'tcws-fp-input'; errPh.style.cssText = 'opacity:.5;color:var(--t-crit)'; errPh.textContent = `Load failed: ${e.message}`;
          ca2Wrap.appendChild(errPh);
        }
      }

      // Load CA1 options and wire up
      (async () => {
        try {
          const ca1Opts = await fetchFieldOptions(360034766533);
          while (ca1Wrap.children.length > 1) ca1Wrap.removeChild(ca1Wrap.lastChild);
          const currentCA1 = cfMap[360034766533] ?? null;
          const opts = [{ value: '', label: '(none)' }, ...ca1Opts.filter(o => o.value)];
          const ca1Combo = makeCombobox(opts, currentCA1 ?? '', async val => {
            const orig = cfMap[360034766533] ?? null;
            dirtyMap['360034766533'].dirty = String(val) !== String(orig ?? '');
            ca1Wrap.classList.toggle('dirty', dirtyMap['360034766533'].dirty);
            updateDirtyCount();
            await buildCA2Combo(val, null);
          });
          dirtyMap['360034766533'] = { originalVal: currentCA1, inputEl: ca1Combo, dirty: false, fieldDef: { id: 360034766533, type: 'tagger', std: false }, getVal: () => ca1Combo.getValue() };
          ca1Wrap.appendChild(ca1Combo.wrap);
          // Immediately build CA2 based on current CA1 value
          if (currentCA1) await buildCA2Combo(currentCA1, null);
          else {
            while (ca2Wrap.children.length > 1) ca2Wrap.removeChild(ca2Wrap.lastChild);
            const ph = document.createElement('div'); ph.className = 'tcws-fp-input'; ph.style.cssText = 'opacity:.4;font-style:italic;pointer-events:none'; ph.textContent = 'Select Content Area 1 first';
            ca2Wrap.appendChild(ph);
          }
        } catch (e) {
          while (ca1Wrap.children.length > 1) ca1Wrap.removeChild(ca1Wrap.lastChild);
          const errPh = document.createElement('div'); errPh.className = 'tcws-fp-input'; errPh.style.cssText = 'opacity:.5;color:var(--t-crit)'; errPh.textContent = `Load failed: ${e.message}`;
          ca1Wrap.appendChild(errPh);
        }
      })();

      // Other issue detail fields (skip 360034766533 — handled above)
      const otherIssueFieldIds = [1500007725882, 360040366933, 360040366913];
      for (const fd of KEY_FIELDS.filter(f => !f.std && otherIssueFieldIds.includes(f.id))) {
        issueSection.appendChild(makeInput(fd, cfMap[fd.id] ?? null));
      }
      body.appendChild(issueSection);

      const washSection = document.createElement('div'); washSection.className = 'tcws-fp-section';
      washSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Wash Down</div>');
      const washFieldIds = [1500007018341, 360054265253, 1500012392482];
      for (const fd of KEY_FIELDS.filter(f => !f.std && washFieldIds.includes(f.id))) {
        washSection.appendChild(makeInput(fd, cfMap[fd.id] ?? null));
      }
      body.appendChild(washSection);

      const partsSection = document.createElement('div'); partsSection.className = 'tcws-fp-section';
      partsSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Parts / RMA</div>');
      const partsFieldIds = [360040366973, 360040366993, 360040404394];
      for (const fd of KEY_FIELDS.filter(f => !f.std && partsFieldIds.includes(f.id))) {
        partsSection.appendChild(makeInput(fd, cfMap[fd.id] ?? null));
      }
      body.appendChild(partsSection);

      // ── Tags ──────────────────────────────────────────────────────────────────
      const tagsSection = document.createElement('div'); tagsSection.className = 'tcws-fp-section';
      tagsSection.insertAdjacentHTML('beforeend', '<div class="tcws-fp-section-hdr">Tags</div>');
      const tagsWrap = document.createElement('div'); tagsWrap.className = 'tcws-fp-field';
      const tagsLbl = document.createElement('label'); tagsLbl.className = 'tcws-fp-field-lbl';
      tagsLbl.innerHTML = `<span class="tcws-fp-field-lbl-dirty"></span>Tags`;
      tagsWrap.appendChild(tagsLbl);
      const tagsInput = document.createElement('input');
      tagsInput.type = 'text'; tagsInput.className = 'tcws-fp-input';
      tagsInput.placeholder = 'space-separated tags';
      const rawTagsVal = Array.isArray(rawTicket.tags) ? rawTicket.tags.join(' ') : (rawTicket.tags || '');
      tagsInput.value = rawTagsVal;
      tagsWrap.appendChild(tagsInput);
      tagsSection.appendChild(tagsWrap);
      body.appendChild(tagsSection);

      // Wire tags dirty tracking
      const tagsOriginal = rawTagsVal;
      dirtyMap['tags'] = {
        originalVal: tagsOriginal,
        inputEl: tagsInput,
        dirty: false,
        fieldDef: { id: 'tags', std: true, type: 'text' },
        getVal: () => tagsInput.value.trim().split(/\s+/).filter(Boolean),
      };
      tagsInput.addEventListener('input', () => {
        const isDirty = tagsInput.value.trim() !== tagsOriginal.trim();
        dirtyMap['tags'].dirty = isDirty;
        tagsInput.classList.toggle('dirty', isDirty);
        const anyDirty = Object.values(dirtyMap).some(d => d.dirty);
        saveBtn.disabled = !anyDirty;
        dirtyCount.textContent = anyDirty ? `${Object.values(dirtyMap).filter(d=>d.dirty).length} unsaved` : '';
      });
      saveBtn.disabled = true; // start disabled — no changes yet

      discardBtn.addEventListener('click', () => {
        // Re-render to reset all inputs
        renderFieldsPanel(tid, alertObj);
      });

      saveBtn.addEventListener('click', async () => {
        const changes = Object.entries(dirtyMap).filter(([, d]) => d.dirty);
        if (!changes.length) return;

        saveBtn.disabled = true;
        statusBar.className = 'tcws-fp-status-bar saving';
        statusBar.textContent = 'Saving…';

        const ticketUpdate = {};
        const customFieldUpdates = [];

        for (const [key, d] of changes) {
          const val = d.getVal();
          if (d.fieldDef.std) {
            // Standard field — goes directly in ticket object using the field's string id
            ticketUpdate[d.fieldDef.id] = val === '' ? null : val;
          } else {
            // Custom field — use the numeric fieldDef.id
            const cfId = Number(d.fieldDef.id);
            if (cfId) customFieldUpdates.push({ id: cfId, value: d.fieldDef.type === 'checkbox' ? val : (val === '' ? null : val) });
          }
        }

        if (customFieldUpdates.length) ticketUpdate.custom_fields = customFieldUpdates;

        try {
          const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
          const csrf = getCsrfToken();
          if (csrf) headers['X-CSRF-Token'] = csrf;

          const r = await fetch(`/api/v2/tickets/${encodeURIComponent(tid)}.json`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers,
            body: JSON.stringify({ ticket: ticketUpdate }),
          });

          if (!r.ok) {
            const errText = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status}: ${errText.slice(0, 120)}`);
          }

          // Invalidate ticket cache so detail panel refreshes
          delete ticketCache[String(tid)];
          _ticketFieldDefs = null; // refresh field defs on next open

          statusBar.className = 'tcws-fp-status-bar ok';
          statusBar.textContent = `Saved ${changes.length} field${changes.length === 1 ? '' : 's'}`;
          setTimeout(() => { statusBar.className = 'tcws-fp-status-bar'; }, 3000);

          // Re-render both panels with fresh data
          setTimeout(() => {
            renderFieldsPanel(tid, alertObj);
            renderDetailPanel(tid, alertObj);
          }, 600);

        } catch (e) {
          statusBar.className = 'tcws-fp-status-bar err';
          statusBar.textContent = `Save failed: ${e.message}`;
          saveBtn.disabled = false;
        }
      });

    } catch (err) {
      body.innerHTML = `<div class="tcws-det-loading">Could not load fields<br><small style="opacity:.6">${escHtml(String(err?.message || err))}</small></div>`;
    }
  }

  function buildDetailPanel() {
    const dp = document.createElement('div');
    dp.id = 'tcws-detail-panel';
    dp.className = 'tcws-panel';
    document.body.appendChild(dp);
    applyTheme(loadTheme(), dp);
    applyDetWidth(dp);
    applyScale(dp);
    const inner = document.createElement('div');
    inner.className = 'tcws-panel-inner';
    dp.appendChild(inner);

    // Left column: fields editor (hidden by default, shown when Fields btn clicked)
    const fieldsCol = document.createElement('div');
    fieldsCol.className = 'tcws-det-fields-col';
    inner.appendChild(fieldsCol);

    // Right column: main detail content (always visible)
    const mainCol = document.createElement('div');
    mainCol.className = 'tcws-det-main-col';
    inner.appendChild(mainCol);

    return dp;
  }

  function positionDetailPanel() {
    if (!panelEl || !detailPanelEl) return;
    const pr  = panelEl.getBoundingClientRect();
    // getBoundingClientRect already returns the fully-zoomed visual rect (CSS zoom on
    // .tcws-panel-inner causes the outer .tcws-panel to grow to match). No scaling needed.
    const visualRight = pr.right;
    const dpH = detailPanelEl.offsetHeight || 500;
    const dpW = detailPanelEl.offsetWidth  || 740;
    let top = pr.top;
    if (top + dpH > window.innerHeight - 8) top = window.innerHeight - dpH - 8;
    if (top < 8) top = 8;
    let left = visualRight + 8;
    if (left + dpW > window.innerWidth - 8) {
      const leftAlt = pr.left - dpW - 8;
      left = Math.max(8, leftAlt);
    }
    detailPanelEl.style.left = `${left}px`;
    detailPanelEl.style.top  = `${top}px`;
    detailPanelEl.style.maxHeight = `${Math.max(pr.height, window.innerHeight * 0.9)}px`;
  }

  // ─── Media Viewer helpers ─────────────────────────────────────────────────────

  function openMediaLightbox(url, fileName, siblingImgs) {
    // Remove any existing lightbox
    document.getElementById('tcws-media-lightbox')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tcws-media-lightbox';
    overlay.className = 'tcws-media-lightbox';

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const box = document.createElement('div');
    box.className = 'tcws-media-lightbox-box';
    box.addEventListener('click', e => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'tcws-media-lightbox-hdr';
    const nameEl = document.createElement('span');
    nameEl.className = 'tcws-media-lightbox-name';
    nameEl.textContent = fileName;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.className = 'tcws-media-lightbox-close'; closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);
    const openOrig = document.createElement('a');
    openOrig.href = url; openOrig.target = '_blank'; openOrig.rel = 'noopener noreferrer';
    openOrig.className = 'tcws-btn'; openOrig.textContent = '↗ Open';
    openOrig.style.cssText = 'font-size:11px;padding:3px 10px;text-decoration:none';
    header.appendChild(nameEl); header.appendChild(openOrig); header.appendChild(closeBtn);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'tcws-media-lightbox-imgwrap';
    const imgEl = document.createElement('img');
    imgEl.className = 'tcws-media-lightbox-img';
    imgEl.src = url; imgEl.alt = fileName;
    imgWrap.appendChild(imgEl);

    // Sibling navigation arrows
    if (siblingImgs && siblingImgs.length > 1) {
      let curIdx = siblingImgs.findIndex(s => s.url === url);

      const nav = (delta) => {
        curIdx = (curIdx + delta + siblingImgs.length) % siblingImgs.length;
        const s = siblingImgs[curIdx];
        imgEl.src = s.url; imgEl.alt = s.fileName;
        nameEl.textContent = s.fileName;
        openOrig.href = s.url;
      };

      const prev = document.createElement('button');
      prev.type = 'button'; prev.className = 'tcws-media-lb-nav tcws-media-lb-prev'; prev.textContent = '‹';
      prev.addEventListener('click', () => nav(-1));

      const next = document.createElement('button');
      next.type = 'button'; next.className = 'tcws-media-lb-nav tcws-media-lb-next'; next.textContent = '›';
      next.addEventListener('click', () => nav(1));

      imgWrap.appendChild(prev); imgWrap.appendChild(next);
    }

    box.appendChild(header); box.appendChild(imgWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Keyboard nav
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey));
  }

  function openMediaGrid(allImgs) {
    document.getElementById('tcws-media-grid-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tcws-media-grid-overlay';
    overlay.className = 'tcws-media-lightbox';
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const box = document.createElement('div');
    box.className = 'tcws-media-lightbox-box';
    box.style.maxWidth = '700px';
    box.addEventListener('click', e => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'tcws-media-lightbox-hdr';
    header.innerHTML = `<span class="tcws-media-lightbox-name">All Images (${allImgs.length})</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.className = 'tcws-media-lightbox-close'; closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    const grid = document.createElement('div');
    grid.className = 'tcws-media-grid';

    for (const img of allImgs) {
      const cell = document.createElement('div');
      cell.className = 'tcws-media-grid-cell';
      cell.title = img.fileName;
      const imgEl = document.createElement('img');
      imgEl.className = 'tcws-media-grid-img';
      imgEl.src = img.url; imgEl.alt = img.fileName; imgEl.loading = 'lazy';
      cell.appendChild(imgEl);
      cell.addEventListener('click', () => { close(); openMediaLightbox(img.url, img.fileName, allImgs); });
      grid.appendChild(cell);
    }

    box.appendChild(header); box.appendChild(grid);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  function openDetailPanel(tid, alertObj) {
    if (!detailPanelEl) detailPanelEl = buildDetailPanel();
    _openDetailTid = String(tid);
    applyTheme(loadTheme(), detailPanelEl);
    applyDetWidth(detailPanelEl);
    applyScale(detailPanelEl);
    detailPanelEl.style.visibility = 'hidden';
    detailPanelEl.classList.add('open');
    positionDetailPanel();
    detailPanelEl.style.visibility = '';
    renderDetailPanel(tid, alertObj);
  }

  function closeDetailPanel() {
    detailPanelEl?.classList.remove('open');
    detailPanelEl?.classList.remove('fields-open');
    fieldsPanelEl?.classList.remove('open');
    _openDetailTid = null;
    panelEl?.querySelectorAll('.tcws-pill.detail-open').forEach(p => p.classList.remove('detail-open'));
  }

  async function renderDetailPanel(tid, alertObj) {
    if (!detailPanelEl) return;
    const mainCol = detailPanelEl.querySelector('.tcws-det-main-col');
    if (!mainCol) return;
    mainCol.innerHTML = '';
    if (fieldsPanelEl?.classList.contains('open')) renderFieldsPanel(tid, alertObj);
    const inner = mainCol;

    // ── Header ────────────────────────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'tcws-det-header';
    const loadFieldsBtn = document.createElement('button');
    loadFieldsBtn.className = 'tcws-det-fields-btn';
    loadFieldsBtn.title = 'Open fields editor panel';
    loadFieldsBtn.setAttribute('data-active', '0');
    loadFieldsBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg> Fields`;
    loadFieldsBtn.addEventListener('click', () => {
      const isOpen = fieldsPanelEl?.classList.contains('open');
      if (isOpen) { closeFieldsPanel(); loadFieldsBtn.setAttribute('data-active','0'); }
      else        { openFieldsPanel(tid, alertObj); loadFieldsBtn.setAttribute('data-active','1'); }
    });
    const hdrLeft = document.createElement('div'); hdrLeft.style.cssText = 'display:flex;align-items:center;gap:8px';
    const ttl = document.createElement('div'); ttl.className = 'tcws-det-title';
    ttl.textContent = `Ticket #${tid}`;
    hdrLeft.appendChild(loadFieldsBtn); hdrLeft.appendChild(ttl);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tcws-det-close'; closeBtn.textContent = '×'; closeBtn.title = 'Close detail panel';
    closeBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); closeDetailPanel(); });
    hdr.appendChild(hdrLeft); hdr.appendChild(closeBtn);
    inner.appendChild(hdr);

    // ── Layout zones ──────────────────────────────────────────────────────────────
    const meta   = document.createElement('div'); meta.className   = 'tcws-det-meta';
    const convo  = document.createElement('div'); convo.className  = 'tcws-det-convo';
    const footer = document.createElement('div'); footer.className = 'tcws-det-footer';
    convo.innerHTML = `<div class="tcws-det-loading">Loading ticket #${tid}…</div>`;
    inner.appendChild(meta); inner.appendChild(convo); inner.appendChild(footer);

    // ── PHASE 1: fetch ticket detail — render meta + footer immediately ───────────
    let detail;
    try {
      detail = await fetchTicketDetail(tid);
    } catch (e) {
      convo.innerHTML = `<div class="tcws-det-loading" style="color:var(--t-crit)">Failed to load ticket: ${escHtml(e.message)}</div>`;
      return;
    }

    // Guard: panel may have been closed or switched while awaiting
    if (_openDetailTid !== String(tid)) return;

    meta.innerHTML = '';
    meta.insertAdjacentHTML('beforeend', `
      <div class="tcws-det-ticket-id">Ticket #${escHtml(String(detail.id))} · ${escHtml(detail.via || 'web')}</div>
      <div class="tcws-det-subject">${escHtml(detail.subject)}</div>
    `);
    const badges = document.createElement('div'); badges.className = 'tcws-det-badges';
    badges.innerHTML = `
      <span class="tcws-badge-pill" data-s="${escHtml(detail.status)}">${escHtml(detail.status)}</span>
      ${detail.type     ? `<span class="tcws-badge-pill">${escHtml(detail.type)}</span>`     : ''}
      ${detail.priority ? `<span class="tcws-badge-pill">${escHtml(detail.priority)}</span>` : ''}
    `;
    meta.appendChild(badges);

    // Merge notice
    const rec = alertObj?.tmeta?.[String(tid)];
    const updates = Array.isArray(rec?.updates) ? rec.updates : [];
    const mergeUpdate = updates.findLast(u => u.kind === 'merge');
    const mergedIntoId = mergeUpdate ? _parseMergedIntoIdFromText(mergeUpdate.text || '') : 0;
    if (mergedIntoId) {
      const mergeBox = document.createElement('div'); mergeBox.className = 'tcws-det-merge-box';
      mergeBox.innerHTML = '<div class="tcws-det-merge-lbl">Merged into</div>';
      const mergeTarget = document.createElement('div'); mergeTarget.className = 'tcws-det-merge-target';
      const mergeA1 = _mkTicketLink(mergedIntoId, ''); mergeA1.textContent = `#${mergedIntoId}`;
      const mergeA2 = _mkTicketLink(mergedIntoId, ''); mergeA2.textContent = 'Open →';
      mergeTarget.appendChild(mergeA1); mergeTarget.insertAdjacentText('beforeend', ' — '); mergeTarget.appendChild(mergeA2);
      mergeBox.appendChild(mergeTarget); meta.appendChild(mergeBox);
    }

    for (const [lbl, val] of [
      ['Requester', detail.requester + (detail.requester_email ? ` <${detail.requester_email}>` : '')],
      ['Assignee',  detail.assignee || '— unassigned —'],
    ]) {
      if (!val) continue;
      const f = document.createElement('div'); f.className = 'tcws-det-field';
      f.innerHTML = `<span class="tcws-det-field-lbl">${escHtml(lbl)}</span><span class="tcws-det-field-val">${escHtml(val)}</span>`;
      meta.appendChild(f);
    }
    if (detail.updated_at || detail.created_at) {
      const dateRow = document.createElement('div'); dateRow.className = 'tcws-det-date-row';
      if (detail.updated_at) dateRow.insertAdjacentHTML('beforeend',
        `<span class="tcws-det-date-item"><span class="tcws-det-field-lbl">Updated</span><span class="tcws-det-field-val">${escHtml(new Date(detail.updated_at).toLocaleString())}</span></span>`);
      if (detail.created_at) dateRow.insertAdjacentHTML('beforeend',
        `<span class="tcws-det-date-item"><span class="tcws-det-field-lbl">Created</span><span class="tcws-det-field-val">${escHtml(new Date(detail.created_at).toLocaleString())}</span></span>`);
      meta.appendChild(dateRow);
    }
    if (detail.description) meta.insertAdjacentHTML('beforeend', `<div class="tcws-det-desc">${escHtml(detail.description)}</div>`);

    // Footer: action buttons + composer (shown immediately, before audits)
    footer.innerHTML = '';
    const actionRow = document.createElement('div'); actionRow.className = 'tcws-det-action-row';
    const openBtn = document.createElement('a');
    openBtn.href = `/agent/tickets/${encodeURIComponent(tid)}`;
    openBtn.className = 'tcws-btn accent'; openBtn.textContent = 'Open Ticket →';
    openBtn.addEventListener('click', e => { e.preventDefault(); _zdNav(`/agent/tickets/${encodeURIComponent(tid)}`); });
    actionRow.appendChild(openBtn);
    if (currentUser?.id && !['solved','closed','merged'].includes(detail.status)) {
      const takeBtn = document.createElement('button');
      takeBtn.type = 'button'; takeBtn.className = 'tcws-det-take-btn';
      const roleName = loadActiveRole();
      takeBtn.textContent = roleName ? `Take It — ${roleName}` : 'Take It';
      takeBtn.title = roleName ? `Assign to ${currentUser.name} under group "${roleName}"` : `Assign to ${currentUser.name}`;
      takeBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        takeBtn.disabled = true; takeBtn.textContent = 'Assigning…';
        const ok = await takeTicket(tid);
        if (ok) { takeBtn.textContent = 'Assigned!'; setTimeout(() => renderDetailPanel(tid, alertObj), 800); }
        else {
          takeBtn.disabled = false;
          const link = document.createElement('a');
          link.href = `/agent/tickets/${encodeURIComponent(tid)}`; link.className = 'tcws-det-take-btn';
          link.style.display = 'block'; link.textContent = `Open ticket #${tid} → take it natively`;
          takeBtn.replaceWith(link);
        }
      });
      actionRow.appendChild(takeBtn);
    }
    footer.appendChild(actionRow);

    if (!['solved','closed','merged'].includes(detail.status)) {
      let composerPublic = false, activeMacroId = null, macroDebounce = null;
      let ta = null, btnNote = null, btnReply = null;
      const comp = document.createElement('div'); comp.className = 'tcws-det-composer';
      const macroBar  = document.createElement('div'); macroBar.className = 'tcws-macro-bar';
      const macroIn   = document.createElement('input');
      macroIn.type = 'text'; macroIn.className = 'tcws-macro-input';
      macroIn.placeholder = '⚡ Search macros… (change subject, status, fields…)';
      const macroList = document.createElement('div'); macroList.className = 'tcws-macro-list';
      const macroPrev = document.createElement('div'); macroPrev.className = 'tcws-macro-preview';
      macroBar.appendChild(macroIn);

      async function doMacroSearch(q) {
        macroList.innerHTML = '<div class="tcws-macro-item" style="opacity:.5">Searching…</div>';
        macroList.classList.add('open');
        try {
          const macros = await fetchMacros(q || '');
          macroList.innerHTML = '';
          if (!macros.length) { macroList.innerHTML = '<div class="tcws-macro-item" style="opacity:.5">No macros found</div>'; return; }
          for (const m of macros) {
            const item = document.createElement('div'); item.className = 'tcws-macro-item';
            item.textContent = m.title;
            item.addEventListener('click', async () => {
              activeMacroId = m.id; macroIn.value = m.title; macroList.classList.remove('open');
              macroPrev.innerHTML = '<div style="opacity:.5;font-size:11px">Loading preview…</div>';
              macroPrev.classList.add('open');
              try {
                const result = await applyMacroPreview(tid, m.id);
                const t = result.ticket || {};
                macroPrev.innerHTML = '';
                const rows = [];
                if (t.subject)     rows.push(['Subject',  escHtml(t.subject)]);
                if (t.status)      rows.push(['Status',   `<span class="tcws-badge-pill" data-s="${escHtml(t.status)}">${escHtml(t.status)}</span>`]);
                if (t.priority)    rows.push(['Priority', escHtml(t.priority)]);
                if (t.assignee_id) rows.push(['Assignee', `ID ${t.assignee_id}`]);
                if (t.comment?.body) {
                  if (ta) {
                    ta.value = t.comment.body;
                    if (t.comment.public === false && btnNote) { composerPublic = false; btnNote.classList.add('active'); btnReply?.classList.remove('active'); }
                    else if (t.comment.public === true && btnReply) { composerPublic = true; btnReply.classList.add('active'); btnNote?.classList.remove('active'); }
                  }
                  rows.push(['Comment', ta ? `<em style="opacity:.7">(filled in text area below)</em>` : `<em style="opacity:.7">(enable Reply Composer in settings)</em>`]);
                }
                if (!rows.length) { macroPrev.innerHTML = '<div style="opacity:.5;font-size:11px">Macro has no preview changes.</div>'; }
                else { for (const [lbl, val] of rows) { const r = document.createElement('div'); r.className = 'tcws-macro-preview-row'; r.innerHTML = `<span class="tcws-macro-preview-lbl">${lbl}</span><span class="tcws-macro-preview-val">${val}</span>`; macroPrev.appendChild(r); } }
              } catch (e) { macroPrev.innerHTML = `<div style="opacity:.5;font-size:11px">Preview failed: ${escHtml(e.message)}</div>`; }
            });
            macroList.appendChild(item);
          }
        } catch (e) { macroList.innerHTML = `<div class="tcws-macro-item" style="opacity:.5">Error: ${escHtml(e.message)}</div>`; }
      }

      macroIn.addEventListener('focus', () => { if (!macroList.classList.contains('open')) doMacroSearch(macroIn.value); });
      macroIn.addEventListener('input', () => {
        activeMacroId = null; macroPrev.classList.remove('open'); macroPrev.innerHTML = '';
        clearTimeout(macroDebounce);
        macroDebounce = setTimeout(() => doMacroSearch(macroIn.value), 280);
      });
      document.addEventListener('click', e => { if (!macroBar.contains(e.target) && !macroList.contains(e.target)) macroList.classList.remove('open'); }, { capture: false });

      comp.appendChild(macroBar); comp.appendChild(macroList); comp.appendChild(macroPrev);

      if (loadReplyComposer()) {
        const typeRow = document.createElement('div'); typeRow.className = 'tcws-det-composer-type';
        btnNote = document.createElement('button'); btnNote.textContent = 'Internal Note'; btnNote.className = 'active';
        btnReply = document.createElement('button'); btnReply.textContent = 'Public Reply';
        typeRow.appendChild(btnNote); typeRow.appendChild(btnReply);
        btnNote.addEventListener('click',  () => { composerPublic = false; btnNote.classList.add('active'); btnReply.classList.remove('active'); });
        btnReply.addEventListener('click', () => { composerPublic = true;  btnReply.classList.add('active'); btnNote.classList.remove('active'); });
        ta = document.createElement('textarea'); ta.placeholder = 'Type your message…';
        const actRow = document.createElement('div'); actRow.className = 'tcws-det-composer-actions';
        const clearMacroBtn = document.createElement('button');
        clearMacroBtn.className = 'tcws-btn xs'; clearMacroBtn.textContent = 'Clear Macro';
        clearMacroBtn.style.cssText = 'margin-right:auto';
        clearMacroBtn.addEventListener('click', () => { activeMacroId = null; macroIn.value = ''; ta.value = ''; macroPrev.classList.remove('open'); macroPrev.innerHTML = ''; macroList.classList.remove('open'); });
        const sendBtn = document.createElement('button');
        sendBtn.className = 'tcws-det-composer-send'; sendBtn.textContent = 'Send';
        sendBtn.addEventListener('click', async () => {
          const txt = ta.value.trim();
          if (!txt && !activeMacroId) { ta.focus(); return; }
          sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
          try {
            if (activeMacroId) { await applyMacroToTicket(tid, activeMacroId); ta.value = ''; macroIn.value = ''; activeMacroId = null; macroPrev.classList.remove('open'); macroPrev.innerHTML = ''; }
            else               { await sendTicketReply(tid, txt, composerPublic); ta.value = ''; }
            sendBtn.textContent = 'Sent!';
            setTimeout(() => { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }, 2500);
            setTimeout(() => renderDetailPanel(tid, alertObj), 800);
          } catch (e) { sendBtn.disabled = false; sendBtn.textContent = 'Failed — Retry'; alert(`TCWS: Send failed — ${e.message}`); }
        });
        actRow.appendChild(clearMacroBtn); actRow.appendChild(sendBtn);
        comp.appendChild(typeRow); comp.appendChild(ta); comp.appendChild(actRow);
      } else {
        const actRow = document.createElement('div'); actRow.className = 'tcws-det-composer-actions';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'tcws-det-composer-send'; applyBtn.textContent = 'Apply Macro';
        applyBtn.addEventListener('click', async () => {
          if (!activeMacroId) { macroIn.focus(); return; }
          applyBtn.disabled = true; applyBtn.textContent = 'Applying…';
          try {
            await applyMacroToTicket(tid, activeMacroId);
            macroIn.value = ''; activeMacroId = null; macroPrev.classList.remove('open'); macroPrev.innerHTML = '';
            applyBtn.textContent = 'Applied!';
            setTimeout(() => { applyBtn.textContent = 'Apply Macro'; applyBtn.disabled = false; }, 2500);
            setTimeout(() => renderDetailPanel(tid, alertObj), 800);
          } catch (e) { applyBtn.disabled = false; applyBtn.textContent = 'Failed — Retry'; alert(`TCWS: Macro failed — ${e.message}`); }
        });
        actRow.appendChild(applyBtn); comp.appendChild(actRow);
      }
      footer.appendChild(comp);
    }

    // Interaction history — loads async in footer
    const histSection = document.createElement('div'); histSection.className = 'tcws-det-history';
    const histHdr = document.createElement('div'); histHdr.className = 'tcws-det-history-hdr';
    const histTitle = document.createElement('span');
    histTitle.style.cssText = 'font-size:9px;font-weight:800;color:var(--t-text3);letter-spacing:.08em;text-transform:uppercase';
    histTitle.textContent = 'Recent Site / Org Tickets';
    const histRefresh = document.createElement('span'); histRefresh.textContent = '↺ Refresh';
    histHdr.appendChild(histTitle); histHdr.appendChild(histRefresh); histSection.appendChild(histHdr);
    const histList = document.createElement('div');
    histList.innerHTML = `<div style="font-size:10px;opacity:.5;padding:4px 0">Loading…</div>`;
    histSection.appendChild(histList); footer.appendChild(histSection);
    const orgId = detail.organization_id || null;
    const requesterId = detail.requester_id || null;
    const currentTid = String(tid);
    function _renderHistList(allTickets) {
      histList.innerHTML = '';
      if (!allTickets.length) { histList.innerHTML = `<div style="font-size:10px;opacity:.5;padding:4px 0">No other tickets found.</div>`; return; }
      const ACTIVE = ['new','open','pending','hold'];
      const sorted = [...allTickets].filter(t => String(t.id) !== currentTid)
        .sort((a, b) => { const aA = ACTIVE.includes(a.status), bA = ACTIVE.includes(b.status); if (aA !== bA) return aA ? -1 : 1; return new Date(b.updated_at) - new Date(a.updated_at); })
        .slice(0, 12);
      if (!sorted.length) { histList.innerHTML = `<div style="font-size:10px;opacity:.5;padding:4px 0">No other tickets found.</div>`; return; }
      for (const t of sorted) {
        const row = document.createElement('div'); row.className = 'tcws-det-hist-row'; row.title = `#${t.id} — ${t.subject}`;
        const badge = document.createElement('span'); badge.className = 'tcws-det-hist-badge'; badge.dataset.s = t.status || 'open'; badge.textContent = (t.status || 'open').toUpperCase();
        const subj = document.createElement('span'); subj.className = 'tcws-det-hist-subject'; subj.textContent = t.subject || '(no subject)';
        const idEl = document.createElement('span'); idEl.className = 'tcws-det-hist-id'; idEl.textContent = `#${t.id}`;
        const ageEl = document.createElement('span'); ageEl.className = 'tcws-det-hist-age'; ageEl.textContent = t.updated_at ? timeAgo(new Date(t.updated_at).getTime()) : '';
        row.appendChild(badge); row.appendChild(subj); row.appendChild(idEl); row.appendChild(ageEl);
        row.addEventListener('click', () => _navToTicket(t.id));
        histList.appendChild(row);
      }
      histTitle.textContent = `Site / Org Tickets (${sorted.length})`;
    }
    histRefresh.addEventListener('click', async () => {
      const cKey = orgId ? `org_${orgId}` : `req_${requesterId}`;
      delete _orgHistoryCache[cKey];
      histList.innerHTML = `<div style="font-size:10px;opacity:.5;padding:4px 0">Refreshing…</div>`;
      _renderHistList(await fetchOrgHistory(orgId, requesterId));
    });
    fetchOrgHistory(orgId, requesterId).then(_renderHistList).catch(() => {
      histList.innerHTML = `<div style="font-size:10px;opacity:.5;padding:4px 0">Could not load history.</div>`;
    });

    // ── PHASE 2: fetch audits async — render convo without blocking the panel ─────
    // convo zone already shows "Loading ticket #N…" placeholder from initial setup.
    fetchTicketAudits(tid, 100).then(({ audits, uMap }) => {
      // Guard: panel may have been closed or re-navigated while audits were loading
      if (_openDetailTid !== String(tid)) return;
      convo.innerHTML = '';

      const mediaEnabled = featEnabled('mediaViewer');
      const convoEvents = [];
      for (const au of audits) {
        const auTs   = au.created_at ? new Date(au.created_at).getTime() : 0;
        const author = uMap?.[au.author_id] || '';
        const events = Array.isArray(au?.events) ? au.events : [];
        for (const ev of events) {
          if (!ev?.type) continue;
          if (ev.type === 'Comment') {
            const rawAtts    = Array.isArray(ev.attachments) ? ev.attachments : [];
            const imgAtts    = rawAtts.filter(a => a?.content_type?.startsWith('image/'));
            const audAtts    = rawAtts.filter(a => a?.content_type?.startsWith('audio/'));
            const bodyImgUrls = [];
            const attUrlRe   = /https:\/\/[^\s"'<>]*\/attachments\/token\/[^\s"'<>?]+(?:\?[^\s"'<>]*)?/g;
            let m;
            while ((m = attUrlRe.exec(ev.body || '')) !== null) bodyImgUrls.push(m[0]);
            convoEvents.push({ ts: auTs, kind: ev.public === true ? 'reply' : 'note', author, body: ev.body || '', imgAtts, audAtts, bodyImgUrls });
          } else if (ev.type === 'VoiceComment' || ev.type === 'TrunkCallComment') {
            const callId = ev.call_id || ev.data?.call_id || '';
            const recUrl = callId ? `/api/v2/channels/voice/calls/${encodeURIComponent(callId)}/twilio/recording` : '';
            convoEvents.push({ ts: auTs, kind: ev.public === true ? 'reply' : 'note', author, body: ev.body || '', imgAtts: [], audAtts: [], bodyImgUrls: [], voiceRecUrl: recUrl, callId });
          } else if (ev.type === 'Change' && ev.field_name === 'status') {
            convoEvents.push({ ts: auTs, kind: 'status', author, body: `${ev.previous_value || '?'} → ${ev.value || '?'}` });
          } else if (ev.type === 'Change' && ev.field_name === 'assignee_id') {
            const who = uMap?.[ev.value] || uMap?.[Number(ev.value)] || `ID ${ev.value}`;
            convoEvents.push({ ts: auTs, kind: 'assign', author, body: `Assigned to ${who}` });
          }
        }
      }
      convoEvents.sort((a, b) => a.ts - b.ts);

      const allMediaImgs = [];
      if (mediaEnabled) {
        convoEvents.forEach((ev, idx) => {
          (ev.imgAtts    || []).forEach(a => allMediaImgs.push({ url: a.content_url, fileName: a.file_name || 'image', eventIdx: idx }));
          (ev.bodyImgUrls || []).forEach(u => allMediaImgs.push({ url: u, fileName: u.split('/').pop().split('?')[0] || 'image', eventIdx: idx }));
        });
      }

      if (!convoEvents.length) {
        convo.innerHTML = `<div class="tcws-convo-empty">No conversation events found.</div>`;
        return;
      }

      const convoHdr = document.createElement('div'); convoHdr.className = 'tcws-convo-hdr';
      const commentCount = convoEvents.filter(e => e.kind === 'reply' || e.kind === 'note').length;
      convoHdr.innerHTML = `<span class="tcws-convo-hdr-label">Conversation</span><span class="tcws-convo-hdr-count">${commentCount} message${commentCount !== 1 ? 's' : ''}</span>`;
      if (mediaEnabled && allMediaImgs.length > 0) {
        const viewAllBtn = document.createElement('button');
        viewAllBtn.type = 'button'; viewAllBtn.className = 'tcws-media-viewall-btn';
        viewAllBtn.innerHTML = `🖼 ${allMediaImgs.length} image${allMediaImgs.length !== 1 ? 's' : ''}`;
        viewAllBtn.title = 'View all images in this ticket';
        viewAllBtn.addEventListener('click', e => { e.stopPropagation(); openMediaGrid(allMediaImgs); });
        convoHdr.appendChild(viewAllBtn);
      }
      convo.appendChild(convoHdr);

      let lastDateStr = '';
      for (const ev of convoEvents) {
        const d = ev.ts ? new Date(ev.ts) : null;
        const dateStr = d ? d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }) : '';
        if (dateStr && dateStr !== lastDateStr) {
          lastDateStr = dateStr;
          const sep = document.createElement('div'); sep.className = 'tcws-convo-date-sep'; sep.textContent = dateStr;
          convo.appendChild(sep);
        }
        if (ev.kind === 'reply' || ev.kind === 'note') {
          const bubble = document.createElement('div'); bubble.className = `tcws-convo-bubble tcws-convo-${ev.kind}`;
          const authorInitial = (ev.author || '?').charAt(0).toUpperCase();
          const timeStr = d ? d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }) : '';
          const kindLabel = ev.kind === 'reply' ? 'Public' : 'Internal Note';
          const bubbleHdr = document.createElement('div'); bubbleHdr.className = 'tcws-convo-bubble-hdr';
          bubbleHdr.innerHTML = `
            <span class="tcws-convo-avatar tcws-convo-${ev.kind}">${escHtml(authorInitial)}</span>
            <span class="tcws-convo-author">${escHtml(ev.author || 'Unknown')}</span>
            <span class="tcws-convo-kind-badge tcws-convo-${ev.kind}">${kindLabel}</span>
            <span class="tcws-convo-ts">${escHtml(timeStr)}</span>
          `;
          bubble.appendChild(bubbleHdr);
          const bodyEl = document.createElement('div'); bodyEl.className = 'tcws-convo-bubble-body'; bodyEl.textContent = ev.body;
          bubble.appendChild(bodyEl);
          if (mediaEnabled) {
            const bubbleImgs = [
              ...(ev.imgAtts    || []).map(a => ({ url: a.content_url, fileName: a.file_name || 'image' })),
              ...(ev.bodyImgUrls || []).map(u => ({ url: u, fileName: u.split('/').pop().split('?')[0] || 'image' })),
            ];
            if (bubbleImgs.length > 0) {
              const thumbRow = document.createElement('div'); thumbRow.className = 'tcws-media-thumb-row';
              for (const img of bubbleImgs) {
                const wrap = document.createElement('div'); wrap.className = 'tcws-media-thumb-wrap'; wrap.title = img.fileName;
                const imgEl = document.createElement('img'); imgEl.className = 'tcws-media-thumb'; imgEl.src = img.url; imgEl.alt = img.fileName; imgEl.loading = 'lazy';
                wrap.addEventListener('click', () => openMediaLightbox(img.url, img.fileName, bubbleImgs));
                wrap.appendChild(imgEl); thumbRow.appendChild(wrap);
              }
              bubble.appendChild(thumbRow);
            }
            const audUrls = [
              ...(ev.audAtts    || []).map(a => ({ url: a.content_url, label: a.file_name || 'Audio' })),
              ...(ev.voiceRecUrl ? [{ url: ev.voiceRecUrl + `?ts=${Date.now()}`, label: 'Call Recording' }] : []),
            ];
            for (const aud of audUrls) {
              const playerWrap = document.createElement('div'); playerWrap.className = 'tcws-media-audio-wrap';
              playerWrap.innerHTML = `
                <span class="tcws-media-audio-label">🎙 ${escHtml(aud.label)}</span>
                <audio class="tcws-media-audio" controls preload="metadata" controlsList="nodownload">
                  <source src="${escHtml(aud.url)}" type="audio/mpeg">
                </audio>
              `;
              bubble.appendChild(playerWrap);
            }
          }
          convo.appendChild(bubble);
        } else {
          const chip = document.createElement('div'); chip.className = `tcws-convo-event tcws-convo-${ev.kind}`;
          const timeStr = d ? d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }) : '';
          const icon = ev.kind === 'status' ? '◈' : '↪';
          chip.innerHTML = `
            <span class="tcws-convo-event-icon">${icon}</span>
            <span class="tcws-convo-event-text">${escHtml(ev.body)}</span>
            ${ev.author ? `<span class="tcws-convo-event-by">by ${escHtml(ev.author)}</span>` : ''}
            <span class="tcws-convo-event-ts">${escHtml(timeStr)}</span>
          `;
          convo.appendChild(chip);
        }
      }
      requestAnimationFrame(() => { convo.scrollTop = 0; });
    }).catch(err => {
      if (_openDetailTid !== String(tid)) return;
      convo.innerHTML = `<div class="tcws-det-loading" style="color:var(--t-crit)">Could not load conversation.<br><small style="opacity:.6">${escHtml(String(err?.message || err))}</small></div>`;
    });
  }


  // ─── Panel ────────────────────────────────────────────────────────────────────
  let activeTab = 'alerts';
  let activeSettingsTab = 'overview';

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'tcws-panel';
    document.body.appendChild(panel);
    applyTheme(loadTheme(), panel);

    const inner = document.createElement('div');
    inner.className = 'tcws-panel-inner';
    panel.appendChild(inner);

    // ── Header ──────────────────────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.className = 'tcws-hdr';

    const hdrL = document.createElement('div'); hdrL.className = 'tcws-hdr-left';
    const icon = document.createElement('div'); icon.className = 'tcws-hdr-icon';
    icon.innerHTML = `<svg viewBox="0 0 18 18" fill="none">
      <path d="M9 2.5A6.5 6.5 0 0 1 15.5 9M15.5 9A6.5 6.5 0 1 1 9 2.5"
        stroke="var(--t-accent)" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <circle cx="9" cy="9" r="2.2" fill="var(--t-accent)"/>
    </svg>`;
    const titleStack = document.createElement('div'); titleStack.className = 'tcws-title-stack';
    titleStack.innerHTML = `<div class="tcws-hdr-title">Notification Manager</div>
                            <div class="tcws-hdr-sub">TCWS · Zendesk · v1.2.6</div>`;
    hdrL.appendChild(icon); hdrL.appendChild(titleStack);

    const hdrR = document.createElement('div'); hdrR.className = 'tcws-hdr-right';

    const cdWrap = document.createElement('div');
    cdWrap.className = 'tcws-cd-wrap'; cdWrap.id = 'tcws-cd-ring'; cdWrap.style.opacity = '0';
    cdWrap.innerHTML = `<svg class="tcws-cd-svg" width="36" height="36" viewBox="0 0 36 36">
        <circle class="tcws-ring-track" cx="18" cy="18" r="${RING_R}"/>
        <circle class="tcws-ring-prog"  cx="18" cy="18" r="${RING_R}"
          style="stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:0"/>
      </svg>
      <div class="tcws-cd-label" id="tcws-cd-label"></div>`;

    const arChip = document.createElement('span');
    arChip.className = 'tcws-ar-chip'; arChip.setAttribute('data-tcws-ar-status', '1');

    hdrR.appendChild(cdWrap); hdrR.appendChild(arChip);
    hdr.appendChild(hdrL); hdr.appendChild(hdrR);
    inner.appendChild(hdr);

    // ── Call banner ──────────────────────────────────────────────────────────────
    const callBanner = document.createElement('div');
    callBanner.id = 'tcws-call-banner';
    callBanner.className = 'tcws-call-banner';
    inner.appendChild(callBanner);

    // ── Role picker strip ────────────────────────────────────────────────────────
    const roleStrip = document.createElement('div');
    roleStrip.className = 'tcws-role-strip';
    const roleLbl = document.createElement('span'); roleLbl.className = 'tcws-role-strip-lbl'; roleLbl.textContent = 'Role:';
    const roleSelect = document.createElement('select');
    roleSelect.id = 'tcws-role-picker'; roleSelect.className = 'tcws-role-select';
    roleSelect.innerHTML = '<option value="">Loading…</option>';
    roleSelect.addEventListener('change', () => {
      const opt = roleSelect.options[roleSelect.selectedIndex];
      const grpId = Number(roleSelect.value) || null;
      const grpName = opt ? opt.textContent.trim() : '';
      saveActiveRole(grpId ? grpName : '');
      saveActiveRoleId(grpId);
      renderTeamSidebar(); // refresh team sidebar when group changes
    });
    const userChip = document.createElement('span');
    userChip.id = 'tcws-user-chip'; userChip.className = 'tcws-user-chip';
    userChip.textContent = currentUser ? currentUser.name : '';
    roleStrip.appendChild(roleLbl); roleStrip.appendChild(roleSelect); roleStrip.appendChild(userChip);
    inner.appendChild(roleStrip);

    // ── Tabs ────────────────────────────────────────────────────────────────────
    const tabs = document.createElement('div'); tabs.className = 'tcws-tabs';
    const TABS = [
      { key: 'alerts',    label: 'Alerts',    badge: 'alert'    },
      { key: 'calls',     label: 'Calls',     badge: 'calls'    },
      { key: 'sites',     label: 'Sites',     badge: false       },
      { key: 'resolved',  label: 'Resolved',  badge: 'resolved' },
      { key: 'assigned',  label: 'Assigned',  badge: 'assigned' },
      { key: 'settings',  label: 'Settings',  badge: false       },
    ];
    const tabEls = {};
    for (const def of TABS) {
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'tcws-tab';
      const lbl = document.createElement('span'); lbl.textContent = def.label;
      t.appendChild(lbl);
      if (def.badge === 'alert') {
        const n = document.createElement('span');
        n.className = 'tcws-tab-n'; n.setAttribute('data-tcws-alertbadge', '1');
        t.appendChild(n);
      } else if (def.badge === 'resolved') {
        const n = document.createElement('span');
        n.className = 'tcws-tab-n'; n.setAttribute('data-tcws-resolvedbadge', '1');
        t.appendChild(n);
      } else if (def.badge === 'assigned') {
        const n = document.createElement('span');
        n.className = 'tcws-tab-n'; n.setAttribute('data-tcws-assignedbadge', '1');
        t.appendChild(n);
      } else if (def.badge === 'calls') {
        const n = document.createElement('span');
        n.className = 'tcws-tab-n'; n.setAttribute('data-tcws-callsbadge', '1');
        t.appendChild(n);
      }
      t.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); showTab(def.key); });
      tabs.appendChild(t); tabEls[def.key] = t;
    }
    inner.appendChild(tabs);

    // Apply feature-gated tab visibility
    function _applyTabVisibility() {
      if (tabEls['calls'])    tabEls['calls'].style.display    = featEnabled('calls')    ? '' : 'none';
      if (tabEls['sites'])    tabEls['sites'].style.display    = featEnabled('sites')    ? '' : 'none';
      if (tabEls['resolved']) tabEls['resolved'].style.display = featEnabled('resolved') ? '' : 'none';
      if (tabEls['assigned']) tabEls['assigned'].style.display = featEnabled('assigned') ? '' : 'none';
    }
    _applyTabVisibility();

    // ── Body ────────────────────────────────────────────────────────────────────
    const body = document.createElement('div'); body.className = 'tcws-body';
    inner.appendChild(body);

    // ── Footer ──────────────────────────────────────────────────────────────────
    const footer = document.createElement('div'); footer.className = 'tcws-footer';
    footer.innerHTML = `<span class="tcws-footer-kbs"><kbd>Esc</kbd> close</span>
                        <span class="tcws-footer-ver">v1.3.7 · TCWS NM</span>`;
    inner.appendChild(footer);

    function showTab(t) {
      if (t === 'calls'    && !featEnabled('calls'))    t = 'alerts';
      if (t === 'sites'    && !featEnabled('sites'))    t = 'alerts';
      if (t === 'resolved' && !featEnabled('resolved')) t = 'alerts';
      if (t === 'assigned' && !featEnabled('assigned')) t = 'alerts';
      activeTab = t;
      for (const [k, el] of Object.entries(tabEls)) el.dataset.on = k === t ? '1' : '0';
      render();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────
    function mkSec(label) {
      const d = document.createElement('div'); d.className = 'tcws-sec';
      const sp = document.createElement('span'); sp.textContent = label;
      d.appendChild(sp); return d;
    }
    function mkBtn(label, cls) {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; return b;
    }
    function mkTglCard(label, desc, checked, onChange) {
      const c = document.createElement('div'); c.className = 'tcws-set-card';
      const l = document.createElement('div'); l.className = 'tcws-set-card-left';
      l.innerHTML = `<div class="tcws-set-card-lbl">${escHtml(label)}</div><div class="tcws-set-card-desc">${escHtml(desc)}</div>`;
      const tgl = document.createElement('label'); tgl.className = 'tcws-tgl';
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = checked;
      const track = document.createElement('span'); track.className = 'tcws-tgl-track';
      const thumb = document.createElement('span'); thumb.className = 'tcws-tgl-thumb';
      tgl.appendChild(inp); tgl.appendChild(track); tgl.appendChild(thumb);
      inp.addEventListener('change', () => onChange(inp.checked));
      c.appendChild(l); c.appendChild(tgl); return c;
    }
    function mkVRow(label, opts, current, onChange, isWarn) {
      const row = document.createElement('div'); row.className = 'tcws-vcard-row';
      const lbl = document.createElement('div'); lbl.className = 'tcws-vcard-lbl'; lbl.textContent = label;
      row.appendChild(lbl);
      const grp = document.createElement('div'); grp.className = 'tcws-tog-grp';
      for (const opt of opts) {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tcws-tog'; btn.textContent = opt;
        btn.dataset.on = opt.toLowerCase() === current.toLowerCase() ? '1' : '0';
        if (isWarn?.(opt)) btn.dataset.warn = '1';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          grp.querySelectorAll('.tcws-tog').forEach(b => b.dataset.on = '0'); btn.dataset.on = '1'; onChange(opt);
        });
        grp.appendChild(btn);
      }
      row.appendChild(grp); return row;
    }

    // ══ ALERTS ═══════════════════════════════════════════════════════════════════
    function _latestAlertNote(a, tid) {
      const rec = a?.tmeta?.[String(tid)];
      const ups = Array.isArray(rec?.updates) ? rec.updates : [];
      if (!ups.length) return null;
      const last = ups[ups.length - 1];
      if (!last) return null;
      const txt = String(last.text || '').trim();
      if (!txt) return null;
      return { kind: String(last.kind || 'update'), txt };
    }

    function renderAlerts() {
      body.innerHTML = '';
      const unread = loadUnread();
      const keys   = Object.keys(unread).sort((a, b) => (unread[b].at || 0) - (unread[a].at || 0));

      const sec = mkSec(`${keys.length} Active Alert${keys.length !== 1 ? 's' : ''}`);
      if (keys.length) {
        const ca = mkBtn('Clear All', 'tcws-sec-action');
        ca.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); clearAllAlerts(); });
        sec.appendChild(ca);
      }
      body.appendChild(sec);

      if (!keys.length) {
        body.insertAdjacentHTML('beforeend', `<div class="tcws-empty"><span class="tcws-empty-icon">✓</span>All clear — no active alerts.</div>`);
        // NOTE: no return here — Queue Monitor pins must always render below
      }

      for (const k of keys) {
        const a    = unread[k];
        const card = document.createElement('div');
        card.className = 'tcws-acard'; card.dataset.level = a.level || 'normal';

        const lvlTag = document.createElement('div'); lvlTag.className = 'tcws-level-tag';
        lvlTag.innerHTML = `<i></i>${(a.level || 'normal').toUpperCase()}${a.isWatch ? ' · WATCHED' : ''}`;

        const titleD = document.createElement('div'); titleD.className = 'tcws-acard-title'; titleD.textContent = a.title || k;

        const parts = [];
        if (a.delta > 0) parts.push(`+${a.delta} ticket${a.delta !== 1 ? 's' : ''}`);
        if (a.changeDesc) parts.push(a.changeDesc);
        if (a.at) parts.push(`${hhMM(a.at)} (${timeAgo(a.at)})`);
        const metaD = document.createElement('div'); metaD.className = 'tcws-acard-meta'; metaD.textContent = parts.join(' · ');

        const info = document.createElement('div'); info.className = 'tcws-acard-info';
        info.appendChild(lvlTag); info.appendChild(titleD); info.appendChild(metaD);

        // Buttons (right column)
        const btns = document.createElement('div'); btns.className = 'tcws-acard-btns';

        if (!a.isWatch) {
          const goBtn = document.createElement('a');
          goBtn.href = `/agent/filters/${encodeURIComponent(k)}`;
          goBtn.className = 'tcws-btn xs accent'; goBtn.textContent = '↗ Go';
          goBtn.title = 'Open view and dismiss this alert';
          goBtn.addEventListener('click', () => {
            // Record response time before dismiss
            recordResponseTime(a.at);
            clearAlert(k);
          });
          btns.appendChild(goBtn);
        }

        const dis = mkBtn('✕', 'tcws-btn xs danger');
        dis.title = 'Dismiss alert';
        dis.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          recordResponseTime(a.at);
          clearAlert(k);
        });
        btns.appendChild(dis);

        const top = document.createElement('div'); top.className = 'tcws-acard-top';
        top.appendChild(info); top.appendChild(btns);
        card.appendChild(top);

        // Snooze row
        if (!a.isWatch) {
          const snRow = document.createElement('div'); snRow.className = 'tcws-snooze-row';
          const snLbl = document.createElement('span'); snLbl.className = 'tcws-snooze-lbl'; snLbl.textContent = 'Snooze:';
          snRow.appendChild(snLbl);
          for (const sd of [{ l: '15m', ms: 15 * 60000 }, { l: '1h', ms: 60 * 60000 }, { l: '4h', ms: 4 * 60 * 60000 }]) {
            const sb = mkBtn(sd.l, 'tcws-btn snooze-xs');
            sb.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); snoozeAlert(k, sd.ms); });
            snRow.appendChild(sb);
          }
          card.appendChild(snRow);
        }

        // Ticket pills → click to open detail panel
        const tickets = Array.isArray(a.tickets) ? a.tickets : [];
        const newTidSet = new Set(Array.isArray(a.newTids) ? a.newTids.map(String) : []);
        if (tickets.length) {
          const pills = document.createElement('div'); pills.className = 'tcws-pills';
          for (const tid of tickets.slice(0, 20)) {
            const pill = document.createElement('span');
            pill.className = 'tcws-pill';
            if (newTidSet.has(String(tid))) pill.classList.add('is-new');
            pill.dataset.tid = tid;
            const note = _latestAlertNote(a, tid);
            const noteHtml = note
              ? ` <span class="tcws-pill-note ${escHtml(note.kind)}">· ${escHtml(note.txt.slice(0, 60))}</span>`
              : '';
            pill.innerHTML = `<span>#${escHtml(tid)}</span>${noteHtml}`;
            if (String(tid) === _openDetailTid) pill.classList.add('detail-open');
            pill.addEventListener('click', e => {
              e.preventDefault(); e.stopPropagation();
              if (_openDetailTid === String(tid)) {
                closeDetailPanel();
                pill.classList.remove('detail-open');
              } else {
                // Close others, open this one
                panelEl?.querySelectorAll('.tcws-pill.detail-open').forEach(p => p.classList.remove('detail-open'));
                pill.classList.add('detail-open');
                openDetailPanel(tid, a);
              }
            });
            pills.appendChild(pill);
          }
          card.appendChild(pills);
        }
        // Clear newTids after rendering so highlight only shows once
        if (newTidSet.size) {
          const unreadNow = loadUnread();
          if (unreadNow[k]) { unreadNow[k].newTids = []; saveUnread(unreadNow); }
        }

        // NOTE: Take It moved to pop-out detail panel only (avoids dual-role mis-assignment).
        // Click any ticket pill to open the detail panel and Take It from there.

        body.appendChild(card);
      }

      // ── Queue Monitor section ────────────────────────────────────────────────
      const qmon = loadQueueMonitor();
      if (featEnabled('queueMonitor') && qmon.length) {
        const qCache = loadQueueCache();
        const qSec = mkSec('Queue Monitor');
        const qRefBtn = mkBtn('↺ Refresh', 'tcws-sec-action');
        qRefBtn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          qRefBtn.textContent = '…';
          pollQueueMonitor().then(() => render());
        });
        qSec.appendChild(qRefBtn);
        body.appendChild(qSec);

        for (const q of qmon) {
          const cached = qCache[q.viewId];
          const qCard = document.createElement('div');
          qCard.className = 'tcws-qmon-card';

          const qHdr = document.createElement('div');
          qHdr.className = 'tcws-qmon-hdr';
          const qTitle = document.createElement('span');
          qTitle.className = 'tcws-qmon-title';
          qTitle.textContent = q.label || `Queue ${q.viewId}`;
          const qMeta = document.createElement('span');
          qMeta.className = 'tcws-qmon-meta';
          if (cached) {
            const count = (cached.ids || []).length;
            qMeta.textContent = `${count} ticket${count !== 1 ? 's' : ''} · ${timeAgo(cached.at)}`;
          } else {
            qMeta.textContent = 'Not fetched yet';
          }
          qHdr.appendChild(qTitle);
          qHdr.appendChild(qMeta);

          const goA = document.createElement('a');
          goA.href = `/agent/filters/${encodeURIComponent(q.viewId)}`;
          goA.className = 'tcws-btn xs accent'; goA.textContent = '↗';
          goA.title = `Open ${q.label || q.viewId} in Zendesk`;
          goA.target = '_blank';
          qHdr.appendChild(goA);

          qCard.appendChild(qHdr);

          if (cached && Array.isArray(cached.ids) && cached.ids.length) {
            const qPills = document.createElement('div');
            qPills.className = 'tcws-pills';
            for (const tid of cached.ids.slice(0, 20)) {
              const pill = document.createElement('span');
              pill.className = 'tcws-pill';
              pill.dataset.tid = tid;
              pill.innerHTML = `<span>#${escHtml(tid)}</span>`;
              if (String(tid) === _openDetailTid) pill.classList.add('detail-open');
              pill.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                if (_openDetailTid === String(tid)) {
                  closeDetailPanel();
                  pill.classList.remove('detail-open');
                } else {
                  panelEl?.querySelectorAll('.tcws-pill.detail-open').forEach(p => p.classList.remove('detail-open'));
                  pill.classList.add('detail-open');
                  openDetailPanel(tid, null);
                }
              });
              qPills.appendChild(pill);
            }
            if (cached.ids.length > 20) {
              const more = document.createElement('span');
              more.className = 'tcws-pill'; more.style.opacity = '0.55';
              more.textContent = `+${cached.ids.length - 20} more`;
              qPills.appendChild(more);
            }
            qCard.appendChild(qPills);
          } else if (cached) {
            qCard.insertAdjacentHTML('beforeend', `<div style="padding:6px 0;font-size:11px;opacity:.5">Queue is empty</div>`);
          }

          body.appendChild(qCard);
        }
      }
    } // end renderAlerts

    // ══ SITES ════════════════════════════════════════════════════════════════════
    function renderSites() {
      body.innerHTML = '';

      const sec = mkSec(
        siteViewCache.order.length
          ? `Sites (${siteViewCache.order.length})`
          : 'Sites'
      );
      const refBtn = mkBtn('↺ Refresh', 'tcws-sec-action');
      refBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        refBtn.textContent = '…';
        pollSiteView().then(() => render());
      });
      sec.appendChild(refBtn);
      body.appendChild(sec);

      if (siteViewCache.updatedAt) {
        const upd = document.createElement('div');
        upd.style.cssText = 'font-size:10px;color:var(--t-text3);padding:2px 14px 8px;text-align:right';
        upd.textContent = `Updated ${timeAgo(siteViewCache.updatedAt)}`;
        body.appendChild(upd);
      }

      if (!siteViewCache.order.length) {
        body.insertAdjacentHTML('beforeend',
          siteViewPolling
            ? `<div class="tcws-resolved-empty">Loading site data…</div>`
            : `<div class="tcws-resolved-empty">No open tickets found.<br><span style="font-size:10px;opacity:.7">Hit Refresh to pull data, or enable Site View in Settings → Features.</span></div>`
        );
        return;
      }

      for (const siteKey of siteViewCache.order) {
        const site = siteViewCache.sites[siteKey];
        if (!site) continue;

        const card = document.createElement('div');
        card.className = 'tcws-site-card';
        if (site.washDown)      card.classList.add('wash-down');
        else if (site.critical) card.classList.add('critical');
        else if (site.hasUnnamed) card.classList.add('unnamed-warn');

        // ── Header row ────────────────────────────────────────────────────────
        const hdr = document.createElement('div');
        hdr.className = 'tcws-site-hdr';

        const nameEl = document.createElement('div');
        nameEl.className = 'tcws-site-name';
        nameEl.textContent = site.name;

        const badgeRow = document.createElement('div');
        badgeRow.className = 'tcws-site-badges';

        const countB = document.createElement('span');
        countB.className = 'tcws-site-badge count';
        countB.textContent = `${site.tickets.length} ticket${site.tickets.length !== 1 ? 's' : ''}`;
        badgeRow.appendChild(countB);

        if (site.washDown) {
          const wdB = document.createElement('span');
          wdB.className = 'tcws-site-badge washdown';
          wdB.textContent = site.timeDown ? `Wash Down · ${site.timeDown}` : 'Wash Down';
          badgeRow.appendChild(wdB);
        } else if (site.critical) {
          const crB = document.createElement('span');
          crB.className = 'tcws-site-badge critical';
          crB.textContent = 'CRITICAL';
          badgeRow.appendChild(crB);
        } else if (site.hasUnnamed) {
          const warnB = document.createElement('span');
          warnB.className = 'tcws-site-badge unnamed';
          warnB.textContent = '⚠ Missing Wash Name';
          badgeRow.appendChild(warnB);
        }

        hdr.appendChild(nameEl);
        hdr.appendChild(badgeRow);
        card.appendChild(hdr);

        // ── Accountability note for unknown-site cards ─────────────────────────
        if (site.hasUnnamed) {
          const note = document.createElement('div');
          note.className = 'tcws-site-unnamed-note';
          note.textContent = 'These TCWS tickets are missing the Wash Name field — follow up with the submitter.';
          card.appendChild(note);
        }

        // ── Ticket pills ──────────────────────────────────────────────────────
        const pills = document.createElement('div');
        pills.className = 'tcws-pills';
        pills.style.marginTop = '7px';

        for (const t of site.tickets.slice(0, 20)) {
          const pill = document.createElement('span');
          pill.className = 'tcws-pill';
          if (t.washDown) pill.classList.add('is-new');
          pill.dataset.tid = t.id;
          pill.title = t.subject;
          const stNote = t.status !== 'open'
            ? ` <span class="tcws-pill-note status">${escHtml(t.status)}</span>` : '';
          // For unknown-site tickets, show who submitted it right on the pill
          const reqNote = (site.hasUnnamed && t.requesterName)
            ? ` <span class="tcws-pill-note unnamed">${escHtml(t.requesterName)}</span>` : '';
          pill.innerHTML = `<span>#${escHtml(String(t.id))}</span>${stNote}${reqNote}`;
          if (String(t.id) === _openDetailTid) pill.classList.add('detail-open');
          pill.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (_openDetailTid === String(t.id)) {
              closeDetailPanel();
              pill.classList.remove('detail-open');
            } else {
              panelEl?.querySelectorAll('.tcws-pill.detail-open').forEach(p => p.classList.remove('detail-open'));
              pill.classList.add('detail-open');
              openDetailPanel(t.id, null);
            }
          });
          pills.appendChild(pill);
        }
        card.appendChild(pills);
        body.appendChild(card);
      }
    } // end renderSites

    // ══ RESOLVED ═════════════════════════════════════════════════════════════════
    function renderResolved() {
      body.innerHTML = '';

      const resolved = loadResolved()
        .filter(e => Date.now() - e.resolvedAt < RESOLVED_TTL)
        .sort((a, b) => b.resolvedAt - a.resolvedAt);

      const sec = mkSec(`${resolved.length} Resolved (7 days)`);
      if (resolved.length) {
        const secActions = document.createElement('div'); secActions.className = 'tcws-sec-actions';
        const clearR = mkBtn('Clear', 'tcws-sec-action danger');
        clearR.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveResolved([]); renderResolved(); });
        secActions.appendChild(clearR);
        sec.appendChild(secActions);
      }
      body.appendChild(sec);

      if (!resolved.length) {
        body.insertAdjacentHTML('beforeend', `<div class="tcws-resolved-empty">No resolved tickets yet.<br>Solved and merged tickets will appear here.</div>`);
        return;
      }

      for (const entry of resolved) {
        const isMerge = !!(entry.mergedInto || entry.status === 'merged');
        const card = document.createElement('div');
        card.className = 'tcws-rcard'; card.dataset.merged = isMerge ? '1' : '0';

        const idLinkEl = _mkTicketLink(entry.id, '');
        idLinkEl.textContent = `#${entry.id}`;
        let idHtml = idLinkEl.outerHTML;
        const statusBadge = isMerge
          ? `<span class="tcws-badge-pill" data-s="merged">merged</span>`
          : `<span class="tcws-badge-pill" data-s="solved">${escHtml(entry.status)}</span>`;

        const meta = [];
        if (entry.solvedBy) meta.push(escHtml(entry.solvedBy));
        if (entry.viewTitle) meta.push(escHtml(entry.viewTitle));
        if (entry.resolvedAt) meta.push(timeAgo(entry.resolvedAt));

        card.innerHTML = `
          <div class="tcws-rcard-top">
            <div class="tcws-rcard-info">
              <div class="tcws-rcard-id">${idHtml} ${statusBadge}</div>
              <div class="tcws-rcard-subject">${escHtml(entry.subject || '(no subject)')}</div>
              <div class="tcws-rcard-meta">${meta.join(' · ')}</div>
              ${isMerge && entry.mergedInto ? `
                <div class="tcws-rcard-merge" data-mergeto="${escHtml(String(entry.mergedInto))}">
                  Merged into: <span class="tcws-rcard-merge-link" data-tid="${escHtml(String(entry.mergedInto))}">#${escHtml(String(entry.mergedInto))}</span>
                </div>` : ''}
            </div>
          </div>
        `;
        // Delegate clicks on ticket links inside rcard to SPA nav
        card.addEventListener('click', e => {
          const a = e.target.closest('a[href*="/agent/tickets/"]');
          if (a) { e.preventDefault(); _zdNav(a.getAttribute('href')); }
          const mt = e.target.closest('[data-tid]');
          if (mt) { e.preventDefault(); _zdNav(`/agent/tickets/${encodeURIComponent(mt.dataset.tid)}`); }
        });
        body.appendChild(card);
      }
    }

    // ══ AUTO-REFRESH ══════════════════════════════════════════════════════════════
    function renderAssigned() {
      body.innerHTML = '';

      const assigned = loadAssigned()
        .filter(e => Date.now() - e.at < ASSIGNED_TTL)
        .sort((a, b) => b.at - a.at);

      const sec = mkSec(`${assigned.length} Assigned (24h)`);
      if (assigned.length) {
        const clearBtn = mkBtn('Clear', 'tcws-sec-action danger');
        clearBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveAssigned([]); renderAssigned(); });
        sec.appendChild(clearBtn);
      }
      body.appendChild(sec);

      if (!assigned.length) {
        body.insertAdjacentHTML('beforeend', `<div class="tcws-resolved-empty">No assignments in the last 24 hours.<br>Tickets picked up or re-assigned will appear here.</div>`);
        return;
      }

      for (const entry of assigned) {
        const card = document.createElement('div'); card.className = 'tcws-ascard';
        const info = document.createElement('div'); info.className = 'tcws-ascard-info';
        const idRow = document.createElement('div'); idRow.className = 'tcws-ascard-id';
        idRow.appendChild(_mkTicketLink(entry.id, "tcws-ticket-link"));
        const subj = document.createElement('div'); subj.className = 'tcws-ascard-subject'; subj.textContent = entry.subject || '(no subject)';
        const meta = document.createElement('div'); meta.className = 'tcws-ascard-meta';
        const parts = [];
        if (entry.viewTitle) parts.push(escHtml(entry.viewTitle));
        parts.push(timeAgo(entry.at));
        meta.innerHTML = parts.join(' · ');
        const asgRow = document.createElement('div'); asgRow.className = 'tcws-ascard-assignee';
        asgRow.innerHTML = `<span>→</span><span>${escHtml(entry.assignee || 'someone')}</span>`;
        info.appendChild(idRow); info.appendChild(subj); info.appendChild(meta); info.appendChild(asgRow);
        card.appendChild(info);
        body.appendChild(card);
      }
    }

    function renderCalls() {
      body.innerHTML = '';

      // ── Stale-fetch: if cache is empty or older than 8 s, fire a fresh poll
      //    immediately so opening the tab never shows stale/empty data for long.
      const cacheAge = callsApiLastAt ? Date.now() - callsApiLastAt : Infinity;
      if (cacheAge > 8_000) {
        pollLiveCalls(); // fires async; _syncCallsBadge + renderCalls re-invoked on completion
      }

      // ── Header row ────────────────────────────────────────────────────────────
      const sec = mkSec(`Live Calls (${liveCallsCache.length})`);
      const refreshBtn = mkBtn('Refresh Now', 'tcws-sec-action');
      refreshBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        refreshBtn.textContent = 'Refreshing…';
        refreshBtn.disabled = true;
        pollLiveCalls().finally(() => {
          refreshBtn.textContent = 'Refresh Now';
          refreshBtn.disabled = false;
          renderCalls();
        });
      });
      sec.appendChild(refreshBtn);

      // Open Live Console link
      const consoleLnk = document.createElement('a');
      consoleLnk.href = '/agent/talk/live_calls';
      consoleLnk.target = '_blank';
      consoleLnk.className = 'tcws-btn tcws-sec-action';
      consoleLnk.style.cssText = 'text-decoration:none;margin-left:4px';
      consoleLnk.textContent = 'Console ↗';
      sec.appendChild(consoleLnk);

      body.appendChild(sec);

      // ── Last-updated line ──────────────────────────────────────────────────────
      const upd = document.createElement('div');
      upd.className = 'tcws-calls-updated';
      upd.textContent = callsApiLastAt ? `Updated ${timeAgo(callsApiLastAt)} · polls every 10s` : 'Polling…';
      body.appendChild(upd);

      // ── Empty state ───────────────────────────────────────────────────────────
      if (!liveCallsCache.length) {
        body.insertAdjacentHTML('beforeend',
          `<div class="tcws-resolved-empty">No live calls right now.<br><span style="font-size:10px;opacity:.7">API polls every 10 seconds.</span></div>`);
        return;
      }

      // ── Call cards ────────────────────────────────────────────────────────────
      const durEls = []; // [{el, startMs}] — for live ticker
      for (const call of liveCallsCache) {
        const card = document.createElement('div');
        card.className = 'tcws-callcard';

        const startMs  = call.started_at ? new Date(call.started_at).getTime() : 0;
        const durStr   = startMs ? fmtDuration(Date.now() - startMs) : '--';
        const dirLabel = (call.direction || '').toLowerCase() === 'outbound' ? 'OUTBOUND' : 'INBOUND';
        const dirClass = dirLabel === 'OUTBOUND' ? 'outbound' : 'inbound';

        // Row 1: badge + caller (phone or name)
        const row1 = document.createElement('div');
        row1.className = 'tcws-callcard-row';
        const callerDisplay = call.caller
          ? call.caller
          : (dirLabel === 'OUTBOUND' ? 'Outbound Call' : 'Unknown Caller');
        row1.innerHTML = `<span class="tcws-callcard-badge ${dirClass}">${dirLabel}</span><span class="tcws-callcard-caller">${escHtml(callerDisplay)}</span>`;

        // Row 2: agent · group
        const row2 = document.createElement('div');
        row2.className = 'tcws-callcard-meta';
        const parts2 = [];
        if (call.agent) parts2.push(`<span class="tcws-callcard-agent">${escHtml(call.agent)}</span>`);
        if (call.group) parts2.push(`<span class="tcws-callcard-group">${escHtml(call.group)}</span>`);
        if (parts2.length) row2.innerHTML = parts2.join('<span class="tcws-callcard-sep">·</span>');

        // Row 3: ticket link + duration
        const row3 = document.createElement('div');
        row3.className = 'tcws-callcard-foot';
        if (call.ticket_id) {
          const a = _mkTicketLink(call.ticket_id, 'tcws-callcard-ticket');
          row3.appendChild(a);
        } else {
          const nt = document.createElement('span');
          nt.className = 'tcws-callcard-ticket-none'; nt.textContent = 'No ticket yet';
          row3.appendChild(nt);
        }
        const durEl = document.createElement('span');
        durEl.className = 'tcws-callcard-dur'; durEl.textContent = durStr;
        row3.appendChild(durEl);
        if (startMs) durEls.push({ el: durEl, startMs });

        card.appendChild(row1);
        if (parts2.length) card.appendChild(row2);
        card.appendChild(row3);
        body.appendChild(card);
      }

      // ── Live duration ticker — updates every second while Calls tab is visible
      if (durEls.length) {
        let _durTick = setInterval(() => {
          // Stop ticking if this render's cards are no longer in the DOM
          if (!durEls[0].el.isConnected) { clearInterval(_durTick); return; }
          for (const { el, startMs } of durEls) {
            el.textContent = fmtDuration(Date.now() - startMs);
          }
        }, 1000);
      }
    }

    // Small inline toast for call action feedback
    function _callToast(msg, isErr) {
      let toast = document.getElementById('tcws-calltoast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'tcws-calltoast';
        toast.className = 'tcws-calls-toast';
        body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.className = 'tcws-calls-toast' + (isErr ? ' err' : '');
      toast.style.display = 'block';
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    function renderAR() {
      body.innerHTML = '';
      const curMs  = loadMs();
      const curSec = Math.round(curMs / 1000);
      const en     = loadEn();

      body.appendChild(mkSec('Refresh Interval'));

      const valWrap = document.createElement('div'); valWrap.className = 'tcws-slider-val';
      valWrap.innerHTML = `<span class="tcws-slider-num" id="tcws-ar-num">${curSec}</span><span class="tcws-slider-unit">seconds</span>`;
      body.appendChild(valWrap);

      const slider = document.createElement('input');
      slider.type = 'range'; slider.className = 'tcws-slider';
      slider.min = '5'; slider.max = '60'; slider.step = '1'; slider.value = String(curSec);
      const pct0 = ((curSec - 5) / 55) * 100;
      slider.style.setProperty('--pct', `${pct0.toFixed(1)}%`);

      const ticks = document.createElement('div'); ticks.className = 'tcws-slider-ticks';
      ticks.innerHTML = ['5s','15s','30s','45s','60s'].map(t => `<span>${t}</span>`).join('');

      const presetRow = document.createElement('div'); presetRow.className = 'tcws-presets';
      const PRESETS = [
        { l: '5s', ms: 5000 }, { l: '10s', ms: 10000 }, { l: '15s', ms: 15000 },
        { l: '20s', ms: 20000 }, { l: '30s', ms: 30000 }, { l: '60s', ms: 60000 },
      ];
      const presetBtns = [];
      for (const p of PRESETS) {
        const btn = mkBtn(p.l, 'tcws-preset'); btn.dataset.on = p.ms === curMs ? '1' : '0';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          slider.value = String(p.ms / 1000); syncSlider();
          saveMs(p.ms); if (en) startAR(p.ms);
        });
        presetRow.appendChild(btn); presetBtns.push({ btn, ms: p.ms });
      }

      function syncSlider() {
        const sec = Number(slider.value);
        const pct = ((sec - 5) / 55) * 100;
        slider.style.setProperty('--pct', `${pct.toFixed(1)}%`);
        const numEl = document.getElementById('tcws-ar-num');
        if (numEl) numEl.textContent = sec;
        presetBtns.forEach(({ btn, ms }) => { btn.dataset.on = ms === sec * 1000 ? '1' : '0'; });
      }

      slider.addEventListener('input', syncSlider);
      slider.addEventListener('change', () => { const ms = Number(slider.value) * 1000; saveMs(ms); if (en) startAR(ms); });

      body.appendChild(slider); body.appendChild(ticks);
      body.appendChild(mkSec('Quick Presets'));
      body.appendChild(presetRow);

      const ahBtn = document.createElement('button');
      ahBtn.type = 'button'; ahBtn.className = 'tcws-after-hours';
      ahBtn.dataset.on = (en && curMs <= 10000 && loadDNotif()) ? '1' : '0';
      ahBtn.textContent = 'After-Hours Mode — 10s interval + desktop alerts';
      ahBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (!loadDNotif()) {
          if (Notification.permission === 'granted') saveDNotif(true);
          else if (Notification.permission !== 'denied') {
            const p = await Notification.requestPermission();
            if (p === 'granted') saveDNotif(true);
          }
        }
        saveMs(10000); startAR(10000);
        slider.value = '10'; syncSlider();
        ahBtn.dataset.on = '1';
      });
      body.appendChild(ahBtn);

      const startBtn = document.createElement('button');
      startBtn.type = 'button'; startBtn.className = 'tcws-full-btn start';
      startBtn.textContent = en ? `↺ Restart at ${fmtMs(curMs)}` : '▶ Start Auto-Refresh';
      startBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); startAR(Number(slider.value) * 1000); renderAR(); });
      body.appendChild(startBtn);

      if (en) {
        const stopBtn = document.createElement('button');
        stopBtn.type = 'button'; stopBtn.className = 'tcws-full-btn stop';
        stopBtn.textContent = '■ Stop Auto-Refresh';
        stopBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); stopAR(); renderAR(); });
        body.appendChild(stopBtn);
      }
    }

    // ══ WATCHLIST ═════════════════════════════════════════════════════════════════
    function renderWatchlist() {
      body.innerHTML = '';
      const list     = loadWatchlist();
      const watchInt = loadWatchInt();
      const states   = loadWatchStates();

      const intRow = document.createElement('div'); intRow.className = 'tcws-int-row';
      const intLbl = document.createElement('span'); intLbl.className = 'tcws-int-lbl'; intLbl.textContent = 'Poll interval:';
      intRow.appendChild(intLbl);
      const INT_OPTS = [{ l: '30s', ms: 30000 }, { l: '1m', ms: 60000 }, { l: '2m', ms: 120000 }, { l: '5m', ms: 300000 }];
      const intBtns = [];
      for (const p of INT_OPTS) {
        const btn = mkBtn(p.l, 'tcws-preset'); btn.dataset.on = watchInt === p.ms ? '1' : '0';
        btn.style.cssText = 'padding:3px 9px;font-size:10px';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          saveWatchInt(p.ms); startWatchPolling(p.ms);
          intBtns.forEach(b => b.dataset.on = '0'); btn.dataset.on = '1';
        });
        intRow.appendChild(btn); intBtns.push(btn);
      }
      body.appendChild(intRow);

      const sec = mkSec(`${list.length} Watched Ticket${list.length !== 1 ? 's' : ''}`);
      const pollNow = mkBtn('Poll Now', 'tcws-sec-action');
      pollNow.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pollWatchlist(); });
      sec.appendChild(pollNow); body.appendChild(sec);

      const addRow = document.createElement('div'); addRow.className = 'tcws-watch-row';
      const inp = document.createElement('input');
      inp.className = 'tcws-watch-inp'; inp.type = 'text';
      inp.placeholder = 'Ticket ID, e.g. 98765'; inp.setAttribute('autocomplete', 'off');
      const addBtn = mkBtn('+ Watch', 'tcws-btn accent'); addBtn.style.padding = '8px 14px';
      addBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const id = inp.value.trim().replace(/\D/g, ''); if (!id) return;
        const cur = loadWatchlist();
        if (!cur.find(i => String(i.id) === id)) { cur.push({ id, addedAt: Date.now() }); saveWatchlist(cur); }
        inp.value = ''; startWatchPolling(loadWatchInt()); renderWatchlist();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
      addRow.appendChild(inp); addRow.appendChild(addBtn); body.appendChild(addRow);

      if (!list.length) {
        body.insertAdjacentHTML('beforeend', `<div class="tcws-empty">No watched tickets.<br>Enter a ticket ID above to monitor it for changes.</div>`);
        return;
      }
      for (const item of list) {
        const tid   = String(item.id);
        const state = states[tid];
        const el    = document.createElement('div'); el.className = 'tcws-watch-item';
        const left  = document.createElement('div');
        const wIdDiv = document.createElement('div');
        wIdDiv.className = 'tcws-watch-item-id';
        wIdDiv.appendChild(_mkTicketLink(tid, 'tcws-ticket-link'));
        left.appendChild(wIdDiv);
        if (state) left.insertAdjacentHTML('beforeend', `<div class="tcws-watch-item-meta">Status: ${escHtml(state.status)}${state.updated_at ? ` · ${state.updated_at.slice(0,10)}` : ''}</div>`);
        const rm = mkBtn('Remove', 'tcws-btn xs danger');
        rm.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveWatchlist(loadWatchlist().filter(i => String(i.id) !== tid)); el.remove(); });
        el.appendChild(left); el.appendChild(rm); body.appendChild(el);
      }
    }

    // ══ DASHBOARD ════════════════════════════════════════════════════════════════
    function renderDash() {
      body.innerHTML = '';
      const unread   = loadUnread();
      const log      = loadLog().filter(e => Date.now() - e.ts < LOG_TTL);
      const rows     = loadViewsCache();  // v1.3.0: API-sourced view list
      const en       = loadEn();
      const alertCnt = Object.keys(unread).length;
      const todayCnt = log.filter(e => Date.now() - e.ts < 86400000).length;
      const hasCrit  = Object.values(unread).some(u => u.level === 'critical');

      const resolved = loadResolved().filter(e => Date.now() - e.resolvedAt < 86400000);
      const mergesT  = resolved.filter(e => e.mergedInto);
      const stats    = loadStats();
      const avgResp  = calcAvgResponse();

      // Scan health
      const healthEl = document.createElement('div'); healthEl.className = 'tcws-scan-health';
      const sdot     = document.createElement('div'); sdot.className = 'tcws-scan-dot'; sdot.dataset.err = lastScanOk ? '0' : '1';
      const stxt     = document.createElement('div'); stxt.className = 'tcws-scan-txt';
      stxt.textContent = lastScanAt
        ? `Last scan: ${timeAgo(lastScanAt)} · ${rows.length} view${rows.length !== 1 ? 's' : ''} · ${en ? `AR ${fmtMs(loadMs())}` : 'AR off'}`
        : 'No scan yet this session';
      healthEl.appendChild(sdot); healthEl.appendChild(stxt); body.appendChild(healthEl);

      // Right now tiles
      body.appendChild(mkSec('Right Now'));
      const grid1 = document.createElement('div'); grid1.className = 'tcws-stat-grid';
      const tile = (val, lbl, sub = '', attr = '') => {
        const t = document.createElement('div'); t.className = 'tcws-stat';
        if (attr) t.setAttribute(attr, '1');
        t.innerHTML = `<div class="tcws-stat-val">${val}</div><div class="tcws-stat-lbl">${lbl}</div>${sub ? `<div class="tcws-stat-sub">${sub}</div>` : ''}`;
        return t;
      };
      grid1.appendChild(tile(String(alertCnt), 'Active Alerts', '', hasCrit ? 'data-alert' : alertCnt > 0 ? 'data-warn' : 'data-ok'));
      grid1.appendChild(tile(String(rows.length), 'Views Monitored', '', rows.length > 0 ? 'data-ok' : ''));
      grid1.appendChild(tile(String(todayCnt), 'Alerts Today', '', todayCnt > 10 ? 'data-warn' : 'data-ok'));
      body.appendChild(grid1);

      // Live Calls info
      if (liveCallsCache.length > 0) {
        body.appendChild(mkSec(`Live Calls (${liveCallsCache.length})`));
        const callGrid = document.createElement('div'); callGrid.className = 'tcws-stat-grid';
        const callGroups  = [...new Set(liveCallsCache.map(c => c.group).filter(Boolean))];
        const callAgents  = [...new Set(liveCallsCache.map(c => c.agent).filter(Boolean))];
        const inbound     = liveCallsCache.filter(c => c.direction === 'inbound').length;
        const outbound    = liveCallsCache.filter(c => c.direction === 'outbound').length;
        callGrid.appendChild(tile(String(liveCallsCache.length), 'On Call Now', `${inbound} in · ${outbound} out`, 'data-ok'));
        callGrid.appendChild(tile(String(callGroups.length), 'Groups Active', callGroups.slice(0,2).join(', ') || '—', ''));
        callGrid.appendChild(tile(String(callAgents.length), 'Agents On Call', callAgents.slice(0,2).join(', ') || '—', ''));
        body.appendChild(callGrid);
        if (callGroups.length > 2 || callAgents.length > 2) {
          const callDetail = document.createElement('div');
          callDetail.style.cssText = 'font-size:11px;color:var(--t-text3);padding:6px 2px;line-height:1.6';
          if (callGroups.length) callDetail.innerHTML += `<span style="font-weight:700;color:var(--t-text2)">Groups:</span> ${escHtml(callGroups.join(', '))}<br>`;
          if (callAgents.length) callDetail.innerHTML += `<span style="font-weight:700;color:var(--t-text2)">Agents:</span> ${escHtml(callAgents.join(', '))}`;
          body.appendChild(callDetail);
        }
      }

      // Stats tiles (session + persisted)
      const secStats = mkSec('Session Stats');
      const resetBtn = mkBtn('Reset', 'tcws-sec-action danger');
      resetBtn.title = 'Clear all persisted stats';
      resetBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); resetStats(); renderDash(); });
      secStats.appendChild(resetBtn);
      body.appendChild(secStats);

      const grid2 = document.createElement('div'); grid2.className = 'tcws-stat-grid';
      const avgRespStr = avgResp !== null ? fmtDuration(avgResp) : '—';
      const statusChangesToday = (stats.statusChanges || []).filter(c => Date.now() - c.at < 86400000).length;
      grid2.appendChild(tile(String(resolved.length), 'Resolved Today', 'solved + merged'));
      grid2.appendChild(tile(String(mergesT.length), 'Merges Today', ''));
      grid2.appendChild(tile(avgRespStr, 'Avg Response', `n=${(stats.responseTimes || []).length}`));
      body.appendChild(grid2);

      // Status changes breakdown (today)
      const scBreakdown = (stats.statusChanges || []).filter(c => Date.now() - c.at < 86400000);
      if (scBreakdown.length) {
        const toMap = {};
        for (const c of scBreakdown) { toMap[c.to] = (toMap[c.to] || 0) + 1; }
        const grid3 = document.createElement('div'); grid3.className = 'tcws-stat-grid';
        for (const [status, cnt] of Object.entries(toMap).slice(0, 3)) {
          grid3.appendChild(tile(String(cnt), `→ ${status}`, 'status changes'));
        }
        body.appendChild(grid3);
      }

      // Activity chart
      body.appendChild(mkSec('Activity — Last 12 Hours'));
      const chartWrap = document.createElement('div'); chartWrap.className = 'tcws-chart-wrap';
      chartWrap.innerHTML = `<div class="tcws-chart-ttl">Alert events per hour</div>` + buildSparkline(log);
      body.appendChild(chartWrap);

      // Top alerting views
      const viewCounts = {};
      for (const e of log) {
        if (!e.viewKey || e.viewKey.startsWith('watch_')) continue;
        if (!viewCounts[e.viewKey]) viewCounts[e.viewKey] = { title: e.title || e.viewKey, count: 0 };
        viewCounts[e.viewKey].count++;
      }
      const topViews = Object.values(viewCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      if (topViews.length) {
        body.appendChild(mkSec('Top Alert Sources (24h)'));
        const tvWrap = document.createElement('div'); tvWrap.className = 'tcws-top-views';
        for (const v of topViews) {
          const row = document.createElement('div'); row.className = 'tcws-top-view-row';
          row.innerHTML = `<span class="tcws-top-view-name">${escHtml(v.title)}</span><span class="tcws-top-view-count">${v.count} event${v.count !== 1 ? 's' : ''}</span>`;
          tvWrap.appendChild(row);
        }
        body.appendChild(tvWrap);
      }

      // Quick actions
      body.appendChild(mkSec('Quick Actions'));
      const qrow = document.createElement('div'); qrow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      const scanNow = mkBtn('↺ Scan Now', 'tcws-btn accent');
      scanNow.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); scan().then(() => renderDash()); });
      const testNotif = mkBtn('Test Alert', 'tcws-btn');
      testNotif.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (Notification.permission !== 'granted') await Notification.requestPermission();
        desktopNotify('TCWS — Test Alert', 'Desktop notifications are working!', 'tcws-test');
        playSound('info');
      });
      const clearLog = mkBtn('Clear Log', 'tcws-btn');
      clearLog.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveLog([]); renderDash(); });
      qrow.appendChild(scanNow); qrow.appendChild(testNotif); qrow.appendChild(clearLog);
      body.appendChild(qrow);
    }

    // ══ SETTINGS ═════════════════════════════════════════════════════════════════

    // ── Settings sub-content renderers ───────────────────────────────────────────

    function renderSettingsOverview(sc) {
      const rows     = loadViewsCache();
      const log      = loadLog().filter(e => Date.now() - e.ts < LOG_TTL);
      const en       = loadEn();
      const unread   = loadUnread();
      const alertCnt = Object.keys(unread).length;
      const todayCnt = log.filter(e => Date.now() - e.ts < 86400000).length;
      const hasCrit  = Object.values(unread).some(u => u.level === 'critical');
      const resolved = loadResolved().filter(e => Date.now() - e.resolvedAt < 86400000);
      const mergesT  = resolved.filter(e => e.mergedInto);
      const stats    = loadStats();
      const avgResp  = calcAvgResponse();

      // ── Hotkey config — top of Overview ─────────────────────────────────────────
      sc.appendChild(mkSec('Open Hotkey'));
      {
        const hk = loadHotkey();

        function hkLabel(h) {
          if (!h || !h.key) return '—';
          if (h.type === 'double') return `Double-tap ${h.key === 'Control' ? 'Ctrl' : h.key}`;
          const parts = [];
          if (h.ctrl)  parts.push('Ctrl');
          if (h.alt)   parts.push('Alt');
          if (h.shift) parts.push('Shift');
          parts.push(h.key.length === 1 ? h.key.toUpperCase() : h.key);
          return parts.join('+');
        }

        const card = document.createElement('div'); card.className = 'tcws-set-card';
        card.style.cssText = 'flex-direction:column;align-items:stretch;gap:10px';

        // Current binding badge row
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
        const lblWrap = document.createElement('div');
        lblWrap.innerHTML = `<div class="tcws-set-card-lbl">Open / close shortcut</div><div class="tcws-set-card-desc">Toggle the panel from anywhere — avoids hold-key and copy/paste conflicts</div>`;
        const curBadge = document.createElement('kbd');
        curBadge.style.cssText = 'font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;border:1px solid var(--t-border2);background:var(--t-bg2);color:var(--t-text1);white-space:nowrap;flex-shrink:0';
        curBadge.textContent = hkLabel(hk);
        topRow.appendChild(lblWrap); topRow.appendChild(curBadge);
        card.appendChild(topRow);

        // Type selector — Double-tap vs Combo
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:flex;gap:6px';
        for (const [val, lbl] of [['double', 'Double-tap modifier'], ['combo', 'Key combo']]) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = lbl;
          const on = hk.type === val;
          btn.style.cssText = `flex:1;padding:5px 0;border-radius:6px;border:1px solid ${on ? 'var(--t-accent-brd)' : 'var(--t-border2)'};background:${on ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)'};color:${on ? 'var(--t-accent-txt)' : 'var(--t-text2)'};cursor:pointer;font-size:11px;font-weight:700;font-family:inherit`;
          btn.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (val === 'double') saveHotkey({ type: 'double', key: 'Control', ctrl: false, alt: false, shift: false });
            else                  saveHotkey({ type: 'combo',  key: 'Z', ctrl: true,  alt: false, shift: true  });
            renderSettings();
          });
          typeRow.appendChild(btn);
        }
        card.appendChild(typeRow);

        if (hk.type === 'double') {
          // Modifier picker
          const pickRow = document.createElement('div');
          pickRow.style.cssText = 'display:flex;gap:6px';
          for (const mod of ['Control', 'Alt', 'Shift']) {
            const btn = document.createElement('button'); btn.type = 'button';
            btn.textContent = mod === 'Control' ? 'Ctrl' : mod;
            const on = hk.key === mod;
            btn.style.cssText = `flex:1;padding:5px 0;border-radius:6px;border:1px solid ${on ? 'var(--t-accent-brd)' : 'var(--t-border2)'};background:${on ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)'};color:${on ? 'var(--t-accent-txt)' : 'var(--t-text2)'};cursor:pointer;font-size:11px;font-weight:700;font-family:inherit`;
            btn.addEventListener('click', e => {
              e.preventDefault(); e.stopPropagation();
              saveHotkey({ type: 'double', key: mod, ctrl: false, alt: false, shift: false });
              renderSettings();
            });
            pickRow.appendChild(btn);
          }
          card.appendChild(pickRow);
        }

        if (hk.type === 'combo') {
          // Press-to-record button
          let recording = false;
          let _onKey, _cancelFn;

          const recBtn = document.createElement('button'); recBtn.type = 'button';
          const idleText = () => `Press to record combo  (current: ${hkLabel(loadHotkey())})`;
          recBtn.textContent = idleText();
          recBtn.style.cssText = 'width:100%;padding:7px 12px;border-radius:6px;border:1px solid var(--t-border2);background:var(--t-btn-bg);color:var(--t-text2);font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;text-align:left';

          function stopRec(rerender) {
            if (!recording) return;
            recording = false;
            document.removeEventListener('keydown', _onKey, true);
            document.removeEventListener('mousedown', _cancelFn, true);
            if (rerender) { renderSettings(); return; }
            recBtn.textContent = idleText();
            recBtn.style.cssText = recBtn.style.cssText.replace(/background:[^;]+/, 'background:var(--t-btn-bg)').replace(/color:[^;]+/, 'color:var(--t-text2)').replace(/border:1px solid [^;]+/, 'border:1px solid var(--t-border2)');
          }

          _onKey = e => {
            e.preventDefault(); e.stopPropagation();
            if (['Control','Alt','Shift','Meta'].includes(e.key)) return;
            if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
              recBtn.textContent = '⚠  Needs at least one modifier (Ctrl / Alt / Shift)';
              recBtn.style.border = '1px solid var(--t-crit)';
              setTimeout(() => stopRec(false), 1500);
              return;
            }
            saveHotkey({ type: 'combo', key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
            stopRec(true);
          };
          _cancelFn = () => stopRec(false);

          recBtn.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (recording) { stopRec(false); return; }
            recording = true;
            recBtn.textContent = '⏺  Listening… press your combo';
            recBtn.style.background  = 'var(--t-accent-dim)';
            recBtn.style.borderColor = 'var(--t-accent-brd)';
            recBtn.style.color       = 'var(--t-accent-txt)';
            document.addEventListener('keydown', _onKey, true);
            setTimeout(() => document.addEventListener('mousedown', _cancelFn, { capture: true, once: true }), 60);
          });

          card.appendChild(recBtn);
          const hint = document.createElement('div');
          hint.style.cssText = 'font-size:9px;color:var(--t-text3);line-height:1.5';
          hint.textContent = 'Tip: include at least one modifier (Ctrl, Alt, Shift) so the combo never conflicts with typing.';
          card.appendChild(hint);
        }

        sc.appendChild(card);
      }

      // Scan health bar
      const healthEl = document.createElement('div'); healthEl.className = 'tcws-scan-health';
      const sdot = document.createElement('div'); sdot.className = 'tcws-scan-dot'; sdot.dataset.err = lastScanOk ? '0' : '1';
      const stxt = document.createElement('div'); stxt.className = 'tcws-scan-txt';
      stxt.textContent = lastScanAt
        ? `Last scan: ${timeAgo(lastScanAt)} · ${rows.length} view${rows.length !== 1 ? 's' : ''} · ${en ? `AR ${fmtMs(loadMs())}` : 'AR off'}`
        : 'No scan yet this session';
      healthEl.appendChild(sdot); healthEl.appendChild(stxt); sc.appendChild(healthEl);

      sc.appendChild(mkSec('Right Now'));
      const grid1 = document.createElement('div'); grid1.className = 'tcws-stat-grid';
      const tile = (val, lbl, sub = '', attr = '') => {
        const t = document.createElement('div'); t.className = 'tcws-stat';
        if (attr) t.setAttribute(attr, '1');
        t.innerHTML = `<div class="tcws-stat-val">${val}</div><div class="tcws-stat-lbl">${lbl}</div>${sub ? `<div class="tcws-stat-sub">${sub}</div>` : ''}`;
        return t;
      };
      grid1.appendChild(tile(String(alertCnt), 'Active Alerts', '', hasCrit ? 'data-alert' : alertCnt > 0 ? 'data-warn' : 'data-ok'));
      grid1.appendChild(tile(String(rows.length), 'Views Monitored', '', rows.length > 0 ? 'data-ok' : ''));
      grid1.appendChild(tile(String(todayCnt), 'Alerts Today', '', todayCnt > 10 ? 'data-warn' : 'data-ok'));
      sc.appendChild(grid1);

      if (liveCallsCache.length > 0) {
        sc.appendChild(mkSec(`Live Calls (${liveCallsCache.length})`));
        const callGrid = document.createElement('div'); callGrid.className = 'tcws-stat-grid';
        const callGroups = [...new Set(liveCallsCache.map(c => c.group).filter(Boolean))];
        const callAgents = [...new Set(liveCallsCache.map(c => c.agent).filter(Boolean))];
        const inbound    = liveCallsCache.filter(c => c.direction === 'inbound').length;
        const outbound   = liveCallsCache.filter(c => c.direction === 'outbound').length;
        callGrid.appendChild(tile(String(liveCallsCache.length), 'On Call Now', `${inbound} in · ${outbound} out`, 'data-ok'));
        callGrid.appendChild(tile(String(callGroups.length), 'Groups Active', callGroups.slice(0,2).join(', ') || '—', ''));
        callGrid.appendChild(tile(String(callAgents.length), 'Agents On Call', callAgents.slice(0,2).join(', ') || '—', ''));
        sc.appendChild(callGrid);
        if (callGroups.length > 2 || callAgents.length > 2) {
          const cd = document.createElement('div'); cd.style.cssText = 'font-size:11px;color:var(--t-text3);padding:6px 2px;line-height:1.6';
          if (callGroups.length) cd.innerHTML += `<span style="font-weight:700;color:var(--t-text2)">Groups:</span> ${escHtml(callGroups.join(', '))}<br>`;
          if (callAgents.length) cd.innerHTML += `<span style="font-weight:700;color:var(--t-text2)">Agents:</span> ${escHtml(callAgents.join(', '))}`;
          sc.appendChild(cd);
        }
      }

      const secStats = mkSec('Session Stats');
      const resetBtn = mkBtn('Reset', 'tcws-sec-action danger');
      resetBtn.title = 'Clear all persisted stats';
      resetBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); resetStats(); renderSettings(); });
      secStats.appendChild(resetBtn); sc.appendChild(secStats);

      const grid2 = document.createElement('div'); grid2.className = 'tcws-stat-grid';
      const avgRespStr = avgResp !== null ? fmtDuration(avgResp) : '—';
      grid2.appendChild(tile(String(resolved.length), 'Resolved Today', 'solved + merged'));
      grid2.appendChild(tile(String(mergesT.length), 'Merges Today', ''));
      grid2.appendChild(tile(avgRespStr, 'Avg Response', `n=${(stats.responseTimes || []).length}`));
      sc.appendChild(grid2);

      const scBreakdown = (stats.statusChanges || []).filter(c => Date.now() - c.at < 86400000);
      if (scBreakdown.length) {
        const toMap = {};
        for (const c of scBreakdown) { toMap[c.to] = (toMap[c.to] || 0) + 1; }
        const grid3 = document.createElement('div'); grid3.className = 'tcws-stat-grid';
        for (const [status, cnt] of Object.entries(toMap).slice(0, 3)) {
          grid3.appendChild(tile(String(cnt), `→ ${status}`, 'status changes'));
        }
        sc.appendChild(grid3);
      }

      sc.appendChild(mkSec('Activity — Last 12 Hours'));
      const chartWrap = document.createElement('div'); chartWrap.className = 'tcws-chart-wrap';
      chartWrap.innerHTML = `<div class="tcws-chart-ttl">Alert events per hour</div>` + buildSparkline(log);
      sc.appendChild(chartWrap);

      const viewCounts = {};
      for (const e of log) {
        if (!e.viewKey || e.viewKey.startsWith('watch_')) continue;
        if (!viewCounts[e.viewKey]) viewCounts[e.viewKey] = { title: e.title || e.viewKey, count: 0 };
        viewCounts[e.viewKey].count++;
      }
      const topViews = Object.values(viewCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      if (topViews.length) {
        sc.appendChild(mkSec('Top Alert Sources (24h)'));
        const tvWrap = document.createElement('div'); tvWrap.className = 'tcws-top-views';
        for (const v of topViews) {
          const row = document.createElement('div'); row.className = 'tcws-top-view-row';
          row.innerHTML = `<span class="tcws-top-view-name">${escHtml(v.title)}</span><span class="tcws-top-view-count">${v.count} event${v.count !== 1 ? 's' : ''}</span>`;
          tvWrap.appendChild(row);
        }
        sc.appendChild(tvWrap);
      }

      sc.appendChild(mkSec('Quick Actions'));
      const qrow = document.createElement('div'); qrow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      const scanNow = mkBtn('↺ Scan Now', 'tcws-btn accent');
      scanNow.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); scan().then(() => renderSettings()); });
      const testNotif = mkBtn('Test Alert', 'tcws-btn');
      testNotif.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (Notification.permission !== 'granted') await Notification.requestPermission();
        desktopNotify('TCWS — Test Alert', 'Desktop notifications are working!', 'tcws-test');
        playSound('info');
      });
      const clearLog = mkBtn('Clear Log', 'tcws-btn');
      clearLog.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveLog([]); renderSettings(); });
      qrow.appendChild(scanNow); qrow.appendChild(testNotif); qrow.appendChild(clearLog);
      sc.appendChild(qrow);
    }

    function renderSettingsRefresh(sc) {
      const curMs  = loadMs();
      const curSec = Math.round(curMs / 1000);
      const en     = loadEn();

      sc.appendChild(mkSec('Refresh Interval'));

      const valWrap = document.createElement('div'); valWrap.className = 'tcws-slider-val';
      valWrap.innerHTML = `<span class="tcws-slider-num" id="tcws-ar-num">${curSec}</span><span class="tcws-slider-unit">seconds</span>`;
      sc.appendChild(valWrap);

      const slider = document.createElement('input');
      slider.type = 'range'; slider.className = 'tcws-slider';
      slider.min = '5'; slider.max = '60'; slider.step = '1'; slider.value = String(curSec);
      const pct0 = ((curSec - 5) / 55) * 100;
      slider.style.setProperty('--pct', `${pct0.toFixed(1)}%`);

      const ticks = document.createElement('div'); ticks.className = 'tcws-slider-ticks';
      ticks.innerHTML = ['5s','15s','30s','45s','60s'].map(t => `<span>${t}</span>`).join('');

      const presetRow = document.createElement('div'); presetRow.className = 'tcws-presets';
      const PRESETS = [
        { l: '5s', ms: 5000 }, { l: '10s', ms: 10000 }, { l: '15s', ms: 15000 },
        { l: '20s', ms: 20000 }, { l: '30s', ms: 30000 }, { l: '60s', ms: 60000 },
      ];
      const presetBtns = [];
      for (const p of PRESETS) {
        const btn = mkBtn(p.l, 'tcws-preset'); btn.dataset.on = p.ms === curMs ? '1' : '0';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          slider.value = String(p.ms / 1000); syncSlider();
          saveMs(p.ms); if (en) startAR(p.ms);
        });
        presetRow.appendChild(btn); presetBtns.push({ btn, ms: p.ms });
      }

      function syncSlider() {
        const sec = Number(slider.value);
        const pct = ((sec - 5) / 55) * 100;
        slider.style.setProperty('--pct', `${pct.toFixed(1)}%`);
        const numEl = document.getElementById('tcws-ar-num');
        if (numEl) numEl.textContent = sec;
        presetBtns.forEach(({ btn, ms }) => { btn.dataset.on = ms === sec * 1000 ? '1' : '0'; });
      }

      slider.addEventListener('input', syncSlider);
      slider.addEventListener('change', () => { const ms = Number(slider.value) * 1000; saveMs(ms); if (en) startAR(ms); });

      sc.appendChild(slider); sc.appendChild(ticks);
      sc.appendChild(mkSec('Quick Presets'));
      sc.appendChild(presetRow);

      const ahBtn = document.createElement('button');
      ahBtn.type = 'button'; ahBtn.className = 'tcws-after-hours';
      ahBtn.dataset.on = (en && curMs <= 10000 && loadDNotif()) ? '1' : '0';
      ahBtn.textContent = 'After-Hours Mode — 10s interval + desktop alerts';
      ahBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (!loadDNotif()) {
          if (Notification.permission === 'granted') saveDNotif(true);
          else if (Notification.permission !== 'denied') {
            const p = await Notification.requestPermission();
            if (p === 'granted') saveDNotif(true);
          }
        }
        saveMs(10000); startAR(10000);
        slider.value = '10'; syncSlider();
        ahBtn.dataset.on = '1';
      });
      sc.appendChild(ahBtn);

      const startBtn = document.createElement('button');
      startBtn.type = 'button'; startBtn.className = 'tcws-full-btn start';
      startBtn.textContent = en ? `↺ Restart at ${fmtMs(curMs)}` : '▶ Start Auto-Refresh';
      startBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); startAR(Number(slider.value) * 1000); renderSettings(); });
      sc.appendChild(startBtn);

      if (en) {
        const stopBtn = document.createElement('button');
        stopBtn.type = 'button'; stopBtn.className = 'tcws-full-btn';
        stopBtn.textContent = '■ Stop Auto-Refresh';
        stopBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); stopAR(); renderSettings(); });
        sc.appendChild(stopBtn);
      }
    }

    function renderSettingsWatchlist(sc) {
      const list     = loadWatchlist();
      const watchInt = loadWatchInt();
      const states   = loadWatchStates();

      const intRow = document.createElement('div'); intRow.className = 'tcws-int-row';
      const intLbl = document.createElement('span'); intLbl.className = 'tcws-int-lbl'; intLbl.textContent = 'Poll interval:';
      intRow.appendChild(intLbl);
      const INT_OPTS = [{ l: '30s', ms: 30000 }, { l: '1m', ms: 60000 }, { l: '2m', ms: 120000 }, { l: '5m', ms: 300000 }];
      const intBtns = [];
      for (const p of INT_OPTS) {
        const btn = mkBtn(p.l, 'tcws-preset'); btn.dataset.on = watchInt === p.ms ? '1' : '0';
        btn.style.cssText = 'padding:3px 9px;font-size:10px';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          saveWatchInt(p.ms); startWatchPolling(p.ms);
          intBtns.forEach(b => b.dataset.on = '0'); btn.dataset.on = '1';
        });
        intRow.appendChild(btn); intBtns.push(btn);
      }
      sc.appendChild(intRow);

      const wSec = mkSec(`${list.length} Watched Ticket${list.length !== 1 ? 's' : ''}`);
      const pollNow = mkBtn('Poll Now', 'tcws-sec-action');
      pollNow.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pollWatchlist(); });
      wSec.appendChild(pollNow); sc.appendChild(wSec);

      const addRow = document.createElement('div'); addRow.className = 'tcws-watch-row';
      const inp = document.createElement('input');
      inp.className = 'tcws-watch-inp'; inp.type = 'text';
      inp.placeholder = 'Ticket ID, e.g. 98765'; inp.setAttribute('autocomplete', 'off');
      const addBtn = mkBtn('+ Watch', 'tcws-btn accent'); addBtn.style.padding = '8px 14px';
      addBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const id = inp.value.trim().replace(/\D/g, ''); if (!id) return;
        const cur = loadWatchlist();
        if (!cur.find(i => String(i.id) === id)) { cur.push({ id, addedAt: Date.now() }); saveWatchlist(cur); }
        inp.value = ''; startWatchPolling(loadWatchInt()); renderSettings();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
      addRow.appendChild(inp); addRow.appendChild(addBtn); sc.appendChild(addRow);

      if (!list.length) {
        sc.insertAdjacentHTML('beforeend', `<div class="tcws-empty">No watched tickets.<br>Enter a ticket ID above to monitor it for changes.</div>`);
        return;
      }
      for (const item of list) {
        const tid   = String(item.id);
        const state = states[tid];
        const el    = document.createElement('div'); el.className = 'tcws-watch-item';
        const left  = document.createElement('div');
        const wIdDiv = document.createElement('div'); wIdDiv.className = 'tcws-watch-item-id';
        wIdDiv.appendChild(_mkTicketLink(tid, 'tcws-ticket-link'));
        left.appendChild(wIdDiv);
        if (state) left.insertAdjacentHTML('beforeend', `<div class="tcws-watch-item-meta">Status: ${escHtml(state.status)}${state.updated_at ? ` · ${state.updated_at.slice(0,10)}` : ''}</div>`);
        const rm = mkBtn('Remove', 'tcws-btn xs danger');
        rm.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); saveWatchlist(loadWatchlist().filter(i => String(i.id) !== tid)); el.remove(); });
        el.appendChild(left); el.appendChild(rm); sc.appendChild(el);
      }
    }

    function renderSettingsNotifs(sc) {
      const notifBlock = document.createElement('div'); notifBlock.className = 'tcws-set-block';
      notifBlock.appendChild(mkTglCard('Desktop Notifications', 'Browser pop-up when new tickets arrive', loadDNotif(), async v => {
        if (!v) { saveDNotif(false); return; }
        if (!('Notification' in window)) { saveDNotif(false); return; }
        if (Notification.permission === 'granted') { saveDNotif(true); return; }
        if (Notification.permission === 'denied')  { saveDNotif(false); return; }
        const p = await Notification.requestPermission();
        saveDNotif(p === 'granted');
      }));
      notifBlock.appendChild(mkTglCard('Sound Alerts', 'Audio chimes for all 4 change types (reply, note, assignment, solved/merged)', loadSoundEn(), v => saveSoundEn(v)));
      notifBlock.appendChild(mkTglCard('Alert Strobe', 'Animated border ring around the nav button when alerts are active — level-aware (red/amber/blue)', loadStrobe(), v => { saveStrobe(v); updateStrobe(); }));
      notifBlock.appendChild(mkTglCard('Views Ticker', 'Fading event feed below the Views header — shows new alert counts and ticket changes in real time', loadTickerEn(), v => { saveTickerEn(v); if (!v) { document.getElementById('tcws-views-ticker')?.remove(); } else ensureViewsTicker(); }));
      notifBlock.appendChild(mkTglCard('Auto-Dismiss on View Click', 'Remove alert card when navigating into its view', loadAutoDismiss(), v => saveAutoDismiss(v)));
      notifBlock.appendChild(mkTglCard('Reply Composer in Pop-out', 'Show an inline message/note composer at the bottom of each ticket pop-out', loadReplyComposer(), v => saveReplyComposer(v)));
      const testCard = document.createElement('div'); testCard.className = 'tcws-set-card';
      testCard.innerHTML = `<div class="tcws-set-card-left"><div class="tcws-set-card-lbl">Test Alerts</div><div class="tcws-set-card-desc">Fire a test desktop notification and sound</div></div>`;
      const testBtn = mkBtn('Send Test', 'tcws-btn accent');
      testBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (Notification.permission !== 'granted') await Notification.requestPermission();
        desktopNotify('TCWS — Test Alert', 'Desktop alerts are working!', 'tcws-test');
        playSound('info');
      });
      testCard.appendChild(testBtn); notifBlock.appendChild(testCard);
      sc.appendChild(notifBlock);
    }

    // ─── Features settings tab ───────────────────────────────────────────────────
    function renderSettingsFeatures(sc) {
      const hd = document.createElement('div');
      hd.style.cssText = 'font-size:11px;color:var(--t-text3);line-height:1.5;margin-bottom:10px;padding:0 2px';
      hd.textContent = 'Enable or disable major features. Changes take effect immediately — disabled features stop polling and hide their UI elements.';
      sc.appendChild(hd);

      const block = document.createElement('div'); block.className = 'tcws-set-block';

      for (const def of FEATURE_DEFS) {
        block.appendChild(mkTglCard(def.label, def.desc, featEnabled(def.key), v => {
          const cur = loadFeatures();
          cur[def.key] = v;
          saveFeatures(cur);

          // ── Live side effects ──────────────────────────────────────────────────
          if (def.key === 'calls') {
            // Show/hide Calls tab button
            panelEl?._applyTabVisibility();
            // If disabling while on Calls tab, kick back to Alerts
            if (!v && activeTab === 'calls') panelEl?._render();
            // Stop or start the poll
            if (!v) { if (callsApiTimer) { clearInterval(callsApiTimer); callsApiTimer = null; } }
            else    startCallsApiPoll();
            // Hide/show call banner
            const banner = document.getElementById('tcws-call-banner');
            if (banner) banner.style.display = v ? '' : 'none';
          }

          if (def.key === 'teamBar') {
            // Show/hide team sidebar
            const li = document.getElementById('tcws-team-sidebar-li');
            if (li) li.style.display = v ? '' : 'none';
            // Stop or start agent status poll
            if (!v) { if (agentStatusTimer) { clearInterval(agentStatusTimer); agentStatusTimer = null; } }
            else    startAgentStatusPoll();
          }

          if (def.key === 'queueMonitor') {
            if (!v) { if (queueMonitorTimer) { clearInterval(queueMonitorTimer); queueMonitorTimer = null; } }
            else    startQueueMonitorPoll(60_000);
          }

          if (def.key === 'watchlist') {
            if (!v) { if (watchTimer) { clearInterval(watchTimer); watchTimer = null; } }
            else    startWatchPolling(loadWatchInt());
          }

          if (def.key === 'sites') {
            panelEl?._applyTabVisibility();
            if (!v) {
              stopSiteViewPoll();
              if (activeTab === 'sites') panelEl?._render();
            } else {
              startSiteViewPoll();
            }
          }

          if (def.key === 'resolved') {
            panelEl?._applyTabVisibility();
            if (!v && activeTab === 'resolved') panelEl?._render();
          }

          if (def.key === 'assigned') {
            panelEl?._applyTabVisibility();
            if (!v && activeTab === 'assigned') panelEl?._render();
          }

          if (def.key === 'callBanner') {
            // Immediately reflect the toggle without needing a page reload
            _updateCallBanner();
          }

          // Re-render the features tab so the all-off warning updates live
          renderSettings();
        }));
      }

      sc.appendChild(block);

      // ── All-features-off warning ────────────────────────────────────────────────
      const f = loadFeatures();
      const allOff = FEATURE_DEFS.every(d => f[d.key] === false);
      if (allOff) {
        const warn = document.createElement('div');
        warn.style.cssText = [
          'margin-top:14px',
          'padding:12px 14px',
          'border-radius:8px',
          'background:rgba(255,160,50,.1)',
          'border:1px solid rgba(255,160,50,.35)',
          'font-size:11px',
          'line-height:1.6',
          'color:var(--t-text2)',
        ].join(';');
        warn.innerHTML =
          '<div style="font-weight:800;font-size:12px;color:#ffb347;margin-bottom:6px;">⚠ All features are disabled</div>' +
          'The Notification Manager has nothing to monitor right now. At minimum, consider enabling one of the following:<br><br>' +
          '<b>Watchlist</b> — lets you manually pin any ticket and track it at a custom poll interval.<br>' +
          '<b>Queue Monitor</b> — automatically polls pinned Zendesk views every 60 s and alerts on count changes.';
        sc.appendChild(warn);
      }
    }

    function renderSettingsViews(sc) {
      sc.appendChild(mkSec('Queue Monitor'));
      const qmonBlock = document.createElement('div'); qmonBlock.className = 'tcws-set-block';
      const qmonDesc = document.createElement('div');
      qmonDesc.style.cssText = 'font-size:11px;color:var(--t-text3);margin-bottom:8px;line-height:1.5';
      qmonDesc.textContent = 'Pin queues to always show their current tickets in the Alerts tab — fetched on a 60s poll regardless of count changes.';
      qmonBlock.appendChild(qmonDesc);

      const qAddRow = document.createElement('div'); qAddRow.className = 'tcws-watch-row'; qAddRow.style.cssText = 'flex-wrap:wrap;gap:6px';
      const qSelect = document.createElement('select');
      qSelect.className = 'tcws-role-select'; qSelect.style.cssText = 'flex:1 1 100%;min-width:0;width:100%';
      const qBlank = document.createElement('option'); qBlank.value = ''; qBlank.textContent = 'Pick a detected view…';
      qSelect.appendChild(qBlank);
      const detectedRows = loadViewsCache().slice().sort((a, b) => a.title.localeCompare(b.title));
      for (const r of detectedRows) {
        const o = document.createElement('option'); o.value = r.viewKey; o.textContent = r.title;
        qSelect.appendChild(o);
      }
      const qIdInp = document.createElement('input');
      qIdInp.className = 'tcws-watch-inp'; qIdInp.type = 'text';
      qIdInp.placeholder = 'View ID'; qIdInp.style.cssText = 'width:90px;min-width:0;flex:0 0 90px';
      qIdInp.setAttribute('autocomplete', 'off');
      const qLabelInp = document.createElement('input');
      qLabelInp.className = 'tcws-watch-inp'; qLabelInp.type = 'text';
      qLabelInp.placeholder = 'Label'; qLabelInp.style.cssText = 'width:110px;min-width:0;flex:0 0 110px';
      qLabelInp.setAttribute('autocomplete', 'off');
      qSelect.addEventListener('change', () => {
        if (qSelect.value) { qIdInp.value = qSelect.value; qLabelInp.value = qSelect.options[qSelect.selectedIndex]?.text || ''; }
      });
      const qAddBtn = mkBtn('+ Add', 'tcws-btn accent'); qAddBtn.style.padding = '8px 12px';
      qAddBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const vid = qIdInp.value.trim(); if (!vid) return;
        const lbl = qLabelInp.value.trim() || vid;
        const cur = loadQueueMonitor();
        if (!cur.find(q => String(q.viewId) === String(vid))) {
          cur.push({ viewId: vid, label: lbl, addedAt: Date.now() });
          saveQueueMonitor(cur); startQueueMonitorPoll(60_000);
        }
        qIdInp.value = ''; qLabelInp.value = ''; qSelect.value = '';
        renderSettings();
      });
      qIdInp.addEventListener('keydown', e => { if (e.key === 'Enter') qAddBtn.click(); });
      qLabelInp.addEventListener('keydown', e => { if (e.key === 'Enter') qAddBtn.click(); });
      qAddRow.appendChild(qSelect); qAddRow.appendChild(qIdInp); qAddRow.appendChild(qLabelInp); qAddRow.appendChild(qAddBtn);
      qmonBlock.appendChild(qAddRow);
      const qList = loadQueueMonitor();
      if (qList.length) {
        const qPollNow = mkBtn('Poll Now', 'tcws-sec-action');
        qPollNow.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pollQueueMonitor(); });
        for (const q of qList) {
          const qItem = document.createElement('div'); qItem.className = 'tcws-watch-item';
          const qLeft = document.createElement('div');
          qLeft.innerHTML = `<div class="tcws-watch-item-id"><a href="/agent/filters/${encodeURIComponent(q.viewId)}" target="_blank">${escHtml(q.label || q.viewId)}</a></div>`;
          qLeft.insertAdjacentHTML('beforeend', `<div class="tcws-watch-item-meta">View ID: ${escHtml(q.viewId)}</div>`);
          const qRm = mkBtn('Remove', 'tcws-btn xs danger');
          qRm.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            saveQueueMonitor(loadQueueMonitor().filter(q2 => q2.viewId !== q.viewId));
            if (!loadQueueMonitor().length) stopQueueMonitorPoll();
            renderSettings();
          });
          qItem.appendChild(qLeft); qItem.appendChild(qRm); qmonBlock.appendChild(qItem);
        }
        qmonBlock.appendChild(qPollNow);
      } else {
        qmonBlock.insertAdjacentHTML('beforeend', `<div style="opacity:.5;font-size:11px;padding:6px 0">No queues added yet.</div>`);
      }
      sc.appendChild(qmonBlock);

      const viewSec = mkSec('View Alert Modes');
      const resetV = mkBtn('Reset All', 'tcws-sec-action');
      resetV.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); savePrefs({}); renderSettings(); refreshDots(); updateNavBtn(); });
      const refreshViewsBtn = mkBtn('↺ Refresh Views', 'tcws-sec-action');
      refreshViewsBtn.title = 'Re-fetch all views from the Zendesk API';
      refreshViewsBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        refreshViewsBtn.textContent = '…';
        await fetchAndCacheViews(true);
        renderSettings();
      });
      viewSec.appendChild(resetV); viewSec.appendChild(refreshViewsBtn);
      sc.appendChild(viewSec);

      const viewRows = loadViewsCache().slice().sort((a, b) => a.title.localeCompare(b.title));
      if (!viewRows.length) {
        sc.insertAdjacentHTML('beforeend', `<div class="tcws-empty">No views loaded yet.<br>Click <strong>↺ Refresh Views</strong> above, or wait for the next scan.</div>`);
        return;
      }
      const M_OPTS = ['Off', 'Silent', 'Desktop'];
      const P_OPTS = ['None', 'Low', 'Normal', 'High', 'Critical'];
      const P_VALS = { None: 0, Low: 25, Normal: 50, High: 75, Critical: 100 };
      for (const r of viewRows) {
        const pref = getPref(r.viewKey, r.title);
        const card = document.createElement('div'); card.className = 'tcws-vcard';
        const nm   = document.createElement('div'); nm.className = 'tcws-vcard-name'; nm.textContent = r.title; nm.title = r.title;
        card.appendChild(nm);
        card.appendChild(mkVRow('Mode', M_OPTS, (pref.mode || 'off').toLowerCase(),
          opt => { setPref(r.viewKey, { mode: opt.toLowerCase() }); refreshDots(); updateNavBtn(); }));
        const curPri = isNum(pref.priority) ? pref.priority : 0;
        const curPriLbl = P_OPTS.reduce((b, l) => Math.abs(P_VALS[l] - curPri) < Math.abs(P_VALS[b] - curPri) ? l : b);
        card.appendChild(mkVRow('Priority', P_OPTS, curPriLbl,
          opt => setPref(r.viewKey, { priority: P_VALS[opt] }),
          lbl => lbl === 'Critical'));
        sc.appendChild(card);
      }
    }

    function renderSettingsTheme(sc) {
      const curTheme = loadTheme();

      // Category section builder
      const CATS = [
        { key: 'dark',     label: 'Dark'      },
        { key: 'light',    label: 'Light'     },
        { key: 'retro',    label: 'Retro'     },
        { key: 'animated', label: 'Animated'  },
      ];

      for (const cat of CATS) {
        const entries = Object.entries(THEMES).filter(([,t]) => t.category === cat.key);
        if (!entries.length) continue;

        const catHdr = document.createElement('div'); catHdr.className = 'tcws-theme-cat-hdr';
        catHdr.textContent = cat.label;
        if (cat.key === 'animated') {
          const pulse = document.createElement('span'); pulse.className = 'tcws-theme-cat-pulse';
          pulse.textContent = 'LIVE';
          catHdr.appendChild(pulse);
        }
        sc.appendChild(catHdr);

        const grid = document.createElement('div'); grid.className = 'tcws-theme-grid';
        for (const [key, thm] of entries) {
          const sw = document.createElement('div'); sw.className = 'tcws-theme-swatch'; sw.dataset.active = key === curTheme ? '1' : '0';
          const circle = document.createElement('div'); circle.className = 'tcws-theme-circle';
          if (cat.key === 'animated') circle.className += ' tcws-theme-circle-anim';
          circle.style.background = `linear-gradient(135deg,${thm.swatch[0]} 50%,${thm.swatch[1]} 150%)`;
          const nm = document.createElement('div'); nm.className = 'tcws-theme-name'; nm.textContent = thm.label;
          sw.appendChild(circle); sw.appendChild(nm);
          sw.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            saveTheme(key); applyTheme(key, panel);
            if (detailPanelEl) applyTheme(key, detailPanelEl);
            sc.querySelectorAll('.tcws-theme-swatch').forEach(s => s.dataset.active = '0');
            sw.dataset.active = '1';
          });
          grid.appendChild(sw);
        }
        sc.appendChild(grid);
      }

      // ── Custom theme builder ──────────────────────────────────────────────────
      const custHdr = document.createElement('div'); custHdr.className = 'tcws-theme-cat-hdr';
      custHdr.textContent = 'Custom';
      sc.appendChild(custHdr);

      const custWrap = document.createElement('div'); custWrap.className = 'tcws-custom-theme-wrap';
      const cfg = loadCustomTheme();

      // Custom swatch activate button
      const custActivateRow = document.createElement('div'); custActivateRow.className = 'tcws-custom-activate-row';
      const custSwatch = document.createElement('div'); custSwatch.className = 'tcws-theme-swatch'; custSwatch.dataset.active = curTheme === 'custom' ? '1' : '0';
      const custCircle = document.createElement('div'); custCircle.className = 'tcws-theme-circle';
      custCircle.style.background = 'conic-gradient(#e8333a,#f8c800,#38d9a9,#00a8e8,#7b68c8,#fe75fe,#e8333a)';
      const custLbl = document.createElement('div'); custLbl.className = 'tcws-theme-name'; custLbl.textContent = 'My Theme';
      custSwatch.appendChild(custCircle); custSwatch.appendChild(custLbl);
      custActivateRow.appendChild(custSwatch);
      custWrap.appendChild(custActivateRow);

      // Color picker rows
      const PICKERS = [
        { key: 'bg',     label: 'Background',  default: '#0e1420' },
        { key: 'accent', label: 'Accent',       default: '#9ab7d3' },
        { key: 'text',   label: 'Text',         default: '#ffffff' },
        { key: 'crit',   label: 'Critical',     default: '#e8a4b4' },
        { key: 'warn',   label: 'Warning',      default: '#d4c090' },
        { key: 'info',   label: 'Info',         default: '#8eb4d4' },
      ];
      const inputs = {};
      const pickerGrid = document.createElement('div'); pickerGrid.className = 'tcws-custom-picker-grid';
      for (const p of PICKERS) {
        const row = document.createElement('div'); row.className = 'tcws-custom-picker-row';
        const lbl = document.createElement('label'); lbl.className = 'tcws-custom-picker-lbl'; lbl.textContent = p.label;
        const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'tcws-custom-picker-inp';
        inp.value = cfg[p.key] || p.default;
        inputs[p.key] = inp;
        inp.addEventListener('input', () => {
          // Live-preview if custom is already active
          if (loadTheme() === 'custom') {
            const live = {};
            for (const [k, el] of Object.entries(inputs)) live[k] = el.value;
            saveCustomTheme(live);
            applyTheme('custom', panel);
            if (detailPanelEl) applyTheme('custom', detailPanelEl);
          }
        });
        row.appendChild(lbl); row.appendChild(inp); pickerGrid.appendChild(row);
      }
      custWrap.appendChild(pickerGrid);

      // Save & Apply button
      const applyRow = document.createElement('div'); applyRow.style.cssText = 'display:flex;gap:8px;margin-top:10px';
      const applyBtn = mkBtn('Save & Apply', 'tcws-btn accent');
      applyBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const newCfg = {};
        for (const [k, el] of Object.entries(inputs)) newCfg[k] = el.value;
        saveCustomTheme(newCfg);
        saveTheme('custom');
        applyTheme('custom', panel);
        if (detailPanelEl) applyTheme('custom', detailPanelEl);
        sc.querySelectorAll('.tcws-theme-swatch').forEach(s => s.dataset.active = '0');
        custSwatch.dataset.active = '1';
      });
      const resetBtn2 = mkBtn('Reset', 'tcws-btn');
      resetBtn2.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        for (const p of PICKERS) inputs[p.key].value = p.default;
      });
      applyRow.appendChild(applyBtn); applyRow.appendChild(resetBtn2);
      custWrap.appendChild(applyRow);

      // Wire up the custom swatch click too
      custSwatch.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const newCfg = {};
        for (const [k, el] of Object.entries(inputs)) newCfg[k] = el.value;
        saveCustomTheme(newCfg);
        saveTheme('custom');
        applyTheme('custom', panel);
        if (detailPanelEl) applyTheme('custom', detailPanelEl);
        sc.querySelectorAll('.tcws-theme-swatch').forEach(s => s.dataset.active = '0');
        custSwatch.dataset.active = '1';
      });

      sc.appendChild(custWrap);

      // ── Matrix color adjustment (only shown when Matrix theme is active) ─────────
      if (curTheme === 'matrix') {
        const mxHdr = document.createElement('div'); mxHdr.className = 'tcws-theme-cat-hdr';
        mxHdr.textContent = 'Matrix Color';
        sc.appendChild(mxHdr);

        const mxWrap = document.createElement('div');
        mxWrap.style.cssText = 'padding:6px 2px 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';

        const mxLbl = document.createElement('label');
        mxLbl.style.cssText = 'font-size:12px;font-weight:700;color:var(--t-text2)';
        mxLbl.textContent = 'Rain Color';

        const mxInp = document.createElement('input');
        mxInp.type = 'color'; mxInp.className = 'tcws-custom-picker-inp';
        mxInp.value = loadMatrixColor();
        mxInp.title = 'Adjust the Matrix rain color';
        mxInp.addEventListener('input', () => {
          saveMatrixColor(mxInp.value);
          // Canvas re-reads color automatically via interval — no restart needed
        });

        const mxReset = mkBtn('Reset Green', 'tcws-btn xs');
        mxReset.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          mxInp.value = '#00ff41';
          saveMatrixColor('#00ff41');
        });

        const mxHint = document.createElement('span');
        mxHint.style.cssText = 'font-size:11px;color:var(--t-text3);font-style:italic';
        mxHint.textContent = 'Color updates live — no reload needed';

        mxWrap.appendChild(mxLbl);
        mxWrap.appendChild(mxInp);
        mxWrap.appendChild(mxReset);
        mxWrap.appendChild(mxHint);
        sc.appendChild(mxWrap);
      }

    // ── DISPLAY (scale / zoom) ────────────────────────────────────────────────────
    function renderSettingsDisplay(sc) {
      // ── Helper: make a segmented button group ─────────────────────────────────
      function mkSegGroup(opts, getCurrent, onSelect) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
        const btns = opts.map(({ value, label }) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'tcws-btn'; b.textContent = label;
          b.style.cssText = 'flex:1;min-width:52px;font-size:11px;padding:5px 4px';
          const refresh = () => {
            const active = getCurrent() === value;
            b.dataset.on = active ? '1' : '0';
            b.style.background  = active ? 'var(--t-accent-dim)'  : 'var(--t-btn-bg)';
            b.style.borderColor = active ? 'var(--t-accent-brd)'  : 'var(--t-border2)';
            b.style.color       = active ? 'var(--t-accent-txt)'  : 'var(--t-text2)';
          };
          refresh();
          b.addEventListener('mouseenter', () => { if (b.dataset.on !== '1') b.style.background = 'var(--t-btn-hover)'; });
          b.addEventListener('mouseleave', () => {
            b.style.background  = b.dataset.on === '1' ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)';
            b.style.borderColor = b.dataset.on === '1' ? 'var(--t-accent-brd)' : 'var(--t-border2)';
            b.style.color       = b.dataset.on === '1' ? 'var(--t-accent-txt)' : 'var(--t-text2)';
          });
          b.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            onSelect(value);
            btns.forEach(x => x.refresh());
          });
          b.refresh = refresh;
          return b;
        });
        btns.forEach(b => wrap.appendChild(b));
        return { wrap, refreshAll: () => btns.forEach(b => b.refresh()) };
      }

      // ── Helper: row slider ────────────────────────────────────────────────────
      function mkSliderRow(mn, mx, step, cur, fmt, onChange) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px';
        const mnL = document.createElement('span');
        mnL.style.cssText = 'font-size:10px;color:var(--t-text3);white-space:nowrap;min-width:34px';
        mnL.textContent = fmt(mn);
        const sl = document.createElement('input');
        sl.type = 'range'; sl.min = String(mn); sl.max = String(mx); sl.step = String(step);
        sl.value = String(cur);
        sl.style.cssText = 'flex:1;accent-color:var(--t-accent);cursor:pointer';
        const mxL = document.createElement('span');
        mxL.style.cssText = 'font-size:10px;color:var(--t-text3);white-space:nowrap;min-width:34px;text-align:right';
        mxL.textContent = fmt(mx);
        const valEl = document.createElement('span');
        valEl.style.cssText = 'font-size:12px;font-weight:800;color:var(--t-accent-txt);min-width:42px;text-align:right;font-variant-numeric:tabular-nums';
        valEl.textContent = fmt(cur);
        sl.addEventListener('input', () => {
          const v = Math.max(mn, Math.min(mx, Math.round(Number(sl.value) / step) * step));
          valEl.textContent = fmt(v);
          onChange(v, valEl, sl);
        });
        row.appendChild(mnL); row.appendChild(sl); row.appendChild(mxL); row.appendChild(valEl);
        return { row, sl, valEl };
      }

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 1 — SCALE
      // ════════════════════════════════════════════════════════════════════════
      const PRESETS = [
        { label: 'Tiny',   value: 0.75 },
        { label: 'Small',  value: 0.85 },
        { label: 'Normal', value: 1.00 },
        { label: 'Large',  value: 1.15 },
        { label: 'XL',     value: 1.30 },
      ];

      const intro = document.createElement('div');
      intro.style.cssText = 'font-size:11px;color:var(--t-text3);line-height:1.6;margin-bottom:14px';
      intro.textContent = 'Scale the entire panel up or down. All text, spacing, and controls resize together. Changes apply immediately and are saved per-browser.';
      sc.appendChild(intro);

      // Current scale readout
      const curScale = loadScale();
      const statusEl = document.createElement('div');
      statusEl.id = 'tcws-scale-status';
      const nearestPreset = PRESETS.reduce((best, p) => Math.abs(p.value - curScale) < Math.abs(best.value - curScale) ? p : best);
      const isExact = Math.abs(nearestPreset.value - curScale) < 0.001;
      statusEl.textContent = isExact ? `${nearestPreset.label} (${Math.round(curScale * 100)}%)` : `Custom (${Math.round(curScale * 100)}%)`;
      statusEl.style.cssText = 'font-size:22px;font-weight:900;color:var(--t-text1);letter-spacing:.02em;margin-bottom:10px;line-height:1';
      sc.appendChild(statusEl);

      function updateScaleStatus(v) {
        const np = PRESETS.reduce((best, p) => Math.abs(p.value - v) < Math.abs(best.value - v) ? p : best);
        const exact = Math.abs(np.value - v) < 0.001;
        statusEl.textContent = exact ? `${np.label} (${Math.round(v * 100)}%)` : `Custom (${Math.round(v * 100)}%)`;
        presetBtns.forEach(({ btn, pv }) => { btn.dataset.on = Math.abs(pv - v) < 0.001 ? '1' : '0'; });
        scaleSlider.value    = String(v);
        scaleValEl.textContent = Math.round(v * 100) + '%';
      }

      function applyAndSaveScale(v) {
        saveScale(v);
        applyScale(panel);
        applyNMWidth(panel); // re-stamp width var in case it was wiped
        if (detailPanelEl) applyScale(detailPanelEl);
        if (panel.classList.contains('open')) {
          requestAnimationFrame(() => {
            positionPanel(panel, navBtnEl);
            // Also reposition detail panel — scale changes the main panel's visual footprint
            if (detailPanelEl?.classList.contains('open')) positionDetailPanel();
          });
        }
        updateScaleStatus(v);
      }

      // Preset buttons
      sc.appendChild(mkSec('Scale Presets'));
      const presetRow = document.createElement('div');
      presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px';
      const presetBtns = PRESETS.map(({ label, value: pv }) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tcws-btn'; btn.textContent = label;
        btn.dataset.on = Math.abs(pv - curScale) < 0.001 ? '1' : '0';
        btn.style.cssText = 'flex:1;min-width:52px;font-size:13px;padding:7px 0';
        const setActive = active => {
          btn.dataset.on    = active ? '1' : '0';
          btn.style.background  = active ? 'var(--t-accent-dim)'  : 'var(--t-btn-bg)';
          btn.style.borderColor = active ? 'var(--t-accent-brd)'  : 'var(--t-border2)';
          btn.style.color       = active ? 'var(--t-accent-txt)'  : 'var(--t-text2)';
        };
        setActive(btn.dataset.on === '1');
        btn.addEventListener('mouseenter', () => { if (btn.dataset.on !== '1') btn.style.background = 'var(--t-btn-hover)'; });
        btn.addEventListener('mouseleave', () => {
          btn.style.background  = btn.dataset.on === '1' ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)';
          btn.style.borderColor = btn.dataset.on === '1' ? 'var(--t-accent-brd)' : 'var(--t-border2)';
          btn.style.color       = btn.dataset.on === '1' ? 'var(--t-accent-txt)' : 'var(--t-text2)';
        });
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          applyAndSaveScale(pv);
          presetBtns.forEach(({ btn: b, pv: bv }) => {
            const active = Math.abs(bv - pv) < 0.001;
            b.dataset.on = active ? '1' : '0';
            b.style.background  = active ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)';
            b.style.borderColor = active ? 'var(--t-accent-brd)' : 'var(--t-border2)';
            b.style.color       = active ? 'var(--t-accent-txt)' : 'var(--t-text2)';
          });
        });
        presetRow.appendChild(btn);
        return { btn, pv };
      });
      sc.appendChild(presetRow);

      // Fine-tune +/− buttons (replaces slider)
      sc.appendChild(mkSec('Scale Fine Tune'));
      const scaleStepBlock = document.createElement('div');
      scaleStepBlock.className = 'tcws-set-block';
      scaleStepBlock.style.cssText = 'padding:12px 14px;display:flex;flex-direction:column;gap:8px';

      const scaleBtnRow = document.createElement('div');
      scaleBtnRow.style.cssText = 'display:flex;align-items:center;gap:8px';

      const scaleDecBtn = document.createElement('button');
      scaleDecBtn.type = 'button'; scaleDecBtn.className = 'tcws-btn';
      scaleDecBtn.style.cssText = 'padding:4px 14px;font-size:18px;font-weight:700;flex-shrink:0;min-width:40px';
      scaleDecBtn.textContent = '−';

      const scaleValEl = document.createElement('span');
      scaleValEl.style.cssText = 'font-size:13px;font-weight:800;color:var(--t-accent-txt);min-width:58px;text-align:center;font-variant-numeric:tabular-nums;flex-shrink:0';
      scaleValEl.textContent = Math.round(curScale * 100) + '%';

      const scaleIncBtn = document.createElement('button');
      scaleIncBtn.type = 'button'; scaleIncBtn.className = 'tcws-btn';
      scaleIncBtn.style.cssText = 'padding:4px 14px;font-size:18px;font-weight:700;flex-shrink:0;min-width:40px';
      scaleIncBtn.textContent = '+';

      // Dummy object so updateScaleStatus's `scaleSlider.value = ...` assignment is harmless
      const scaleSlider = { value: String(curScale) };

      const syncScaleBtnBounds = v => {
        scaleDecBtn.disabled = v <= SCALE_MIN;
        scaleIncBtn.disabled = v >= SCALE_MAX;
        scaleDecBtn.style.opacity = v <= SCALE_MIN ? '0.35' : '';
        scaleIncBtn.style.opacity = v >= SCALE_MAX ? '0.35' : '';
      };
      syncScaleBtnBounds(curScale);

      scaleDecBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const cv = loadScale();
        if (cv <= SCALE_MIN) return;
        const nv = Math.max(SCALE_MIN, Math.round((cv - SCALE_STEP) * 20) / 20);
        applyAndSaveScale(nv);
        syncScaleBtnBounds(nv);
      });
      scaleIncBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const cv = loadScale();
        if (cv >= SCALE_MAX) return;
        const nv = Math.min(SCALE_MAX, Math.round((cv + SCALE_STEP) * 20) / 20);
        applyAndSaveScale(nv);
        syncScaleBtnBounds(nv);
      });

      const scaleHint = document.createElement('div');
      scaleHint.style.cssText = 'font-size:10px;color:var(--t-text3);line-height:1.5';
      scaleHint.textContent = 'Each step is 5% (70% – 140%).';

      scaleBtnRow.appendChild(scaleDecBtn);
      scaleBtnRow.appendChild(scaleValEl);
      scaleBtnRow.appendChild(scaleIncBtn);
      scaleStepBlock.appendChild(scaleBtnRow);
      scaleStepBlock.appendChild(scaleHint);
      sc.appendChild(scaleStepBlock);

      const scaleResetRow = document.createElement('div');
      scaleResetRow.style.cssText = 'margin-top:6px;margin-bottom:18px;display:flex;gap:8px;align-items:center';
      const scaleResetBtn = mkBtn('Reset Scale to 100%', 'tcws-btn xs');
      scaleResetBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        applyAndSaveScale(SCALE_DEFAULT);
        syncScaleBtnBounds(SCALE_DEFAULT);
      });
      scaleResetRow.appendChild(scaleResetBtn);
      sc.appendChild(scaleResetRow);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 2 — PANEL WIDTHS
      // ════════════════════════════════════════════════════════════════════════
      sc.appendChild(mkSec('Panel Widths'));

      const widthsBlock = document.createElement('div');
      widthsBlock.className = 'tcws-set-block';
      widthsBlock.style.cssText = 'padding:12px 14px;display:flex;flex-direction:column;gap:14px';

      // ── Main NM width ──────────────────────────────────────────────────────
      const nmWRow = document.createElement('div');
      const nmWLbl = document.createElement('div');
      nmWLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
      nmWLbl.innerHTML = '<span>Notification Manager</span>';
      const nmWResetBtn = mkBtn('Reset', 'tcws-btn xs');
      nmWLbl.appendChild(nmWResetBtn);
      nmWRow.appendChild(nmWLbl);

      const { row: nmSliderRow, sl: nmSlider, valEl: nmValEl } = mkSliderRow(
        NM_W_MIN, NM_W_MAX, NM_W_STEP, loadNMWidth(),
        v => v + 'px',
        v => { saveNMWidth(v); applyNMWidth(panel); if (panel.classList.contains('open')) requestAnimationFrame(() => positionPanel(panel, navBtnEl)); }
      );
      nmWResetBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        saveNMWidth(NM_W_DEFAULT); applyNMWidth(panel);
        nmSlider.value = String(NM_W_DEFAULT); nmValEl.textContent = NM_W_DEFAULT + 'px';
        if (panel.classList.contains('open')) requestAnimationFrame(() => positionPanel(panel, navBtnEl));
      });
      nmWRow.appendChild(nmSliderRow);
      widthsBlock.appendChild(nmWRow);

      // ── Detail panel width ─────────────────────────────────────────────────
      const detWRow = document.createElement('div');
      const detWLbl = document.createElement('div');
      detWLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
      detWLbl.innerHTML = '<span>Detail (Pop-out) Panel</span>';
      const detWResetBtn = mkBtn('Reset', 'tcws-btn xs');
      detWLbl.appendChild(detWResetBtn);
      detWRow.appendChild(detWLbl);

      const { row: detSliderRow, sl: detSlider, valEl: detValEl } = mkSliderRow(
        DET_W_MIN, DET_W_MAX, DET_W_STEP, loadDetWidth(),
        v => v + 'px',
        v => { saveDetWidth(v); if (detailPanelEl) { applyDetWidth(detailPanelEl); positionDetailPanel(); } }
      );
      detWResetBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        saveDetWidth(DET_W_DEFAULT); if (detailPanelEl) { applyDetWidth(detailPanelEl); positionDetailPanel(); }
        detSlider.value = String(DET_W_DEFAULT); detValEl.textContent = DET_W_DEFAULT + 'px';
      });
      detWRow.appendChild(detSliderRow);
      widthsBlock.appendChild(detWRow);

      // ── Fields column width ────────────────────────────────────────────────
      const fldWRow = document.createElement('div');
      const fldWLbl = document.createElement('div');
      fldWLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
      fldWLbl.innerHTML = '<span>Fields Editor Column</span>';
      const fldWResetBtn = mkBtn('Reset', 'tcws-btn xs');
      fldWLbl.appendChild(fldWResetBtn);
      fldWRow.appendChild(fldWLbl);

      const { row: fldSliderRow, sl: fldSlider, valEl: fldValEl } = mkSliderRow(
        FLD_W_MIN, FLD_W_MAX, FLD_W_STEP, loadFldWidth(),
        v => v + 'px',
        v => { saveFldWidth(v); if (detailPanelEl) { applyDetWidth(detailPanelEl); positionDetailPanel(); } }
      );
      fldWResetBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        saveFldWidth(FLD_W_DEFAULT); if (detailPanelEl) { applyDetWidth(detailPanelEl); positionDetailPanel(); }
        fldSlider.value = String(FLD_W_DEFAULT); fldValEl.textContent = FLD_W_DEFAULT + 'px';
      });
      fldWRow.appendChild(fldSliderRow);
      widthsBlock.appendChild(fldWRow);

      const widthsNote = document.createElement('div');
      widthsNote.style.cssText = 'font-size:10px;color:var(--t-text3);line-height:1.5;margin-top:2px';
      widthsNote.textContent = 'Changes apply immediately. Fields Editor width is part of the total Detail Panel width.';
      widthsBlock.appendChild(widthsNote);

      sc.appendChild(widthsBlock);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 3 — PANEL PLACEMENT
      // ════════════════════════════════════════════════════════════════════════
      sc.appendChild(mkSec('Panel Placement'));

      const placementBlock = document.createElement('div');
      placementBlock.className = 'tcws-set-block';
      placementBlock.style.cssText = 'padding:12px 14px;display:flex;flex-direction:column;gap:14px';

      // ── Vertical align ─────────────────────────────────────────────────────
      const valignRow = document.createElement('div');
      const valignLbl = document.createElement('div');
      valignLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);margin-bottom:6px';
      valignLbl.textContent = 'Vertical Alignment';
      valignRow.appendChild(valignLbl);
      const { wrap: valignWrap } = mkSegGroup(
        [{ value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }],
        loadNMVAlign,
        v => { saveNMVAlign(v); if (panel.classList.contains('open')) requestAnimationFrame(() => positionPanel(panel, navBtnEl)); }
      );
      valignRow.appendChild(valignWrap);
      placementBlock.appendChild(valignRow);

      // ── Helper: make a +/− stepper control ─────────────────────────────────
      function mkStepper(loadFn, saveFn, mn, mx, step, fmtFn, onApply) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px';

        const decBtn = document.createElement('button');
        decBtn.type = 'button'; decBtn.className = 'tcws-btn';
        decBtn.style.cssText = 'padding:4px 12px;font-size:16px;font-weight:700;flex-shrink:0;min-width:36px';
        decBtn.textContent = '−';

        const valDisplay = document.createElement('span');
        valDisplay.style.cssText = 'font-size:13px;font-weight:800;color:var(--t-accent-txt);min-width:58px;text-align:center;font-variant-numeric:tabular-nums;flex-shrink:0';
        valDisplay.textContent = fmtFn(loadFn());

        const incBtn = document.createElement('button');
        incBtn.type = 'button'; incBtn.className = 'tcws-btn';
        incBtn.style.cssText = 'padding:4px 12px;font-size:16px;font-weight:700;flex-shrink:0;min-width:36px';
        incBtn.textContent = '+';

        // Disable dec/inc at bounds
        const syncBounds = v => {
          decBtn.disabled = v <= mn;
          incBtn.disabled = v >= mx;
          decBtn.style.opacity = v <= mn ? '0.35' : '';
          incBtn.style.opacity = v >= mx ? '0.35' : '';
        };
        syncBounds(loadFn());

        decBtn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          const cur = loadFn();
          if (cur <= mn) return;
          const nv = Math.max(mn, cur - step);
          saveFn(nv);
          valDisplay.textContent = fmtFn(nv);
          syncBounds(nv);
          onApply(nv);
        });
        incBtn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          const cur = loadFn();
          if (cur >= mx) return;
          const nv = Math.min(mx, cur + step);
          saveFn(nv);
          valDisplay.textContent = fmtFn(nv);
          syncBounds(nv);
          onApply(nv);
        });

        wrap.appendChild(decBtn);
        wrap.appendChild(valDisplay);
        wrap.appendChild(incBtn);

        // Return refs for external reset
        return { wrap, valDisplay, syncBounds };
      }

      const _reposMain = () => { if (panel.classList.contains('open')) requestAnimationFrame(() => positionPanel(panel, navBtnEl)); };

      // ── X / Y nudge ────────────────────────────────────────────────────────
      const nudgeRow = document.createElement('div');
      const nudgeLbl = document.createElement('div');
      nudgeLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
      nudgeLbl.innerHTML = '<span>X / Y Offset Nudge</span>';
      const nudgeResetBtn = mkBtn('Reset', 'tcws-btn xs');
      nudgeLbl.appendChild(nudgeResetBtn);
      nudgeRow.appendChild(nudgeLbl);

      const nudgeNote = document.createElement('div');
      nudgeNote.style.cssText = 'font-size:10px;color:var(--t-text3);margin-bottom:10px;line-height:1.5';
      nudgeNote.textContent = `Fine-tune position in ${NM_W_STEP}px steps. Default: X = +${NM_OX_DEFAULT}px, Y = ${NM_OY_DEFAULT}px. Decrease = left/up · Increase = right/down.`;
      nudgeRow.appendChild(nudgeNote);

      // X stepper
      const xRowWrap = document.createElement('div');
      xRowWrap.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
      const xLblEl = document.createElement('span');
      xLblEl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);min-width:22px;flex-shrink:0';
      xLblEl.textContent = 'X';
      const { wrap: xStepWrap, valDisplay: xValDisplay, syncBounds: xSyncBounds } = mkStepper(
        loadNMOffsetX, saveNMOffsetX, NM_OX_MIN, NM_OX_MAX, 5,
        v => (v >= 0 ? '+' : '') + v + 'px',
        _reposMain
      );
      xRowWrap.appendChild(xLblEl); xRowWrap.appendChild(xStepWrap);
      nudgeRow.appendChild(xRowWrap);

      // Y stepper
      const yRowWrap = document.createElement('div');
      yRowWrap.style.cssText = 'display:flex;align-items:center;gap:10px';
      const yLblEl = document.createElement('span');
      yLblEl.style.cssText = 'font-size:11px;font-weight:700;color:var(--t-text2);min-width:22px;flex-shrink:0';
      yLblEl.textContent = 'Y';
      const { wrap: yStepWrap, valDisplay: yValDisplay, syncBounds: ySyncBounds } = mkStepper(
        loadNMOffsetY, saveNMOffsetY, NM_OY_MIN, NM_OY_MAX, 5,
        v => (v >= 0 ? '+' : '') + v + 'px',
        _reposMain
      );
      yRowWrap.appendChild(yLblEl); yRowWrap.appendChild(yStepWrap);
      nudgeRow.appendChild(yRowWrap);

      nudgeResetBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        saveNMOffsetX(NM_OX_DEFAULT); saveNMOffsetY(NM_OY_DEFAULT);
        xValDisplay.textContent = (NM_OX_DEFAULT >= 0 ? '+' : '') + NM_OX_DEFAULT + 'px';
        yValDisplay.textContent = (NM_OY_DEFAULT >= 0 ? '+' : '') + NM_OY_DEFAULT + 'px';
        xSyncBounds(NM_OX_DEFAULT); ySyncBounds(NM_OY_DEFAULT);
        _reposMain();
      });

      placementBlock.appendChild(nudgeRow);

      // ── Reset all placement ────────────────────────────────────────────────
      const placementResetRow = document.createElement('div');
      placementResetRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:4px';
      const placementResetAllBtn = mkBtn('Reset All Placement to Defaults', 'tcws-btn xs');
      placementResetAllBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        saveNMSide('auto'); saveNMVAlign('auto');
        saveNMOffsetX(NM_OX_DEFAULT); saveNMOffsetY(NM_OY_DEFAULT);
        xValDisplay.textContent = (NM_OX_DEFAULT >= 0 ? '+' : '') + NM_OX_DEFAULT + 'px';
        yValDisplay.textContent = (NM_OY_DEFAULT >= 0 ? '+' : '') + NM_OY_DEFAULT + 'px';
        xSyncBounds(NM_OX_DEFAULT); ySyncBounds(NM_OY_DEFAULT);
        // Refresh seg groups visually
        [{ wrap: valignWrap, defaultVal: 'auto', opts: [{ value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }] }
        ].forEach(({ wrap, defaultVal, opts }) => {
          wrap.querySelectorAll('.tcws-btn').forEach((b, i) => {
            const active = opts[i]?.value === defaultVal;
            b.dataset.on    = active ? '1' : '0';
            b.style.background  = active ? 'var(--t-accent-dim)' : 'var(--t-btn-bg)';
            b.style.borderColor = active ? 'var(--t-accent-brd)' : 'var(--t-border2)';
            b.style.color       = active ? 'var(--t-accent-txt)' : 'var(--t-text2)';
          });
        });
        _reposMain();
      });
      placementResetRow.appendChild(placementResetAllBtn);
      placementBlock.appendChild(placementResetRow);

      sc.appendChild(placementBlock);
    }

    function renderSettings() {
      body.innerHTML = '';

      const stBar = document.createElement('div'); stBar.className = 'tcws-stab-bar';
      const STABS = [
        { key: 'overview',  label: 'Overview'  },
        { key: 'refresh',   label: 'Refresh'   },
        { key: 'watchlist', label: 'Watchlist' },
        { key: 'notifs',    label: 'Alerts'    },
        { key: 'views',     label: 'Views'     },
        { key: 'theme',     label: 'Theme'     },
        { key: 'display',   label: 'Display'   },
        { key: 'features',  label: 'Features'  },
      ];
      for (const st of STABS) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tcws-stab'; btn.textContent = st.label;
        btn.dataset.on = st.key === activeSettingsTab ? '1' : '0';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          activeSettingsTab = st.key; renderSettings();
        });
        stBar.appendChild(btn);
      }
      body.appendChild(stBar);

      const sc = document.createElement('div'); sc.className = 'tcws-stab-content';
      body.appendChild(sc);

      if      (activeSettingsTab === 'overview')  renderSettingsOverview(sc);
      else if (activeSettingsTab === 'refresh')   renderSettingsRefresh(sc);
      else if (activeSettingsTab === 'watchlist') renderSettingsWatchlist(sc);
      else if (activeSettingsTab === 'notifs')    renderSettingsNotifs(sc);
      else if (activeSettingsTab === 'views')     renderSettingsViews(sc);
      else if (activeSettingsTab === 'display')   renderSettingsDisplay(sc);
      else if (activeSettingsTab === 'features')  renderSettingsFeatures(sc);
      else                                        renderSettingsTheme(sc);
    }

    // ── Master render ────────────────────────────────────────────────────────────
    function render() {
      if      (activeTab === 'alerts')    renderAlerts();
      else if (activeTab === 'calls')     renderCalls();
      else if (activeTab === 'sites')     renderSites();
      else if (activeTab === 'resolved')  renderResolved();
      else if (activeTab === 'assigned')  renderAssigned();
      else                                renderSettings();
      _syncPanelPeripheral();
      _updateRingUI();
    }

    showTab(activeTab);
    panel._render = () => render();
    panel._applyTabVisibility = _applyTabVisibility;
    return panel;
  }

  // ─── Panel positioning + management ──────────────────────────────────────────
  function positionPanel(panel, anchor) {
    panel.style.visibility = 'hidden'; panel.classList.add('open');
    try {
      const rect = anchor.getBoundingClientRect();
      // Compensate for CSS zoom: offsetWidth/Height report pre-zoom logical size
      const scale = loadScale();
      const pw = (panel.offsetWidth  || NM_W_DEFAULT) * scale;
      const ph = (panel.offsetHeight || 400) * scale;
      const side   = loadNMSide();
      const valign = loadNMVAlign();
      const ox     = loadNMOffsetX();
      const oy     = loadNMOffsetY();

      // ── Horizontal placement ──────────────────────────────────────────────────
      let left;
      if (side === 'left')  {
        left = rect.left - pw - 10;
      } else if (side === 'right') {
        left = rect.right + 10;
      } else {
        // auto: prefer right of anchor, fall back to left if it overflows
        left = rect.right + 10;
        if (left + pw > window.innerWidth - 8) left = Math.max(8, rect.left - pw - 10);
      }

      // ── Vertical placement ───────────────────────────────────────────────────
      let top;
      if (valign === 'top') {
        top = 8;
      } else if (valign === 'middle') {
        top = Math.max(8, Math.round((window.innerHeight - ph) / 2));
      } else if (valign === 'bottom') {
        top = window.innerHeight - ph - 8;
      } else {
        // auto: align to anchor top, clamp to viewport
        top = rect.top;
        if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
        if (top < 8) top = 8;
      }

      // ── Apply nudge offsets, clamped so panel stays on-screen ────────────────
      left = Math.max(0, Math.min(window.innerWidth  - 40, left + ox));
      top  = Math.max(0, Math.min(window.innerHeight - 40, top  + oy));

      panel.style.left = `${left}px`;
      panel.style.top  = `${top}px`;
    } finally {
      // Always clear visibility so a thrown error never leaves the panel invisible
      panel.style.visibility = '';
    }
  }
  function openThePanel()   { if (!panelEl || !navBtnEl) return; applyNMWidth(panelEl); applyScale(panelEl); positionPanel(panelEl, navBtnEl); panelEl._render(); updateNavBtn(); }
  function closeThePanel()  { panelEl?.classList.remove('open'); closeDetailPanel(); _closeAgentPicker(); updateNavBtn(); }
  function toggleThePanel() { if (panelEl?.classList.contains('open')) closeThePanel(); else openThePanel(); }

  document.addEventListener('mousedown', e => {
    if (!panelEl?.classList.contains('open')) return;
    const inMain   = panelEl.contains(e.target) || navBtnEl?.contains(e.target);
    const inDetail = detailPanelEl?.contains(e.target);
    // fields panel is now embedded inside detailPanelEl, but keep legacy check too
    const inFields = fieldsPanelEl?.contains(e.target);
    const inPicker = document.getElementById('tcws-agent-picker')?.contains(e.target);
    // Combo dropdowns are appended to body — don't close panel when user clicks them
    const inCombo   = !!e.target.closest?.('.tcws-combo-dropdown');
    const inLightbox = !!e.target.closest?.('#tcws-media-lightbox, #tcws-media-grid-overlay');
    if (inMain || inDetail || inFields || inPicker || inCombo || inLightbox) return;
    closeThePanel();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // If a media lightbox/grid is open, close it instead of the whole panel
    const lb = document.getElementById('tcws-media-lightbox') || document.getElementById('tcws-media-grid-overlay');
    if (lb) { lb.remove(); return; }
    closeThePanel();
  });

  // ─── Hotkey engine — reads config from loadHotkey() each press ───────────────
  let _hkLastTime = 0;
  document.addEventListener('keydown', e => {
    // Never fire while typing in an input / textarea / contenteditable
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

    const hk = loadHotkey();

    if (hk.type === 'double') {
      // Double-tap a bare modifier key — ignore if any OTHER modifier is held
      // so Ctrl+C etc. never accidentally trigger
      const modMap = { Control: 'ctrlKey', Alt: 'altKey', Shift: 'shiftKey' };
      if (e.key !== hk.key) return;
      // Make sure no other modifier is held alongside the tapped key
      const others = Object.entries(modMap).filter(([k]) => k !== hk.key).map(([, p]) => p);
      if (others.some(p => e[p])) return;
      const now = Date.now();
      if (now - _hkLastTime < 400) { toggleThePanel(); _hkLastTime = 0; }
      else { _hkLastTime = now; }

    } else {
      // Combo — must match exact modifier state + key
      if (e.key !== hk.key) return;
      if (!!e.ctrlKey  !== !!hk.ctrl)  return;
      if (!!e.altKey   !== !!hk.alt)   return;
      if (!!e.shiftKey !== !!hk.shift) return;
      // Block for keys that have critical browser meanings when used with these modifiers
      // (e.g. Ctrl+W, Ctrl+T, Ctrl+R — only combo type can set non-modifier keys anyway)
      e.preventDefault();
      toggleThePanel();
    }
  });

  // ─── Click-to-clear DOT ───────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const a  = e.target?.closest?.('a[href^="/agent/filters/"]');
    const vk = a ? getViewKey(a.getAttribute('href')) : null;
    if (!vk) return;
    clearDot(vk);
    if (loadAutoDismiss()) clearAlert(vk);
  }, true);

  // ─── Install ──────────────────────────────────────────────────────────────────
  function ensureUI() {
    if (!isAgentRoute() || document.querySelector('[data-tcws-nav-li]')) return;
    const navList = document.querySelector(NAV_LIST_SEL);
    if (!navList) return;
    ensureStyles();
    panelEl = buildPanel();
    const { li, btn } = buildNavButton(); navBtnEl = btn;
    // zendesk_icon is a bare <div> in <nav> (not in a <li>), so we simply append
    // to the first nav list — this places the button after Admin, which is correct.
    navList.appendChild(li);
    // Apply saved UI scale and width immediately so first open is already correct
    applyNMWidth(panelEl);
    applyScale(panelEl);
    // v1.3.0: No DOM baseline needed — first scan() will store counts from API.
    // Pre-warm the views cache in the background so it's ready for the first scan.
    fetchAndCacheViews().catch(() => {});
    if (loadEn()) startAR(loadMs());
    if (featEnabled('watchlist'))    startWatchPolling(loadWatchInt());
    if (featEnabled('queueMonitor')) startQueueMonitorPoll(60_000);
    if (featEnabled('calls'))        startCallsApiPoll();
    if (featEnabled('sites'))        startSiteViewPoll();
    updateNavBtn();
    ensureViewsTicker();
    // Kick off user + groups fetch in background (groups need user ID first)
    fetchCurrentUser().then(async () => {
      const chip = document.getElementById('tcws-user-chip');
      if (chip && currentUser) chip.textContent = currentUser.name || '';
      // Now fetch user-specific groups (requires currentUser.id)
      await fetchGroups();
      // Hydrate agent photo for current user
      if (currentUser?.id && currentUser?.photoUrl === undefined) {
        try {
          const r = await fetch(`/api/v2/users/${currentUser.id}.json`, { credentials: 'same-origin' });
          if (r.ok) {
            const j = await r.json();
            currentUser.photoUrl = j.user?.photo?.content_url || null;
          }
        } catch {}
      }
      if (featEnabled('teamBar')) startAgentStatusPoll();
    });
  }

  // ─── SPA hooks ────────────────────────────────────────────────────────────────
  const fireSpa = () => window.dispatchEvent(new Event('tcws_nav'));
  const _origPush = history.pushState, _origRepl = history.replaceState;
  history.pushState    = function () { const r = _origPush.apply(this, arguments); fireSpa(); return r; };
  history.replaceState = function () { const r = _origRepl.apply(this, arguments); fireSpa(); return r; };
  window.addEventListener('popstate',   fireSpa, true);
  window.addEventListener('hashchange', fireSpa, true);
  window.addEventListener('tcws_nav', () => {
    if (bootDebounce) clearTimeout(bootDebounce);
    bootDebounce = setTimeout(() => { ensureUI(); scheduleScan(); }, 250);
  }, true);

  let _viewsObserver   = null;
  let _viewsObserved   = null;
  let _attachDebounce  = null;
  let _dotRefreshTimer = null;

  // v1.3.0: The views-pane observer is only used to keep sidebar dots in sync
  // when Zendesk re-renders the sidebar. Scans are driven by the API poll timer.
  //
  // CRITICAL: setDot/ensureDot appends <span data-tcws-dot> nodes INTO the
  // views pane. Without filtering, each refreshDots() call modifies the pane,
  // re-fires the observer, calls refreshDots() again → infinite loop / page lock.
  // Fix: skip mutations where every changed node belongs to our own dot elements.
  function _isTcwsMutation(mutations) {
    return mutations.every(m => {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (!nodes.length) {
        // characterData — check target ancestry
        return !!(m.target.closest && (m.target.closest('[data-tcws-dot]') || m.target.parentElement && m.target.parentElement.closest('[data-tcws-dot]')));
      }
      return nodes.every(n => {
        if (n.nodeType !== 1) return true; // text/comment nodes — safe to ignore
        return !!(n.getAttribute && n.getAttribute('data-tcws-dot') || n.closest && n.closest('[data-tcws-dot]'));
      });
    });
  }

  function _attachViewsObserver() {
    if (_attachDebounce) clearTimeout(_attachDebounce);
    _attachDebounce = setTimeout(() => {
      const pane = document.querySelector(VIEWS_PANE_SEL);
      if (!pane || pane === _viewsObserved) return;
      if (_viewsObserver) _viewsObserver.disconnect();
      _viewsObserved = pane;
      _viewsObserver = new MutationObserver(mutations => {
        if (_isTcwsMutation(mutations)) return; // ignore our own dot mutations
        if (_dotRefreshTimer) clearTimeout(_dotRefreshTimer);
        _dotRefreshTimer = setTimeout(() => { refreshDots(); }, 200);
      });
      _viewsObserver.observe(pane, { childList: true, subtree: true });
    }, 300);
  }
  new MutationObserver(_attachViewsObserver).observe(document.body, { childList: true, subtree: true });
  _attachViewsObserver();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleScan(); });

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  // Zendesk renders its nav bar asynchronously. Retry every 300ms until both the
  // main nav button AND the apps <ul> (2nd nav list) are in the DOM.
  let _bootRetry = null;
  function _bootWithRetry() {
    ensureUI();
    ensureNavSidebar(); // positions + button as soon as apps ul exists — no API needed
    const installed = !!document.querySelector('[data-tcws-nav-li]');
    if (!installed) {
      _bootRetry = setTimeout(_bootWithRetry, 300);
    }
  }
  _bootWithRetry();
  scheduleScan();

})();
