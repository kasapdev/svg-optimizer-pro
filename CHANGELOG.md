# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.1] - 2026-09-06

### Fixed

- **Security:** the Before/After rendered preview injected arbitrary
  pasted/uploaded SVG markup directly via `container.innerHTML`. Since
  this tool's entire purpose is accepting SVGs from unknown sources
  (Illustrator/Inkscape exports, uploaded files, pasted markup), a
  malicious SVG containing an event-handler attribute (e.g.
  `<svg onload="…">`, `onerror`, `onclick`) or a `javascript:` URI in an
  `href`/`xlink:href` would execute arbitrary script in the page the
  moment it rendered — a real DOM XSS vector, not merely a display bug.
  Preview rendering now sanitizes a parsed copy of the markup first,
  stripping `<script>` elements, every `on*` event-handler attribute, and
  `javascript:` URIs, before injecting it for display. The actual
  optimized output that gets copied/downloaded is unaffected — only what
  gets live-rendered into the page's DOM is sanitized.
