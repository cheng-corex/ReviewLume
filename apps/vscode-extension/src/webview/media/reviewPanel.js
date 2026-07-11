/**
 * ReviewLume Review Panel — Webview frontend
 *
 * ═══════════════════════════════════════════════════════════════════
 * SECURITY: This script runs inside the Webview (untrusted boundary).
 * It never accesses the file system, never runs Git, and never
 * constructs Review Packs. All communication with the extension host
 * goes through the validated message bridge.
 *
 * No eval, new Function, or inline event handlers are used.
 * ═══════════════════════════════════════════════════════════════════
 */
/* eslint-env browser */
/* global acquireVsCodeApi */
(function () {
  'use strict';

  // ─── VSCode API ──────────────────────────────────────────────────
  var vscode = acquireVsCodeApi();

  // ─── State ───────────────────────────────────────────────────────
  var currentState = null;

  // ─── Collapse state ──────────────────────────────────────────────
  var collapsedSections = {
    files: false,
    scanResults: false,
    preview: false,
  };

  // ─── DOM refs ────────────────────────────────────────────────────
  var app = document.getElementById('app');

  // ─── Helpers ─────────────────────────────────────────────────────
  function $$(selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  }

  function createElement(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      if (attrs.className) el.className = attrs.className;
      if (attrs.textContent) el.textContent = attrs.textContent;
      if (attrs.innerHTML) el.innerHTML = attrs.innerHTML;
      if (attrs.onclick) el.addEventListener('click', attrs.onclick);
      if (attrs.disabled) el.disabled = true;
      if (attrs.id) el.id = attrs.id;
    }
    return el;
  }

  function postMessage(message) {
    vscode.postMessage(message);
  }

  // ─── Render ──────────────────────────────────────────────────────
  function render(state) {
    currentState = state;

    if (!state || !state.hasSession) {
      renderEmptyState();
      return;
    }

    app.innerHTML = '';
    app.appendChild(renderSummaryBar(state));
    app.appendChild(renderActionsBar(state));
    app.appendChild(renderSection(
      'Files',
      'files',
      collapsedSections.files,
      () => renderFileTree(state),
    ));
    app.appendChild(renderSection(
      'Scan Results',
      'scanResults',
      collapsedSections.scanResults,
      () => renderFindings(state),
    ));
    app.appendChild(renderSection(
      'Review Prompt Preview',
      'preview',
      collapsedSections.preview,
      () => renderPreview(state),
    ));

    // Bind collapse toggles
    $$('.section-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var key = header.dataset.sectionKey;
        if (!key) return;
        collapsedSections[key] = !collapsedSections[key];
        render(currentState);
      });
    });
  }

  function renderEmptyState() {
    app.innerHTML =
      '<div class="empty-state">' +
        '<h2>No Active Review Session</h2>' +
        '<p>Create a new Review Pack to start a review session. ' +
        'Use the "Create Review Pack" action from the ReviewLume sidebar ' +
        'or the Command Palette.</p>' +
      '</div>';
  }

  function renderSummaryBar(state) {
    var bar = createElement('div', { className: 'summary-bar' });
    bar.innerHTML =
      '<div class="summary-item">' +
        '<span class="summary-label">Repository</span>' +
        '<span class="summary-value repository">' + escapeHtml(state.repositoryDisplayName) + '</span>' +
      '</div>' +
      '<div class="summary-item">' +
        '<span class="summary-label">Selected Files</span>' +
        '<span class="summary-value">' + state.selectedCount + ' / ' + state.totalCount + '</span>' +
      '</div>' +
      '<div class="summary-item">' +
        '<span class="summary-label">Scan Status</span>' +
        '<span class="summary-value">' + (state.hasScanResult ? renderScanBadge(state) : '<span class="status-badge neutral">Not scanned</span>') + '</span>' +
      '</div>' +
      '<div class="summary-item">' +
        '<span class="summary-label">Export</span>' +
        '<span class="summary-value">' + (state.canExport ? '<span class="status-badge passed">Ready</span>' : '<span class="status-badge failed">Blocked</span>') + '</span>' +
      '</div>' +
      '<div class="summary-item">' +
        '<span class="summary-label">Est. Size</span>' +
        '<span class="summary-value">' + formatBytes(state.reviewPackByteLength) + '</span>' +
      '</div>' +
      '<div class="summary-item">' +
        '<span class="summary-label">Est. Tokens</span>' +
        '<span class="summary-value">' + state.estimatedTokens.toLocaleString() + '</span>' +
      '</div>';
    return bar;
  }

  function renderScanBadge(state) {
    if (state.canExport) {
      return '<span class="status-badge passed">Passed</span>';
    }
    var reasons = [];
    if (state.hardBlockCount > 0) reasons.push(state.hardBlockCount + ' HARD_BLOCK');
    if (state.blockCount > 0) reasons.push(state.blockCount + ' BLOCK');
    if (state.warnCount - state.confirmedWarnCount > 0) reasons.push((state.warnCount - state.confirmedWarnCount) + ' unconfirmed WARN');
    return '<span class="status-badge failed">' + escapeHtml(reasons.join(', ')) + '</span>';
  }

  function renderActionsBar(state) {
    var bar = createElement('div', { className: 'actions-bar' });
    var canExport = state.canExport && state.hasScanResult && state.reviewPackByteLength > 0;

    bar.innerHTML =
      '<button class="btn" data-action="createReviewPack">Create Review Pack</button>' +
      '<button class="btn" data-action="addRelatedFiles">Add Related Files</button>' +
      '<button class="btn" data-action="recommendTestFiles">Recommend Test Files</button>' +
      '<button class="btn btn-warning" data-action="scan">Scan Selected Files</button>' +
      '<button class="btn btn-primary" data-action="export"' + (canExport ? '' : ' disabled') + '>Export Review Pack</button>' +
      '<button class="btn" data-action="copyPrompt"' + (state.reviewPackByteLength > 0 ? '' : ' disabled') + '>Copy Review Prompt</button>' +
      '<button class="btn" data-action="updateGitignore">Add to .gitignore</button>' +
      '<button class="btn" data-action="refresh">Refresh</button>';

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;

      var action = btn.dataset.action;
      if (action === 'createReviewPack') postMessage({ type: 'createReviewPack' });
      else if (action === 'addRelatedFiles') postMessage({ type: 'addRelatedFiles' });
      else if (action === 'recommendTestFiles') postMessage({ type: 'recommendTestFiles' });
      else if (action === 'scan') postMessage({ type: 'scan' });
      else if (action === 'export') postMessage({ type: 'export' });
      else if (action === 'copyPrompt') postMessage({ type: 'copyPrompt' });
      else if (action === 'updateGitignore') postMessage({ type: 'updateGitignore' });
      else if (action === 'refresh') postMessage({ type: 'refresh' });
    });

    return bar;
  }

  function renderSection(key, sectionKey, isCollapsed, contentFn) {
    var section = createElement('div', { className: 'review-section' });
    var header = createElement('div', {
      className: 'section-header' + (isCollapsed ? ' collapsed' : ''),
      textContent: key,
    });
    header.dataset.sectionKey = sectionKey;

    var collapseIcon = createElement('span', {
      className: 'collapse-icon',
      textContent: '\u25BC',
    });
    header.prepend(collapseIcon);

    var body = createElement('div', {
      className: 'section-body' + (isCollapsed ? ' hidden' : ''),
    });
    if (!isCollapsed && contentFn) {
      body.appendChild(contentFn());
    }

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  function renderFileTree(state) {
    var tree = createElement('ul', { className: 'file-tree' });
    var entries = state.files || [];

    if (entries.length === 0) {
      var empty = createElement('li', {
        textContent: 'No files in the current review.',
        className: 'file-item',
      });
      tree.appendChild(empty);
      return tree;
    }

    // Build tree structure from flat paths
    var treeData = buildFileTree(entries);

    function renderNode(node) {
      if (node.isDir) {
        var dirLi = createElement('li', { className: 'file-item' });
        dirLi.style.fontWeight = '600';
        dirLi.textContent = node.name + '/';
        dirLi.dataset.path = node.path;
        dirLi.addEventListener('click', function () {
          // Toggle all files under this directory
          var expanded = dirLi.getAttribute('data-expanded') !== 'true';
          dirLi.setAttribute('data-expanded', String(expanded));

          var childContainer = dirLi.querySelector('.dir-children');
          if (!childContainer) return;
          var checkboxes = childContainer.querySelectorAll('.file-checkbox');
          checkboxes.forEach(function (cb) {
            cb.checked = expanded;
          });
          // Send toggle for each file in this directory
          entries.filter(function (f) {
            return f.path === node.path || f.path.startsWith(node.path + '/');
          }).forEach(function (f) {
            if (f.selected !== expanded) {
              postMessage({ type: 'toggleFile', filePath: f.path, selected: expanded });
            }
          });
        });

        var childrenContainer = createElement('ul', {
          className: 'dir-children',
        });
        childrenContainer.style.paddingLeft = '16px';
        childrenContainer.style.listStyle = 'none';

        (node.children || []).forEach(function (child) {
          childrenContainer.appendChild(renderNode(child));
        });

        dirLi.appendChild(childrenContainer);
        return dirLi;
      }

      var fileLi = createElement('li', { className: 'file-item' });
      var cb = createElement('input', {
        className: 'checkbox file-checkbox',
      });
      cb.type = 'checkbox';
      cb.checked = node.selected;
      cb.addEventListener('change', function () {
        postMessage({ type: 'toggleFile', filePath: node.path, selected: cb.checked });
      });

      var pathSpan = createElement('span', {
        className: 'file-path',
        textContent: node.path,
      });

      var sourceSpan = createElement('span', {
        className: 'file-source',
        textContent: node.sourceLabel,
      });

      var statusSpan = createElement('span', {
        className: 'file-status',
        textContent: node.statusLabel,
      });

      fileLi.appendChild(cb);
      fileLi.appendChild(pathSpan);
      fileLi.appendChild(sourceSpan);
      fileLi.appendChild(statusSpan);
      return fileLi;
    }

    treeData.forEach(function (node) {
      tree.appendChild(renderNode(node));
    });

    return tree;
  }

  function buildFileTree(entries) {
    var root = [];

    entries.forEach(function (entry) {
      var parts = entry.path.split('/');
      var current = root;

      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var isLast = i === parts.length - 1;

        if (isLast) {
          // File node
          var changeDesc = entry.changeKinds && entry.changeKinds.length > 0
            ? entry.changeKinds.join(', ')
            : 'unchanged';
          var sourceLabel = entry.source === 'manual' ? 'related'
            : entry.source === 'recommended' ? 'test'
            : 'changed';
          var statusLabel = entry.exists ? changeDesc : changeDesc + ', deleted';

          current.push({
            name: part,
            path: entry.path,
            selected: entry.selected,
            isDir: false,
            sourceLabel: sourceLabel,
            statusLabel: statusLabel,
          });
        } else {
          // Directory segment
          var existing = current.filter(function (n) { return n.isDir && n.name === part; });
          if (existing.length > 0) {
            current = existing[0].children;
          } else {
            var dir = { name: part, path: parts.slice(0, i + 1).join('/'), isDir: true, children: [] };
            current.push(dir);
            current = dir.children;
          }
        }
      }
    });

    return root;
  }

  function renderFindings(state) {
    var container = createElement('div', { className: 'findings-list' });
    var findings = state.findings || [];

    if (!state.hasScanResult || findings.length === 0) {
      var p = createElement('p', {
        textContent: 'No scan results yet. Run "Scan Selected Files" to check for sensitive content.',
        style: 'color: var(--text-secondary); padding: var(--space-sm);',
      });
      return p;
    }

    var levels = [
      { key: 'HARD_BLOCK', label: 'HARD_BLOCK (' + state.hardBlockCount + ')', level: 'hard_block' },
      { key: 'BLOCK', label: 'BLOCK (' + state.blockCount + ')', level: 'block' },
      { key: 'WARN', label: 'WARN (' + state.warnCount + ', ' + state.confirmedWarnCount + ' confirmed)', level: 'warn' },
      { key: 'INFO', label: 'INFO (' + state.infoCount + ')', level: 'info' },
    ];

    levels.forEach(function (levelDef) {
      var levelFindings = findings.filter(function (f) { return f.level === levelDef.key; });
      if (levelFindings.length === 0) return;

      var group = createElement('div', { className: 'finding-group' });
      var header = createElement('div', {
        className: 'finding-group-header level-' + levelDef.level,
        textContent: levelDef.label,
      });
      header.dataset.expanded = 'true';
      header.addEventListener('click', function () {
        var expanded = header.dataset.expanded === 'true';
        header.dataset.expanded = String(!expanded);
        var body = group.querySelector('.finding-group-body');
        if (body) {
          body.style.display = expanded ? 'none' : '';
        }
      });

      var body = createElement('div', { className: 'finding-group-body' });

      levelFindings.forEach(function (finding) {
        var item = createElement('div', { className: 'finding-item' });

        var meta = createElement('div', { className: 'finding-meta' });
        meta.innerHTML =
          '<span class="finding-file">' + escapeHtml(finding.file) + '</span>' +
          '<span class="finding-line">:' + finding.line + ':' + finding.column + '</span>' +
          '<span class="finding-rule">' + escapeHtml(finding.rule) + '</span>';

        var msgSpan = createElement('div', {
          className: 'finding-message',
          textContent: finding.message,
        });

        var previewSpan = createElement('div', {
          className: 'finding-preview',
          textContent: finding.preview,
        });

        item.appendChild(meta);
        item.appendChild(msgSpan);
        item.appendChild(previewSpan);

        // Show confirm button for unresolved WARN findings
        if (levelDef.key === 'WARN' && !finding.confirmed) {
          var actions = createElement('div', { className: 'finding-actions' });
          var confirmBtn = createElement('button', {
            className: 'btn btn-sm btn-warning',
            textContent: 'Confirm WARN',
            onclick: function () {
              postMessage({ type: 'confirmWarning', findingIds: [finding.id] });
            },
          });
          actions.appendChild(confirmBtn);
          item.appendChild(actions);
        }

        body.appendChild(item);
      });

      group.appendChild(header);
      group.appendChild(body);
      container.appendChild(group);
    });

    return container;
  }

  function renderPreview(state) {
    var preview = createElement('div', { className: 'preview-area' });

    var header = createElement('div', { className: 'preview-header' });
    header.innerHTML =
      '<span>REVIEW_REQUEST.md</span>' +
      '<div class="preview-stats">' +
        '<span>' + state.reviewPackCharLength.toLocaleString() + ' chars</span>' +
        '<span>' + formatBytes(state.reviewPackByteLength) + '</span>' +
        '<span>' + state.estimatedTokens.toLocaleString() + ' tokens</span>' +
      '</div>';

    var body = createElement('div', { className: 'preview-body' });
    if (state.reviewPackPreview) {
      var pre = createElement('pre');
      pre.textContent = state.reviewPackPreview;
      body.appendChild(pre);
    } else {
      body.textContent = 'No preview available. Create a Review Pack to generate a preview.';
      body.style.padding = 'var(--space-md)';
      body.style.color = 'var(--text-secondary)';
    }

    preview.appendChild(header);
    preview.appendChild(body);

    if (state.reviewPackTruncated && state.truncationMessages.length > 0) {
      var notice = createElement('div', { className: 'preview-truncation-notice' });
      notice.innerHTML = '<strong>Truncated:</strong> ' + escapeHtml(state.truncationMessages.join(', '));
      preview.appendChild(notice);
    }

    return preview;
  }

  // ─── Utilities ───────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  // ─── Message handler ─────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
      case 'state':
        render(message.payload);
        break;

      case 'error':
        showError(message.message);
        break;

      case 'scanComplete':
        render(message.payload);
        break;

      case 'exportComplete':
        showToast('Review Pack exported: ' + message.reviewId);
        break;

      case 'exportError':
        showError(message.message);
        break;

      case 'copyComplete':
        showToast('Review prompt copied to clipboard');
        break;

      default:
        break;
    }
  });

  // ─── Toast notifications ─────────────────────────────────────────
  function showError(msg) {
    var existing = document.querySelector('.error-toast');
    if (existing) existing.remove();

    var toast = createElement('div', {
      className: 'error-toast',
      textContent: msg,
    });
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5000);
  }

  function showToast(msg) {
    var existing = document.querySelector('.error-toast');
    if (existing) existing.remove();

    var toast = createElement('div', {
      className: 'error-toast',
      textContent: msg,
    });
    toast.style.background = 'var(--success)';
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ─── Request initial state ───────────────────────────────────────
  postMessage({ type: 'refresh' });
})();
