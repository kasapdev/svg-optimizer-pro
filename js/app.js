/* =====================================================================
   SVG Optimizer Pro — app.js
   Real, from-scratch client-side SVG optimizer: strips comments/editor
   cruft, collapses structural whitespace, rounds numeric precision.
   Classic script (no modules). Depends on window.WUS (core.js).
   ===================================================================== */
(function () {
  'use strict';

  var WUS = window.WUS;
  var STORE_KEY = 'svgopt.state';

  /* ----------------------------- DOM refs ---------------------------- */
  var input          = document.getElementById('input');
  var outputCode      = document.getElementById('outputCode');
  var emptyState       = document.getElementById('emptyState');

  var optStripComments      = document.getElementById('optStripComments');
  var optStripTitleDesc     = document.getElementById('optStripTitleDesc');
  var optStripMetadata      = document.getElementById('optStripMetadata');
  var optCollapseWhitespace = document.getElementById('optCollapseWhitespace');
  var precisionInput        = document.getElementById('precisionInput');

  var statusBadge = document.getElementById('statusBadge');
  var statusText  = document.getElementById('statusText');

  var inputStats  = document.getElementById('inputStats');
  var outputStats = document.getElementById('outputStats');

  var errorPanel   = document.getElementById('errorPanel');
  var errorMsg     = document.getElementById('errorMsg');
  var errorLoc     = document.getElementById('errorLoc');
  var errorContext = document.getElementById('errorContext');

  var statsBar     = document.getElementById('statsBar');
  var statOriginal = document.getElementById('statOriginal');
  var statOptimized= document.getElementById('statOptimized');
  var statSaved    = document.getElementById('statSaved');
  var statPercent  = document.getElementById('statPercent');

  var previewSection     = document.getElementById('previewSection');
  var previewBefore      = document.getElementById('previewBefore');
  var previewAfter       = document.getElementById('previewAfter');
  var previewBeforeMeta  = document.getElementById('previewBeforeMeta');
  var previewAfterMeta   = document.getElementById('previewAfterMeta');

  var fileInput = document.getElementById('fileInput');

  /* The most recently produced optimized output string (copy/download). */
  var lastOutput = '';

  /* =================================================================
     BYTE SIZE helpers — accurate UTF-8 byte counts, not .length
     ================================================================= */
  function byteLength(str) {
    try { return new Blob([str]).size; }
    catch (e) { return new TextEncoder().encode(str).length; }
  }
  function humanBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /* =================================================================
     NUMERIC ROUNDING — regex-based scanner for numbers (incl. negative,
     decimal, scientific notation) inside attribute values, rounded to
     N decimals with trailing zeros / trailing dot trimmed.
     ================================================================= */
  var NUM_RE = /-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?/g;

  function roundNum(numStr, precision) {
    var n = parseFloat(numStr);
    if (isNaN(n)) return numStr;
    var fixed = n.toFixed(precision);
    if (fixed.indexOf('.') !== -1) {
      fixed = fixed.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (fixed === '-0') fixed = '0';
    return fixed;
  }

  /* Attributes whose value is known to be purely numeric/coordinate data.
     Deliberately excludes id/class/fill/stroke/color-ish attributes so we
     never touch hex colors or identifiers. */
  var NUMERIC_ATTRS = new Set([
    'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry',
    'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'dx', 'dy',
    'd', 'points', 'transform', 'viewbox', 'offset',
    'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-miterlimit', 'font-size', 'opacity', 'fill-opacity',
    'stroke-opacity', 'stop-opacity'
  ]);

  /* Only these CSS properties inside a style="" attribute get numeric
     rounding — never color-ish properties (fill/stroke/color/stop-color),
     which could contain digit runs (e.g. hex codes) that must not be
     reinterpreted as numbers. */
  var STYLE_NUMERIC_PROPS = new Set([
    'stroke-width', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-miterlimit', 'font-size', 'opacity', 'fill-opacity',
    'stroke-opacity', 'stop-opacity'
  ]);

  function roundStyleValue(styleStr, precision) {
    return styleStr.split(';').map(function (decl) {
      var idx = decl.indexOf(':');
      if (idx === -1) return decl;
      var prop = decl.slice(0, idx).trim().toLowerCase();
      var val = decl.slice(idx + 1);
      if (STYLE_NUMERIC_PROPS.has(prop)) {
        val = val.replace(NUM_RE, function (m) { return roundNum(m, precision); });
      }
      return decl.slice(0, idx + 1) + val;
    }).join(';');
  }

  /* Scan the serialized SVG string for name="value" attribute pairs and
     round numbers only inside whitelisted numeric attributes / style
     properties. Runs on the string (post-serialization) rather than the
     DOM so it also catches transform()/d path numbers uniformly. */
  function roundNumbersInSvgString(svgString, precision) {
    var attrRe = /([a-zA-Z_:][-\w:.]*)(\s*=\s*)"([^"]*)"/g;
    return svgString.replace(attrRe, function (full, name, eq, value) {
      var lname = name.toLowerCase();
      var newVal;
      if (lname === 'style') {
        newVal = roundStyleValue(value, precision);
      } else if (NUMERIC_ATTRS.has(lname)) {
        newVal = value.replace(NUM_RE, function (m) { return roundNum(m, precision); });
      } else {
        newVal = value;
      }
      return name + eq + '"' + newVal + '"';
    });
  }

  /* =================================================================
     STRUCTURAL CLEANUP — operates on the parsed DOM before serializing
     ================================================================= */
  var CRUFT_PREFIXES = ['inkscape', 'sodipodi', 'dc', 'cc', 'rdf'];
  var TEXT_BEARING_TAGS = ['text', 'tspan', 'textpath', 'tref', 'style', 'script'];

  function isCruftQName(qname) {
    var idx = qname.indexOf(':');
    if (idx === -1) return false;
    return CRUFT_PREFIXES.indexOf(qname.slice(0, idx).toLowerCase()) !== -1;
  }

  function removeComments(doc) {
    var walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT, null, false);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
  }

  function removeTitleDesc(doc) {
    ['title', 'desc'].forEach(function (tag) {
      var list = Array.prototype.slice.call(doc.getElementsByTagName(tag));
      list.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    });
  }

  function removeCruftNamespacedContent(doc) {
    // 1) remove elements whose tag itself is in a cruft namespace
    var all = Array.prototype.slice.call(doc.getElementsByTagName('*'));
    all.forEach(function (el) {
      if (el.parentNode && isCruftQName(el.tagName)) el.parentNode.removeChild(el);
    });
    // 2) remove cruft-namespaced attributes from remaining elements
    var remaining = Array.prototype.slice.call(doc.getElementsByTagName('*'));
    remaining.forEach(function (el) {
      var names = [];
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (isCruftQName(a.name)) names.push(a.name);
      }
      names.forEach(function (n) { el.removeAttribute(n); });
    });
    // 3) explicitly drop xmlns:<cruft prefix> declarations
    var els2 = Array.prototype.slice.call(doc.getElementsByTagName('*'));
    els2.forEach(function (el) {
      CRUFT_PREFIXES.forEach(function (p) {
        var an = 'xmlns:' + p;
        if (el.hasAttribute(an)) el.removeAttribute(an);
      });
    });
  }

  /* Remove <defs>/<metadata> elements that ended up empty (no element
     children and no non-whitespace text) after the cleanup above. */
  function removeEmptyIfNoContent(doc, tagName) {
    var list = Array.prototype.slice.call(doc.getElementsByTagName(tagName));
    list.forEach(function (el) {
      var hasContent = false;
      for (var i = 0; i < el.childNodes.length; i++) {
        var c = el.childNodes[i];
        if (c.nodeType === 1) { hasContent = true; break; }
        if (c.nodeType === 3 && /\S/.test(c.nodeValue)) { hasContent = true; break; }
      }
      if (!hasContent && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function isInsideTextBearing(node) {
    var el = node.parentNode;
    while (el && el.nodeType === 1) {
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      var local = tag.indexOf(':') !== -1 ? tag.split(':').pop() : tag;
      if (TEXT_BEARING_TAGS.indexOf(local) !== -1) return true;
      el = el.parentNode;
    }
    return false;
  }

  /* Remove purely-whitespace text nodes that sit *between* element tags
     (hand-editing indentation), while leaving whitespace inside
     text/tspan/textPath/tref/style/script content completely untouched. */
  function collapseWhitespaceNodes(doc) {
    var walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT, null, false);
    var toStrip = [];
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.length > 0 && /^\s*$/.test(node.nodeValue) && !isInsideTextBearing(node)) {
        toStrip.push(node);
      }
    }
    toStrip.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  }

  /* Remove any remaining xmlns:<prefix> declaration whose prefix is never
     referenced elsewhere in the serialized markup — a generic safety net
     beyond the known Inkscape/Sodipodi/RDF/DC/CC prefixes. */
  function removeUnusedXmlnsDecls(svgString) {
    var declRe = /\s+xmlns:([a-zA-Z_][\w.-]*)="[^"]*"/g;
    var decls = [];
    var m;
    while ((m = declRe.exec(svgString)) !== null) {
      decls.push({ full: m[0], prefix: m[1] });
    }
    decls.forEach(function (d) {
      var withoutDecl = svgString.split(d.full).join('');
      var usedRe = new RegExp(d.prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ':');
      if (!usedRe.test(withoutDecl)) svgString = withoutDecl;
    });
    return svgString;
  }

  /* =================================================================
     CORE OPTIMIZER — parse, clean the DOM, serialize, then apply the
     string-level numeric-rounding pass. Throws on invalid SVG.
     ================================================================= */
  function optimizeSVG(rawInput, opts) {
    var text = rawInput.trim();
    if (!text) throw new Error('EMPTY');

    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'image/svg+xml');

    if (doc.getElementsByTagName('parsererror').length > 0) {
      var pe = doc.getElementsByTagName('parsererror')[0];
      var e = new Error(pe.textContent.trim());
      e.isParseError = true;
      throw e;
    }
    var root = doc.documentElement;
    if (!root || root.tagName.toLowerCase().replace(/^.*:/, '') !== 'svg') {
      throw new Error('Not a valid SVG document — missing an <svg> root element.');
    }

    if (opts.stripComments) removeComments(doc);
    if (opts.stripTitleDesc) removeTitleDesc(doc);
    if (opts.stripMetadata) {
      removeCruftNamespacedContent(doc);
      removeEmptyIfNoContent(doc, 'metadata');
      removeEmptyIfNoContent(doc, 'defs');
    }
    if (opts.collapseWhitespace) collapseWhitespaceNodes(doc);

    var serializer = new XMLSerializer();
    var out = serializer.serializeToString(root);

    // Defensive: strip a leading XML prolog if the serializer ever re-adds one.
    out = out.replace(/^\s*<\?xml[^>]*\?>\s*/, '');

    if (opts.stripMetadata) out = removeUnusedXmlnsDecls(out);

    out = roundNumbersInSvgString(out, opts.precision);
    return out.trim();
  }

  /* =================================================================
     ERROR DISPLAY
     ================================================================= */
  function locationFromMessage(message) {
    var m = /line (\d+)[, ]+column (\d+)/i.exec(message) ||
            /line[: ]+(\d+)\D+column[: ]+(\d+)/i.exec(message);
    if (m) return { line: Number(m[1]), column: Number(m[2]) };
    var mLine = /line (\d+)/i.exec(message);
    if (mLine) return { line: Number(mLine[1]), column: null };
    return null;
  }

  function buildContext(text, loc) {
    if (!loc || !loc.line) return '';
    var lines = text.split('\n');
    var idx = loc.line - 1;
    if (idx < 0 || idx >= lines.length) return '';
    var frag = [];
    var start = Math.max(0, idx - 1);
    var end = Math.min(lines.length - 1, idx + 1);
    var gutter = String(end + 1).length;
    for (var i = start; i <= end; i++) {
      var num = String(i + 1).padStart(gutter, ' ');
      var raw = lines[i].length > 140 ? lines[i].slice(0, 140) + '…' : lines[i];
      var isErr = i === idx;
      var prefix = (isErr ? '▸ ' : '  ') + num + ' │ ';
      frag.push('<span class="' + (isErr ? 'err-line' : 'muted') + '">' +
        WUS.escapeHtml(prefix + raw) + '</span>');
      if (isErr && loc.column) {
        var caretPad = ' '.repeat(prefix.length + Math.max(0, loc.column - 1));
        frag.push('<span class="caret">' + WUS.escapeHtml(caretPad) + '^</span>');
      }
    }
    return frag.join('\n');
  }

  function showError(err, text) {
    var message = err && err.message === 'EMPTY' ? 'Input is empty.' : (err && err.message) || 'Could not parse SVG.';
    var loc = locationFromMessage(message);
    errorMsg.textContent = message;

    if (loc && loc.line) {
      errorLoc.hidden = false;
      errorLoc.textContent = loc.column ? ('Line ' + loc.line + ', Col ' + loc.column) : ('Line ' + loc.line);
      var ctx = buildContext(text, loc);
      if (ctx) { errorContext.hidden = false; errorContext.innerHTML = ctx; }
      else { errorContext.hidden = true; }
    } else {
      errorLoc.hidden = true;
      errorContext.hidden = true;
    }

    errorPanel.hidden = false;
    statsBar.hidden = true;
    previewSection.hidden = true;
    setStatus('error', 'Invalid SVG');
  }

  function clearError() {
    errorPanel.hidden = true;
  }

  /* =================================================================
     STATUS / UI helpers
     ================================================================= */
  function setStatus(state, text) {
    statusBadge.classList.remove('is-valid', 'is-error');
    if (state === 'valid') statusBadge.classList.add('is-valid');
    else if (state === 'error') statusBadge.classList.add('is-error');
    statusText.textContent = text;
  }

  function updateInputMeta() {
    var bytes = byteLength(input.value);
    inputStats.textContent = bytes.toLocaleString() + (bytes === 1 ? ' byte' : ' bytes');
  }

  function renderPreview(container, metaEl, svgMarkup, byteCount) {
    container.innerHTML = '';
    try {
      // Already validated via DOMParser upstream; inject directly to render.
      container.innerHTML = svgMarkup;
    } catch (e) {
      container.innerHTML = '<span class="muted">Could not render preview</span>';
    }
    metaEl.textContent = humanBytes(byteCount);
  }

  function clearOutput() {
    lastOutput = '';
    outputCode.textContent = '';
    emptyState.classList.remove('is-hidden');
    outputStats.textContent = '';
    statsBar.hidden = true;
    previewSection.hidden = true;
    previewBefore.innerHTML = '';
    previewAfter.innerHTML = '';
  }

  /* =================================================================
     OPTIONS
     ================================================================= */
  function currentOptions() {
    var precision = WUS.clamp(parseInt(precisionInput.value, 10) || 0, 0, 4);
    return {
      stripComments: optStripComments.checked,
      stripTitleDesc: optStripTitleDesc.checked,
      stripMetadata: optStripMetadata.checked,
      collapseWhitespace: optCollapseWhitespace.checked,
      precision: precision
    };
  }

  /* =================================================================
     MAIN ACTION — optimize the current input and render everything
     ================================================================= */
  function runOptimize(opts_) {
    updateInputMeta();
    var raw = input.value;

    if (!raw.trim()) {
      clearOutput();
      clearError();
      setStatus('', 'Ready');
      persist();
      return;
    }

    var opts = opts_ || currentOptions();

    try {
      var optimized = optimizeSVG(raw, opts);
      clearError();

      lastOutput = optimized;
      outputCode.textContent = optimized;
      emptyState.classList.add('is-hidden');

      var origBytes = byteLength(raw.trim());
      var optBytes = byteLength(optimized);
      var saved = Math.max(0, origBytes - optBytes);
      var pct = origBytes > 0 ? (saved / origBytes) * 100 : 0;

      outputStats.textContent = optimized.split('\n').length + ' lines · ' + humanBytes(optBytes);

      statOriginal.textContent = humanBytes(origBytes);
      statOptimized.textContent = humanBytes(optBytes);
      statSaved.textContent = humanBytes(saved);
      statPercent.textContent = pct.toFixed(1) + '%';
      statsBar.hidden = false;

      renderPreview(previewBefore, previewBeforeMeta, raw.trim(), origBytes);
      renderPreview(previewAfter, previewAfterMeta, optimized, optBytes);
      previewSection.hidden = false;

      setStatus('valid', pct > 0 ? (pct.toFixed(1) + '% smaller') : 'Optimized');
    } catch (err) {
      clearOutput();
      if (err && err.message === 'EMPTY') {
        setStatus('', 'Ready');
      } else {
        showError(err, raw);
        WUS.toast('Invalid SVG — see error panel', 'error');
      }
    }
    persist();
  }

  var debouncedOptimize = WUS.debounce(function () { runOptimize(); }, 350);

  /* =================================================================
     ACTIONS — copy / download / upload / sample / clear
     ================================================================= */
  function copyOutput() {
    if (!lastOutput) { WUS.toast('Nothing to copy yet — optimize first', 'error'); return; }
    WUS.copy(lastOutput, 'Optimized SVG copied to clipboard');
  }

  function downloadOutput() {
    if (!lastOutput) { WUS.toast('Nothing to download yet — optimize first', 'error'); return; }
    var name = 'optimized-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.svg';
    WUS.download(name, lastOutput, 'image/svg+xml;charset=utf-8');
    WUS.toast('Downloaded ' + name);
  }

  function clearAll() {
    input.value = '';
    clearOutput();
    clearError();
    setStatus('', 'Ready');
    updateInputMeta();
    WUS.store.remove(STORE_KEY);
    input.focus();
  }

  function triggerUpload() { fileInput.click(); }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    WUS.readFile(file).then(function (content) {
      input.value = content;
      WUS.toast('Loaded ' + file.name);
      runOptimize();
    }).catch(function () {
      WUS.toast('Could not read file', 'error');
    });
    fileInput.value = '';
  });

  var SAMPLE_SVG =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    '<!-- Created with Inkscape (http://www.inkscape.org/) -->\n' +
    '\n' +
    '<svg\n' +
    '   xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '   xmlns:cc="http://creativecommons.org/ns#"\n' +
    '   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n' +
    '   xmlns:svg="http://www.w3.org/2000/svg"\n' +
    '   xmlns="http://www.w3.org/2000/svg"\n' +
    '   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"\n' +
    '   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"\n' +
    '   width="200"\n' +
    '   height="200"\n' +
    '   viewBox="0 0 200.000000 200.000000"\n' +
    '   version="1.1"\n' +
    '   id="svg8"\n' +
    '   inkscape:version="0.92.4 (5da689c313, 2019-01-14)"\n' +
    '   sodipodi:docname="star.svg">\n' +
    '  <title>Five Point Star</title>\n' +
    '  <desc>A simple decorative star icon, hand-edited in Inkscape.</desc>\n' +
    '  <defs\n' +
    '     id="defs2" />\n' +
    '  <sodipodi:namedview\n' +
    '     id="base"\n' +
    '     pagecolor="#ffffff"\n' +
    '     bordercolor="#666666"\n' +
    '     inkscape:zoom="1.979899"\n' +
    '     inkscape:cx="100"\n' +
    '     inkscape:cy="100" />\n' +
    '  <metadata\n' +
    '     id="metadata5">\n' +
    '    <rdf:RDF>\n' +
    '      <cc:Work\n' +
    '         rdf:about="">\n' +
    '        <dc:format>image/svg+xml</dc:format>\n' +
    '        <dc:type\n' +
    '           rdf:resource="http://purl.org/dc/dcmitype/StillImage" />\n' +
    '        <dc:title></dc:title>\n' +
    '      </cc:Work>\n' +
    '    </rdf:RDF>\n' +
    '  </metadata>\n' +
    '  <!-- the star path itself -->\n' +
    '  <path\n' +
    '     id="path10"\n' +
    '     inkscape:connector-curvature="0"\n' +
    '     style="fill:#f9c80e;stroke:#c48f00;stroke-width:2.000000"\n' +
    '     d="M 100.000000,10.000000 L 123.511000,68.235000 186.635000,72.361000 137.500000,111.765000 154.389000,173.639000 100.000000,138.000000 45.611000,173.639000 62.500000,111.765000 13.365000,72.361000 76.489000,68.235000 Z" />\n' +
    '  <text\n' +
    '     x="100"\n' +
    '     y="195"\n' +
    '     style="font-size:10px;text-anchor:middle"\n' +
    '     id="caption">Sample  star  icon</text>\n' +
    '</svg>\n';

  function loadSample() {
    input.value = SAMPLE_SVG;
    WUS.toast('Sample loaded');
    runOptimize();
  }

  /* =================================================================
     PERSISTENCE — debounced save of input + options, restore on load
     ================================================================= */
  function persist() {
    WUS.store.set(STORE_KEY, {
      input: input.value,
      stripComments: optStripComments.checked,
      stripTitleDesc: optStripTitleDesc.checked,
      stripMetadata: optStripMetadata.checked,
      collapseWhitespace: optCollapseWhitespace.checked,
      precision: precisionInput.value
    });
  }
  var persistDebounced = WUS.debounce(persist, 400);

  function restore() {
    var saved = WUS.store.get(STORE_KEY, null);
    if (!saved) { updateInputMeta(); return; }
    if (typeof saved.input === 'string') input.value = saved.input;
    if (typeof saved.stripComments === 'boolean') optStripComments.checked = saved.stripComments;
    if (typeof saved.stripTitleDesc === 'boolean') optStripTitleDesc.checked = saved.stripTitleDesc;
    if (typeof saved.stripMetadata === 'boolean') optStripMetadata.checked = saved.stripMetadata;
    if (typeof saved.collapseWhitespace === 'boolean') optCollapseWhitespace.checked = saved.collapseWhitespace;
    if (saved.precision !== undefined) precisionInput.value = saved.precision;
    updateInputMeta();
    if (input.value.trim()) runOptimize();
  }

  /* =================================================================
     SHORTCUTS HELP MODAL
     ================================================================= */
  var helpBackdrop = document.getElementById('helpBackdrop');
  var helpClose    = document.getElementById('helpClose');
  var shortcutRows = document.getElementById('shortcutRows');

  var SHORTCUTS = [
    { keys: ['mod', '⏎'], desc: 'Optimize SVG' },
    { keys: ['mod', 'S'], desc: 'Download optimized .svg' },
    { keys: ['?'], desc: 'Show this help' },
    { keys: ['Esc'], desc: 'Close dialog' }
  ];

  function buildShortcutTable() {
    var html = '';
    SHORTCUTS.forEach(function (s) {
      var kbds = s.keys.map(function (k) { return '<kbd>' + WUS.escapeHtml(k) + '</kbd>'; }).join('');
      html += '<tr><td>' + WUS.escapeHtml(s.desc) + '</td><td>' + kbds + '</td></tr>';
    });
    shortcutRows.innerHTML = html;
  }

  function openHelp() { helpBackdrop.hidden = false; helpClose.focus(); }
  function closeHelp() { helpBackdrop.hidden = true; }

  helpClose.addEventListener('click', closeHelp);
  helpBackdrop.addEventListener('click', function (e) {
    if (e.target === helpBackdrop) closeHelp();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !helpBackdrop.hidden) closeHelp();
  });

  var helpBtns = document.querySelectorAll('[data-shortcut-help]');
  for (var i = 0; i < helpBtns.length; i++) helpBtns[i].addEventListener('click', openHelp);

  /* =================================================================
     WIRING
     ================================================================= */
  document.getElementById('btnOptimize').addEventListener('click', function () { runOptimize(); });
  document.getElementById('btnCopy').addEventListener('click', copyOutput);
  document.getElementById('btnDownload').addEventListener('click', downloadOutput);
  document.getElementById('btnUpload').addEventListener('click', triggerUpload);
  document.getElementById('btnSample').addEventListener('click', loadSample);
  document.getElementById('btnClear').addEventListener('click', clearAll);
  document.getElementById('btnSampleEmpty').addEventListener('click', loadSample);

  input.addEventListener('input', function () {
    updateInputMeta();
    debouncedOptimize();
    persistDebounced();
  });

  [optStripComments, optStripTitleDesc, optStripMetadata, optCollapseWhitespace, precisionInput].forEach(function (el) {
    el.addEventListener('change', function () {
      runOptimize();
    });
  });
  precisionInput.addEventListener('input', function () {
    debouncedOptimize();
    persistDebounced();
  });

  // Ctrl/Cmd+Enter inside the textarea = optimize.
  input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runOptimize();
    }
  });

  /* Global keyboard shortcuts via WUS. */
  WUS.registerShortcut('mod+enter', function () { runOptimize(); }, 'Optimize SVG');
  WUS.registerShortcut('mod+s', function () { downloadOutput(); }, 'Download optimized .svg');
  WUS.registerShortcut('?', function () { openHelp(); }, 'Show shortcuts');

  /* =================================================================
     INIT
     ================================================================= */
  buildShortcutTable();
  restore();
})();
