import * as path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import type { McpGitRunner } from './mcpRepositoryTools';

export type ProjectKind = 'git' | 'folder';

export interface ProjectContext {
  readonly root: string;
  readonly displayName: string;
  readonly kind: ProjectKind;
}

/**
 * Resolve the single project root bound to one MCP connection.
 *
 * Git is an enhancement, not a prerequisite: when read-only Git discovery does
 * not find a repository, the selected trusted workspace folder itself becomes
 * the project root. The returned root is canonicalized so later filesystem
 * boundary checks cannot be widened through a workspace symlink/junction.
 */
export async function resolveProjectContext(
  workspaceRoot: string,
  runner: McpGitRunner,
): Promise<ProjectContext> {
  const folderRoot = await canonicalDirectory(workspaceRoot);

  try {
    const result = await runner.run({
      cwd: folderRoot,
      args: ['rev-parse', '--show-toplevel'],
    });
    const discovered = result.stdout.trim();
    if (discovered) {
      const gitRoot = await canonicalDirectory(discovered);
      return {
        root: gitRoot,
        displayName: path.basename(gitRoot) || 'repository',
        kind: 'git',
      };
    }
  } catch {
    // A missing repository (or unavailable Git executable) degrades safely to
    // Folder Project mode. No Git capability is exposed unless discovery works.
  }

  return {
    root: folderRoot,
    displayName: path.basename(folderRoot) || 'folder',
    kind: 'folder',
  };
}

async function canonicalDirectory(value: string): Promise<string> {
  const resolved = await realpath(path.resolve(value));
  const details = await stat(resolved);
  if (!details.isDirectory()) {
    throw new Error('The selected project root is not a directory.');
  }
  return resolved;
}
