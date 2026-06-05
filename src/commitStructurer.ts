import { GitHelper } from './gitHelper';

export class CommitStructurer {
    constructor(private readonly gitHelper: GitHelper) {}

    buildStructurePrompt(diff: string, files: string[], branch: string): string {
        return `You are a Git workflow expert helping structure local changes into **clean, atomic commits** for code review.

**Branch:** \`${branch}\`
**Total files changed:** ${files.length}

\`\`\`
${files.join('\n')}
\`\`\`

**Git Diff:**
\`\`\`diff
${diff}
\`\`\`

---

## Your Task

Analyze the changes and propose the **optimal commit structure** so that:
- Each commit is **atomic** (one logical change, independently revertable)
- A reviewer can understand each commit **without reading all others**
- The commit history reads like a **clear story** of the feature/fix

---

## Commit Rules (apply to each message you generate)
- First line: \`[JIRA-TAG] Summary\` — max 50 chars total
- Body lines: max 72 chars each  
- English, imperative mood
- Blank line between subject and body
- Bullet list of files with descriptions

---

## Response Format

### 📋 Recommended Commit Strategy

**Option: Single Commit** OR **Option: Multiple Commits**

For EACH commit:

\`\`\`
──────────────────────────────────────
Commit #N — [Reason: what logical concern]
Files to stage:
  git add <file1> <file2>

Commit message:
[TAG] Subject line (≤50 chars)

Explanation of why this change was made.

Changes:
- file1.ts: what changed and why
- file2.ts: what changed and why
──────────────────────────────────────
\`\`\`

End with:
### 💡 Recommendation
(1–2 sentences on why this structure is optimal for code review and future \`git bisect\` / revert scenarios)`;
    }
}