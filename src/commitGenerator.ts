import * as vscode from 'vscode';
import { GitHelper } from './gitHelper';
import { BranchParser } from './branchParser';

export class CommitGenerator {
    private readonly branchParser: BranchParser;

    constructor(private readonly gitHelper: GitHelper) {
        this.branchParser = new BranchParser();
    }

    buildCommitPrompt(diff: string, files: string[], branch: string): string {
        const ticket = this.branchParser.extractJiraTicket(branch);
        const topic = this.branchParser.extractTopic(branch);
        const cfg = vscode.workspace.getConfiguration('precommitGuardian');
        const maxFirst = cfg.get<number>('maxFirstLineLength', 50);
        const maxBody = cfg.get<number>('maxBodyLineLength', 72);

        const tagExample = ticket?.tag ?? '[JIRA-XXX]';
        const ticketInfo = ticket
            ? `**Jira ticket**: \`${ticket.key}\` → use tag \`${ticket.tag}\``
            : `**No Jira ticket** found in branch. Use a semantic tag: \`[FIX]\`, \`[FEAT]\`, \`[REFACTOR]\`, \`[DOCS]\`, \`[TEST]\`, \`[CHORE]\`, \`[PERF]\`, or \`[SECURITY]\`.`;

        return `You are a Git commit message expert. Generate commit message(s) for the following changes.

## Context
- **Branch**: \`${branch}\`
- **Topic**: ${topic || '(derived from branch)'}
- ${ticketInfo}

## Commit Message Rules (STRICT — no exceptions)
1. ✅ Write in **English**
2. ✅ First line **must start** with \`${tagExample}\`
3. ✅ First line **max ${maxFirst} characters** total (tag + space + summary)
4. ✅ Body lines **max ${maxBody} characters** each
5. ✅ Use **imperative mood**: "Add", "Fix", "Refactor" — NOT "Added", "Fixed"
6. ✅ Blank line **between subject and body**
7. ✅ Body must include a **bullet list** of changed files with a description per file
8. ✅ Summary must be **specific** — another dev must understand the change without reading the code
9. ❌ Do NOT add explanations outside the commit block(s)

## Commit Format Template
\`\`\`
${tagExample} Imperative summary of changes here

Explain WHY this change was made. What problem does it solve?
Include any relevant context (ticket requirements, bug description, etc.)

Changes:
- path/to/file.ts: Brief description of what changed in this specific file
- path/to/another.ts: Brief description of what changed in this specific file
\`\`\`

## Character limit examples for first line (max ${maxFirst} chars):
- ✅ \`${tagExample} Fix null ref in document upload\` (${tagExample.length + ' Fix null ref in document upload'.length} chars)
- ❌ \`${tagExample} Fix the null reference exception that occurs when uploading documents\` (too long)

## Changed Files (${files.length}):
${files.map(f => `- \`${f}\``).join('\n')}

## Git Diff:
\`\`\`diff
${diff}
\`\`\`

## Decision Logic:
- If all changes address **one single concern** → produce **ONE commit**
- If changes address **distinct concerns** (e.g., a bug fix + a refactor + test additions) → produce **MULTIPLE commits**
- For multiple commits: specify which files go in each, and separate messages with \`--- COMMIT BREAK ---\`

Output ONLY the commit message(s). No preamble, no explanation after.`;
    }

    /** Validates a generated commit message against the rules */
    validate(message: string, branchName: string): { valid: boolean; warnings: string[] } {
        const cfg = vscode.workspace.getConfiguration('precommitGuardian');
        const maxFirst = cfg.get<number>('maxFirstLineLength', 50);
        const maxBody = cfg.get<number>('maxBodyLineLength', 72);
        const warnings: string[] = [];

        const lines = message.split('\n');
        if (!lines.length) return { valid: false, warnings: ['Empty commit message'] };

        const subject = lines[0];

        // Check tag presence
        if (!/^\[.+\]/.test(subject)) {
            warnings.push(`First line must start with a tag like [PROJ-1234] or [FIX]`);
        }

        // Check length of first line
        if (subject.length > maxFirst) {
            warnings.push(`First line is ${subject.length} chars (max ${maxFirst}): "${subject}"`);
        }

        // Check blank line after subject
        if (lines.length > 1 && lines[1].trim() !== '') {
            warnings.push('Second line must be blank (separating subject from body)');
        }

        // Check body line lengths
        lines.slice(2).forEach((line, i) => {
            if (line.length > maxBody) {
                warnings.push(`Line ${i + 3} is ${line.length} chars (max ${maxBody})`);
            }
        });

        return { valid: warnings.length === 0, warnings };
    }
}