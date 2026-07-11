export type ExportFormat = 'markdown' | 'zip' | 'both';

export function isChineseLanguage(language: string): boolean {
  return language.trim().toLowerCase().startsWith('zh');
}

export interface ReviewPanelStrings {
  readonly htmlLang: string;
  readonly panelTitle: string;
  readonly loading: string;
  readonly repository: string;
  readonly selectedFiles: string;
  readonly scanStatus: string;
  readonly exportStatus: string;
  readonly estimatedSize: string;
  readonly estimatedTokens: string;
  readonly notScanned: string;
  readonly ready: string;
  readonly blocked: string;
  readonly passed: string;
  readonly files: string;
  readonly scanResults: string;
  readonly preview: string;
  readonly noActiveReview: string;
  readonly noActiveReviewHelp: string;
  readonly createReviewPack: string;
  readonly addRelatedFiles: string;
  readonly recommendTestFiles: string;
  readonly scanSelectedFiles: string;
  readonly exportReviewPack: string;
  readonly copyReviewPrompt: string;
  readonly addToGitignore: string;
  readonly refresh: string;
  readonly exportFormat: string;
  readonly exportFormatHelp: string;
  readonly markdown: string;
  readonly zip: string;
  readonly both: string;
  readonly noFiles: string;
  readonly noScanResults: string;
  readonly confirmed: string;
  readonly confirmWarn: string;
  readonly chars: string;
  readonly tokens: string;
  readonly noPreview: string;
  readonly truncated: string;
  readonly copied: string;
  readonly invalidMessage: string;
  readonly genericOperationError: string;
  readonly formatUpdated: string;
  readonly related: string;
  readonly recommendedTest: string;
  readonly changed: string;
  readonly unchanged: string;
  readonly deleted: string;
  readonly unconfirmedWarn: string;
}

const EN: ReviewPanelStrings = {
  htmlLang: 'en', panelTitle: 'ReviewLume Review Panel', loading: 'Loading ReviewLume session…',
  repository: 'Repository', selectedFiles: 'Selected Files', scanStatus: 'Scan Status', exportStatus: 'Export',
  estimatedSize: 'Est. Size', estimatedTokens: 'Est. Tokens', notScanned: 'Not scanned', ready: 'Ready', blocked: 'Blocked', passed: 'Passed',
  files: 'Files', scanResults: 'Scan Results', preview: 'Review Prompt Preview', noActiveReview: 'No Active Review Session',
  noActiveReviewHelp: 'Create a Review Pack from the sidebar or Command Palette to start a review session.',
  createReviewPack: 'Create Review Pack', addRelatedFiles: 'Add Related Files', recommendTestFiles: 'Recommend Test Files',
  scanSelectedFiles: 'Scan Selected Files', exportReviewPack: 'Export Review Pack', copyReviewPrompt: 'Copy Review Prompt',
  addToGitignore: 'Add to .gitignore', refresh: 'Refresh', exportFormat: 'Export format',
  exportFormatHelp: 'Applies to automatic export. Ask Every Time still prompts for a destination.',
  markdown: 'Markdown', zip: 'ZIP', both: 'Markdown + ZIP', noFiles: 'No files in the current review.',
  noScanResults: 'No scan results yet. Run “Scan Selected Files” to check for sensitive content.',
  confirmed: 'confirmed', confirmWarn: 'Confirm WARN', chars: 'chars', tokens: 'tokens',
  noPreview: 'No preview available. Scan the selected files to generate one.', truncated: 'Truncated',
  copied: 'Review prompt copied to clipboard', invalidMessage: 'Invalid message received from the Webview.',
  genericOperationError: 'ReviewLume: The panel operation failed. Check the ReviewLume output channel.',
  formatUpdated: 'Export format updated', related: 'related', recommendedTest: 'test', changed: 'changed',
  unchanged: 'unchanged', deleted: 'deleted', unconfirmedWarn: 'unconfirmed WARN',
};

const ZH: ReviewPanelStrings = {
  htmlLang: 'zh-CN', panelTitle: 'ReviewLume 审核面板', loading: '正在加载 ReviewLume 审核会话…',
  repository: '仓库', selectedFiles: '已选文件', scanStatus: '扫描状态', exportStatus: '导出状态',
  estimatedSize: '估算大小', estimatedTokens: '估算 Tokens', notScanned: '未扫描', ready: '可导出', blocked: '已阻止', passed: '已通过',
  files: '文件', scanResults: '扫描结果', preview: '审核提示预览', noActiveReview: '没有活动审核会话',
  noActiveReviewHelp: '请从侧边栏或命令面板创建审核包以开始审核。',
  createReviewPack: '创建审核包', addRelatedFiles: '添加关联文件', recommendTestFiles: '推荐测试文件',
  scanSelectedFiles: '扫描所选文件', exportReviewPack: '导出审核包', copyReviewPrompt: '复制审核提示',
  addToGitignore: '加入 .gitignore', refresh: '刷新', exportFormat: '导出格式',
  exportFormatHelp: '用于自动导出；“每次询问”模式仍会弹出保存位置选择。',
  markdown: 'Markdown', zip: 'ZIP', both: 'Markdown + ZIP', noFiles: '当前审核中没有文件。',
  noScanResults: '尚无扫描结果。请运行“扫描所选文件”检查敏感内容。',
  confirmed: '已确认', confirmWarn: '确认警告', chars: '字符', tokens: 'Tokens',
  noPreview: '暂无预览。请先扫描所选文件。', truncated: '已截断',
  copied: '审核提示已复制到剪贴板', invalidMessage: 'Webview 消息无效。',
  genericOperationError: 'ReviewLume：面板操作失败，请查看 ReviewLume 输出通道。',
  formatUpdated: '导出格式已更新', related: '关联', recommendedTest: '测试', changed: '变更',
  unchanged: '未变更', deleted: '已删除', unconfirmedWarn: '个未确认警告',
};

export function getReviewPanelStrings(language: string): ReviewPanelStrings {
  return isChineseLanguage(language) ? ZH : EN;
}

export interface TreeStrings {
  readonly status: string; readonly statusDescription: string; readonly files: string; readonly filesDescription: string;
  readonly actions: string; readonly actionsDescription: string; readonly openReviewPanel: string; readonly openReviewPanelDescription: string;
  readonly createReviewPack: string; readonly createReviewPackDescription: string; readonly addRelatedFiles: string; readonly addRelatedFilesDescription: string;
  readonly recommendTestFiles: string; readonly recommendTestFilesDescription: string; readonly scanSelectedFiles: string; readonly scanSelectedFilesDescription: string;
  readonly exportReviewPack: string; readonly exportReviewPackDescription: string; readonly addExportToGitignore: string; readonly addExportToGitignoreDescription: string;
  readonly openReviewHistory: string; readonly openReviewHistoryDescription: string; readonly importReviewResponse: string; readonly importReviewResponseDescription: string;
  readonly noActiveReview: string; readonly noActiveReviewDescription: string; readonly workspaceTrusted: string; readonly workspaceTrustedDescription: string;
  readonly clickToRun: string; readonly filesSelected: string;
}

export function getTreeStrings(language: string): TreeStrings {
  if (isChineseLanguage(language)) {
    return {
      status: '状态', statusDescription: '当前审核状态', files: '文件', filesDescription: '本次审核包含的文件', actions: '操作', actionsDescription: '可用的审核命令',
      openReviewPanel: '打开审核面板', openReviewPanelDescription: '打开 ReviewLume 审核面板', createReviewPack: '创建审核包', createReviewPackDescription: '检查 Git 变更并创建文件选择会话',
      addRelatedFiles: '添加关联文件', addRelatedFilesDescription: '添加当前仓库内与审核相关的文件', recommendTestFiles: '推荐测试文件', recommendTestFilesDescription: '查找与所选实现文件相关的测试',
      scanSelectedFiles: '扫描所选文件', scanSelectedFilesDescription: '扫描审核输入中的敏感内容', exportReviewPack: '导出审核包', exportReviewPackDescription: '构建并保存已通过隐私检查的审核包',
      addExportToGitignore: '将导出目录加入 .gitignore', addExportToGitignoreDescription: '从 Git 状态中排除生成的审核包', openReviewHistory: '打开审核历史', openReviewHistoryDescription: '浏览过去的审核会话',
      importReviewResponse: '导入审核回复', importReviewResponseDescription: '导入 AI 审核回复', noActiveReview: '没有活动审核', noActiveReviewDescription: '运行“创建审核包”生成文件树',
      workspaceTrusted: '工作区已信任', workspaceTrustedDescription: '运行“创建审核包”检查变更文件', clickToRun: '点击执行', filesSelected: '个文件已选择',
    };
  }
  return {
    status: 'Status', statusDescription: 'Current review state', files: 'Files', filesDescription: 'Files included in this review', actions: 'Actions', actionsDescription: 'Available review commands',
    openReviewPanel: 'Open Review Panel', openReviewPanelDescription: 'Open the review panel Webview', createReviewPack: 'Create Review Pack', createReviewPackDescription: 'Inspect Git changes and start a file-selection session',
    addRelatedFiles: 'Add Related Files', addRelatedFilesDescription: 'Add repository-local files that support the review', recommendTestFiles: 'Recommend Test Files', recommendTestFilesDescription: 'Find likely tests for selected implementation files',
    scanSelectedFiles: 'Scan Selected Files', scanSelectedFilesDescription: 'Scan the exact review input for sensitive content', exportReviewPack: 'Export Review Pack', exportReviewPackDescription: 'Build and save the privacy-checked Review Pack',
    addExportToGitignore: 'Add Export Directory to .gitignore', addExportToGitignoreDescription: 'Exclude generated Review Packs from Git status', openReviewHistory: 'Open Review History', openReviewHistoryDescription: 'Browse past review sessions',
    importReviewResponse: 'Import Review Response', importReviewResponseDescription: 'Import an AI review response', noActiveReview: 'No Active Review', noActiveReviewDescription: 'Run Create Review Pack to build the file tree',
    workspaceTrusted: 'Workspace Trusted', workspaceTrustedDescription: 'Run Create Review Pack to inspect changed files', clickToRun: 'click to run', filesSelected: 'files selected',
  };
}
