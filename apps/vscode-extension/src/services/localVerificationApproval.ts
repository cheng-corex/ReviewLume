import type { VerificationCandidate } from './localVerificationTypes';

export interface VerificationApprovalPrompt {
  readonly message: string;
  readonly action: 'Approve' | 'Approve and run';
}

export function buildVerificationApprovalPrompt(
  candidates: readonly VerificationCandidate[],
  runAfterApproval: boolean,
): VerificationApprovalPrompt {
  const executesRepositoryTooling = candidates.some(
    (candidate) => candidate.targetMode !== 'changed-javascript',
  );
  const message = executesRepositoryTooling
    ? 'The selected test or type-check rules run repository-local tooling and may execute repository code, modify files, access the network, or use local services. ChatGPT cannot change these commands or start them. Configuration, lockfile, runner, or working-directory changes invalidate this approval.'
    : 'The selected JavaScript syntax check parses changed files without executing their contents. ReviewLume will run only the fixed command shown below. ChatGPT cannot change this command or start it. Configuration changes invalidate this approval.';
  return {
    message,
    action: runAfterApproval ? 'Approve and run' : 'Approve',
  };
}
