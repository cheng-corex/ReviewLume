/* eslint-env browser */
/* global acquireVsCodeApi */
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();
  var i18n = window.__REVIEWLUME_I18N__ || {};
  var currentState = null;
  var collapsedSections = { files: false, scanResults: false, preview: false };
  var app = document.getElementById('app');

  function text(key, fallback) {
    return typeof i18n[key] === 'string' ? i18n[key] : fallback;
  }

  function createElement(tag, attrs) {
    var el = document.createElement(tag);
    if (!attrs) return el;
    if (attrs.className) el.className = attrs.className;
    if (attrs.textContent !== undefined) el.textContent = attrs.textContent;
    if (attrs.disabled) el.disabled = true;
    if (attrs.id) el.id = attrs.id;
    return el;
  }

  function postMessage(message) {
    vscode.postMessage(message);
  }

  function render(state) {
    currentState = state;
    if (!state || !state.hasSession) {
      renderEmptyState();
      return;
    }

    app.innerHTML = '';
    app.appendChild(renderSummaryBar(state));
    app.appendChild(renderActionsBar(state));
    app.appendChild(renderSection(text('files', 'Files'), 'files', function () {
      return renderFileTree(state);
    }));
    app.appendChild(renderSection(text('scanResults', 'Scan Results'), 'scanResults', function () {
      return renderFindings(state);
    }));
    app.appendChild(renderSection(text('preview', 'Review Prompt Preview'), 'preview', function () {
      return renderPreview(state);
    }));
  }

  function renderEmptyState() {
    app.innerHTML = '';
    var container = createElement('div', { className: 'empty-state' });
    container.appendChild(createElement('h2', {
      textContent: text('noActiveReview', 'No Active Review Session'),
    }));
    container.appendChild(createElement('p', {
      textContent: text('noActiveReviewHelp', 'Create a Review Pack to start a review session.'),
    }));
    app.appendChild(container);
  }

  function summaryItem(label, valueNode) {
    var item = createElement('div', { className: 'summary-item' });
    item.appendChild(createElement('span', { className: 'summary-label', textContent: label }));
    var value = createElement('span', { className: 'summary-value' });
    if (typeof valueNode === 'string') value.textContent = valueNode;
    else value.appendChild(valueNode);
    item.appendChild(value);
    return item;
  }

  function badge(label, kind) {
    return createElement('span', { className: 'status-badge ' + kind, textContent: label });
  }

  function scopeLabel(scope) {
    if (scope === 'full') return text('fullRepository', 'Full Repository');
    if (scope === 'changes') return text('changesOnly', 'Changes Only');
    return text('smartContext', 'Smart Context');
  }

  function renderSummaryBar(state) {
    var bar = createElement('div', { className: 'summary-bar' });
    bar.appendChild(summaryItem(text('repository', 'Repository'), state.repositoryDisplayName));
    bar.appendChild(summaryItem(text('selectedFiles', 'Selected Files'), state.selectedCount + ' / ' + state.totalCount));
    var scopeSummary = scopeLabel(state.reviewScope);
    if (state.reviewScope !== 'changes') {
      scopeSummary += ' · ' + Number(state.scopeContextCount || 0).toLocaleString() + ' ' + text('contextFiles', 'context files');
    }
    bar.appendChild(summaryItem(text('reviewScopeSummary', 'Review Scope'), scopeSummary));
    bar.appendChild(summaryItem(
      text('scanStatus', 'Scan Status'),
      state.hasScanResult ? renderScanBadge(state) : badge(text('notScanned', 'Not scanned'), 'neutral'),
    ));
    bar.appendChild(summaryItem(
      text('exportStatus', 'Export'),
      state.canExport ? badge(text('ready', 'Ready'), 'passed') : badge(text('blocked', 'Blocked'), 'failed'),
    ));
    bar.appendChild(summaryItem(text('estimatedSize', 'Est. Size'), formatBytes(state.reviewPackByteLength)));
    bar.appendChild(summaryItem(text('estimatedTokens', 'Est. Tokens'), Number(state.estimatedTokens || 0).toLocaleString()));
    return bar;
  }

  function renderScanBadge(state) {
    if (state.canExport) return badge(text('passed', 'Passed'), 'passed');
    var reasons = [];
    if (state.hardBlockCount > 0) reasons.push(state.hardBlockCount + ' HARD_BLOCK');
    if (state.blockCount > 0) reasons.push(state.blockCount + ' BLOCK');
    var unresolvedWarns = state.warnCount - state.confirmedWarnCount;
    if (unresolvedWarns > 0) {
      reasons.push(unresolvedWarns + ' ' + text('unconfirmedWarn', 'unconfirmed WARN'));
    }
    return badge(reasons.join(', ') || text('blocked', 'Blocked'), 'failed');
  }

  function actionButton(label, action, className, disabled) {
    var button = createElement('button', {
      className: 'btn' + (className ? ' ' + className : ''),
      textContent: label,
      disabled: disabled,
    });
    button.dataset.action = action;
    return button;
  }

  function renderChoiceControl(options) {
    var control = createElement('div', { className: 'review-option-control' });
    var textContainer = createElement('div', { className: 'review-option-text' });
    textContainer.appendChild(createElement('label', {
      className: 'review-option-label',
      textContent: options.label,
    }));
    textContainer.appendChild(createElement('span', {
      className: 'review-option-help',
      textContent: options.help,
    }));
    var select = createElement('select', { className: 'review-option-select ' + options.className });
    select.setAttribute('aria-label', options.label);
    options.items.forEach(function (entry) {
      var option = createElement('option', { textContent: entry[1] });
      option.value = entry[0];
      select.appendChild(option);
    });
    select.value = options.value;
    select.addEventListener('change', function () {
      options.onChange(select.value);
    });
    control.appendChild(textContainer);
    control.appendChild(select);
    return control;
  }

  function renderReviewScopeControl(state) {
    return renderChoiceControl({
      label: text('reviewScope', 'Review scope'),
      help: text('reviewScopeHelp', 'Smart Context is the default.'),
      className: 'review-scope-select',
      value: state.reviewScope || 'smart',
      items: [
        ['changes', text('changesOnly', 'Changes Only')],
        ['smart', text('smartContext', 'Smart Context')],
        ['full', text('fullRepository', 'Full Repository')],
      ],
      onChange: function (value) {
        postMessage({ type: 'setReviewScope', scope: value });
      },
    });
  }

  function renderExportFormatControl(state) {
    return renderChoiceControl({
      label: text('exportFormat', 'Export format'),
      help: text('exportFormatHelp', 'Applies to automatic export.'),
      className: 'export-format-select',
      value: state.exportFormat || 'markdown',
      items: [
        ['markdown', text('markdown', 'Markdown')],
        ['zip', text('zip', 'ZIP')],
        ['both', text('both', 'Markdown + ZIP')],
      ],
      onChange: function (value) {
        postMessage({ type: 'setExportFormat', format: value });
      },
    });
  }

  function renderActionsBar(state) {
    var bar = createElement('div', { className: 'actions-bar' });
    var canExport = state.canExport && state.hasScanResult && state.reviewPackByteLength > 0;
    bar.appendChild(renderReviewScopeControl(state));
    bar.appendChild(renderExportFormatControl(state));
    bar.appendChild(actionButton(text('createReviewPack', 'Create Review Pack'), 'createReviewPack'));
    bar.appendChild(actionButton(text('addRelatedFiles', 'Add Related Files'), 'addRelatedFiles'));
    bar.appendChild(actionButton(text('recommendTestFiles', 'Recommend Test Files'), 'recommendTestFiles'));
    bar.appendChild(actionButton(text('scanSelectedFiles', 'Scan Selected Files'), 'scan', 'btn-warning'));
    bar.appendChild(actionButton(text('exportReviewPack', 'Export Review Pack'), 'export', 'btn-primary', !canExport));
    bar.appendChild(actionButton(text('copyReviewPrompt', 'Copy Review Prompt'), 'copyPrompt', '', !canExport));
    bar.appendChild(actionButton(text('addToGitignore', 'Add to .gitignore'), 'updateGitignore'));
    bar.appendChild(actionButton(text('refresh', 'Refresh'), 'refresh'));

    bar.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest('[data-action]');
      if (!button || button.disabled) return;
      var action = button.dataset.action;
      var messages = {
        createReviewPack: 'createReviewPack',
        addRelatedFiles: 'addRelatedFiles',
        recommendTestFiles: 'recommendTestFiles',
        scan: 'scan',
        export: 'export',
        copyPrompt: 'copyPrompt',
        updateGitignore: 'updateGitignore',
        refresh: 'refresh',
      };
      if (messages[action]) postMessage({ type: messages[action] });
    });
    return bar;
  }

  function renderSection(label, sectionKey, contentFactory) {
    var section = createElement('div', { className: 'review-section' });
    var collapsed = collapsedSections[sectionKey];
    var header = createElement('div', {
      className: 'section-header' + (collapsed ? ' collapsed' : ''),
    });
    header.appendChild(createElement('span', { className: 'collapse-icon', textContent: '\u25BC' }));
    header.appendChild(document.createTextNode(label));
    header.addEventListener('click', function () {
      collapsedSections[sectionKey] = !collapsedSections[sectionKey];
      render(currentState);
    });
    var body = createElement('div', { className: 'section-body' + (collapsed ? ' hidden' : '') });
    if (!collapsed) body.appendChild(contentFactory());
    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  function renderFileTree(state) {
    var tree = createElement('ul', { className: 'file-tree' });
    var entries = state.files || [];
    if (entries.length === 0) {
      tree.appendChild(createElement('li', { className: 'file-item', textContent: text('noFiles', 'No files in the current review.') }));
      return tree;
    }
    entries.forEach(function (entry) {
      var item = createElement('li', { className: 'file-item' });
      var checkbox = createElement('input', { className: 'checkbox file-checkbox' });
      checkbox.type = 'checkbox';
      checkbox.checked = entry.selected;
      checkbox.addEventListener('change', function () {
        postMessage({ type: 'toggleFile', filePath: entry.path, selected: checkbox.checked });
      });
      item.appendChild(checkbox);
      item.appendChild(createElement('span', { className: 'file-path', textContent: entry.path }));
      item.appendChild(createElement('span', {
        className: 'file-source',
        textContent: entry.source === 'manual'
          ? text('related', 'related')
          : entry.source === 'recommended'
            ? text('recommendedTest', 'test')
            : entry.source === 'context'
              ? text('context', 'context')
              : text('changed', 'changed'),
      }));
      var changeText = entry.changeKinds && entry.changeKinds.length > 0
        ? entry.changeKinds.join(', ')
        : text('unchanged', 'unchanged');
      if (!entry.exists) changeText += ', ' + text('deleted', 'deleted');
      item.appendChild(createElement('span', { className: 'file-status', textContent: changeText }));
      tree.appendChild(item);
    });
    return tree;
  }

  function renderFindings(state) {
    var container = createElement('div', { className: 'findings-list' });
    var findings = state.findings || [];
    if (!state.hasScanResult || findings.length === 0) {
      return createElement('p', { textContent: text('noScanResults', 'No scan results yet.') });
    }

    [
      ['HARD_BLOCK', state.hardBlockCount, 'hard_block'],
      ['BLOCK', state.blockCount, 'block'],
      ['WARN', state.warnCount, 'warn'],
      ['INFO', state.infoCount, 'info'],
    ].forEach(function (definition) {
      var level = definition[0];
      var levelFindings = findings.filter(function (finding) { return finding.level === level; });
      if (levelFindings.length === 0) return;
      var group = createElement('div', { className: 'finding-group' });
      var label = level + ' (' + definition[1];
      if (level === 'WARN') label += ', ' + state.confirmedWarnCount + ' ' + text('confirmed', 'confirmed');
      label += ')';
      group.appendChild(createElement('div', {
        className: 'finding-group-header level-' + definition[2],
        textContent: label,
      }));
      var body = createElement('div', { className: 'finding-group-body' });
      levelFindings.forEach(function (finding) {
        var item = createElement('div', { className: 'finding-item' });
        item.appendChild(createElement('div', {
          className: 'finding-meta',
          textContent: finding.file + ':' + finding.line + ':' + finding.column + ' · ' + finding.rule,
        }));
        item.appendChild(createElement('div', { className: 'finding-message', textContent: finding.message }));
        item.appendChild(createElement('div', { className: 'finding-preview', textContent: finding.preview }));
        if (level === 'WARN' && !finding.confirmed) {
          var actions = createElement('div', { className: 'finding-actions' });
          var confirm = actionButton(text('confirmWarn', 'Confirm WARN'), '', 'btn-sm btn-warning');
          confirm.addEventListener('click', function () {
            postMessage({ type: 'confirmWarning', findingIds: [finding.id] });
          });
          actions.appendChild(confirm);
          item.appendChild(actions);
        }
        body.appendChild(item);
      });
      group.appendChild(body);
      container.appendChild(group);
    });
    return container;
  }

  function renderPreview(state) {
    var preview = createElement('div', { className: 'preview-area' });
    var header = createElement('div', { className: 'preview-header' });
    header.appendChild(createElement('span', { textContent: 'REVIEW_REQUEST.md' }));
    var stats = createElement('div', { className: 'preview-stats' });
    stats.appendChild(createElement('span', { textContent: Number(state.reviewPackCharLength || 0).toLocaleString() + ' ' + text('chars', 'chars') }));
    stats.appendChild(createElement('span', { textContent: formatBytes(state.reviewPackByteLength) }));
    stats.appendChild(createElement('span', { textContent: Number(state.estimatedTokens || 0).toLocaleString() + ' ' + text('tokens', 'tokens') }));
    header.appendChild(stats);
    preview.appendChild(header);

    var body = createElement('div', { className: 'preview-body' });
    if (state.reviewPackPreview) {
      body.appendChild(createElement('pre', { textContent: state.reviewPackPreview }));
    } else {
      body.textContent = text('noPreview', 'No preview available.');
    }
    preview.appendChild(body);

    if (state.reviewPackTruncated && state.truncationMessages.length > 0) {
      preview.appendChild(createElement('div', {
        className: 'preview-truncation-notice',
        textContent: text('truncated', 'Truncated') + ': ' + state.truncationMessages.join(', '),
      }));
    }
    return preview;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB'];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
  }

  function showToast(message, success) {
    var existing = document.querySelector('.error-toast');
    if (existing) existing.remove();
    var toast = createElement('div', {
      className: 'error-toast' + (success ? ' toast-success' : ''),
      textContent: message,
    });
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, success ? 3000 : 5000);
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || !message.type) return;
    if (message.type === 'state') render(message.payload);
    else if (message.type === 'error') showToast(message.message, false);
    else if (message.type === 'copyComplete') showToast(text('copied', 'Review prompt copied to clipboard'), true);
    else if (message.type === 'formatUpdated') showToast(text('formatUpdated', 'Export format updated'), true);
    else if (message.type === 'scopeUpdated') showToast(text('scopeUpdated', 'Review scope updated'), true);
  });

  postMessage({ type: 'refresh' });
})();
