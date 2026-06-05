import * as vscode from 'vscode';
import { GitHelper, LocalChanges } from './gitHelper';
import { AICommentDetector } from './aiCommentDetector';
import { CodeAnalyzer } from './codeAnalyzer';
import { CommitGenerator } from './commitGenerator';
import { CommitStructurer } from './commitStructurer';
import { DiagnosticsProvider } from './diagnosticsProvider';

const PARTICIPANT_ID = 'precommit.guardian';

export class PreCommitChatParticipant {
    constructor(
        private readonly git: GitHelper,
        private readonly detector: AICommentDetector,
        private readonly analyzer: CodeAnalyzer,
        private readonly commitGen: CommitGenerator,
        private readonly commitStructurer: CommitStructurer,
        private readonly diagnostics: DiagnosticsProvider
    ) {}

    register(context: vscode.ExtensionContext): void {
        const participant = vscode.chat.createChatParticipant(
            PARTICIPANT_ID,
            this.handle.bind(this)
        );
        participant.iconPath = new vscode.ThemeIcon('shield');
        context.subscriptions.push(participant);
    }

    // ─── Main Handler ──────────────────────────────────────────────────────────

    private async handle(
        request: vscode.ChatRequest,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        if (!this.git.isGitRepo()) {
            stream.markdown('❌ **Not a Git repository.** Open a project that is tracked by Git.');
            return {};
        }

        let changes: LocalChanges;
        try {
            changes = this.git.getAllLocalChanges();
        } catch (err: any) {
            stream.markdown(`❌ **Git error:** ${err.message}`);
            return {};
        }

        switch (request.command) {
            case 'review':     return this.cmdReview(request, stream, changes, token);
            case 'commit':     return this.cmdCommit(request, stream, changes, token);
            case 'structure':  return this.cmdStructure(request, stream, changes, token);
            case 'aicomments': return this.cmdAIComments(stream, changes);
            case 'check':      return this.cmdQuickCheck(request, stream, changes, token);
            default:           return this.cmdFreeform(request, stream, changes, token);
        }
    }

    // ─── /review ──────────────────────────────────────────────────────────────

    private async cmdReview(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        changes: LocalChanges,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        this.renderHeader(stream, '🛡️ Pre-Commit Review', changes);

        if (!changes.hasChanges) {
            stream.markdown('ℹ️ No local changes found. Stage or modify some files first.\n');
            return {};
        }

        // ── Step 1: AI Comment Detection (local, fast) ──
        stream.markdown('## 🤖 AI Comment Detection\n\n');
        const comments = this.detector.detectInDiff(changes.fullDiff);
        stream.markdown(this.detector.formatReport(comments));
        stream.markdown('\n---\n\n');

        if (token.isCancellationRequested) return {};

        // ── Step 2: Deep Code Analysis (LLM) ──
        stream.markdown('## 🔍 Code Analysis\n\n');
        const prompt = this.analyzer.buildFullReviewPrompt(
            changes.fullDiff, changes.allFiles, changes.branch
        );
        await this.streamLLM(request.model, prompt, stream, token);
        stream.markdown('\n\n---\n\n');

        if (token.isCancellationRequested) return {};

        // ── Step 3: Footer with next actions ──
        stream.markdown('## 🚀 Next Steps\n\n');
        stream.markdown('Run `/commit` to generate a structured commit message, ');
        stream.markdown('or `/structure` to plan how to split changes into atomic commits.\n');
        stream.button({ command: 'precommit.guardian.generateCommit', title: '$(git-commit) Generate Commit Message' });
        stream.button({ command: 'precommit.guardian.structureCommits', title: '$(list-ordered) Plan Commit Structure' });

        // Refresh Problems panel
        this.diagnostics.scheduleRefresh(500);

        return {};
    }

    // ─── /aicomments ──────────────────────────────────────────────────────────

    private async cmdAIComments(
        stream: vscode.ChatResponseStream,
        changes: LocalChanges
    ): Promise<vscode.ChatResult> {
        this.renderHeader(stream, '🤖 AI Comment Scan', changes);

        if (!changes.hasChanges) {
            stream.markdown('ℹ️ No local changes to scan.\n');
            return {};
        }

        const comments = this.detector.detectInDiff(changes.fullDiff);
        stream.markdown(this.detector.formatReport(comments));

        if (comments.length > 0) {
            stream.markdown('\n---\n');
            stream.markdown('> 📌 These are also shown in the **Problems panel** (`View → Problems`).\n');
            this.diagnostics.scheduleRefresh(300);
        }

        return {};
    }

    // ─── /check ───────────────────────────────────────────────────────────────

    private async cmdQuickCheck(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        changes: LocalChanges,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        this.renderHeader(stream, '✅ Quick Readiness Check', changes);

        if (!changes.hasChanges) {
            stream.markdown('ℹ️ No local changes found.\n');
            return {};
        }

        const prompt = this.analyzer.buildQuickCheckPrompt(changes.fullDiff, changes.allFiles);
        await this.streamLLM(request.model, prompt, stream, token);

        return {};
    }

    // ─── /commit ──────────────────────────────────────────────────────────────

    private async cmdCommit(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        changes: LocalChanges,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        this.renderHeader(stream, '📝 Commit Message Generator', changes);

        if (!changes.hasChanges) {
            stream.markdown('ℹ️ No local changes detected. Nothing to commit.\n');
            return {};
        }

        stream.markdown(`> Extracting Jira ticket from branch \`${changes.branch}\`...\n\n`);

        const prompt = this.commitGen.buildCommitPrompt(
            changes.fullDiff, changes.allFiles, changes.branch
        );

        stream.markdown('---\n\n');
        const fullMessage = await this.streamLLM(request.model, prompt, stream, token);
        stream.markdown('\n\n---\n\n');

        // Validation feedback
        if (fullMessage) {
            const firstCommit = fullMessage.split('--- COMMIT BREAK ---')[0].trim();
            const { warnings } = this.commitGen.validate(firstCommit, changes.branch);
            if (warnings.length > 0) {
                stream.markdown('**⚠️ Validation Notes:**\n');
                for (const w of warnings) stream.markdown(`- ${w}\n`);
                stream.markdown('\n');
            }
        }

        stream.markdown('> 💡 **Tip:** Copy the message above and paste it into the VS Code Source Control commit input box, or use `git commit -F -` to pipe it.\n');
        stream.button({ command: 'precommit.guardian.structureCommits', title: '$(list-ordered) See Commit Structure Plan' });

        return {};
    }

    // ─── /structure ───────────────────────────────────────────────────────────

    private async cmdStructure(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        changes: LocalChanges,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        this.renderHeader(stream, '🗂️ Commit Structure Planner', changes);

        if (!changes.hasChanges) {
            stream.markdown('ℹ️ No local changes to structure.\n');
            return {};
        }

        const prompt = this.commitStructurer.buildStructurePrompt(
            changes.fullDiff, changes.allFiles, changes.branch
        );

        stream.markdown('_Analyzing semantic groupings of your changes..._\n\n---\n\n');
        await this.streamLLM(request.model, prompt, stream, token);

        return {};
    }

    // ─── Free-form ────────────────────────────────────────────────────────────

    private async cmdFreeform(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        changes: LocalChanges,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        if (!request.prompt.trim()) {
            stream.markdown(this.renderHelp(changes.branch));
            return {};
        }

        const contextPrompt = `You are a pre-commit assistant. The developer is on branch \`${changes.branch}\` with these local changes:

Files: ${changes.allFiles.join(', ')}

\`\`\`diff
${changes.fullDiff.substring(0, 6000)}
\`\`\`

Developer question: ${request.prompt}

Answer specifically based on the code changes above.`;

        await this.streamLLM(request.model, contextPrompt, stream, token);
        return {};
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Streams a prompt to the LLM and returns the full text response */
    private async streamLLM(
        model: vscode.LanguageModelChat,
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string> {
        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await model.sendRequest(messages, {}, token);
            let full = '';
            for await (const chunk of response.text) {
                stream.markdown(chunk);
                full += chunk;
                if (token.isCancellationRequested) break;
            }
            return full;
        } catch (err: any) {
            if (err.name === 'Cancelled') return '';
            stream.markdown(`\n\n❌ **Model error:** ${err.message}\n`);
            return '';
        }
    }

    private renderHeader(
        stream: vscode.ChatResponseStream,
        title: string,
        changes: LocalChanges
    ): void {
        stream.markdown(`# ${title}\n\n`);
        stream.markdown(`| | |\n|---|---|\n`);
        stream.markdown(`| **Branch** | \`${changes.branch}\` |\n`);
        stream.markdown(`| **Staged** | ${changes.stagedFiles.length} file(s) |\n`);
        stream.markdown(`| **Unstaged** | ${changes.unstagedFiles.length} file(s) |\n`);
        if (changes.untrackedFiles.length > 0) {
            stream.markdown(`| **Untracked** | ${changes.untrackedFiles.length} file(s) |\n`);
        }
        stream.markdown('\n---\n\n');
    }

    private renderHelp(branch: string): string {
        return `# 🛡️ Pre-Commit Guardian

**Current branch:** \`${branch}\`

## Available Commands

| Command | Description |
|---------|-------------|
| \`/review\` | Full review: AI comments + code optimization + deep analysis |
| \`/check\` | Quick readiness check (debug logs, secrets, TODOs) |
| \`/aicomments\` | Scan for Copilot/AI-generated comments |
| \`/commit\` | Generate Jira-structured commit message(s) |
| \`/structure\` | Plan how to split changes into atomic commits |

## Commit Format
\`\`\`
[BDD-7563] Fix null reference in document upload

Resolves issue where uploading a document without a valid session
caused an unhandled null reference exception in the service layer.

Changes:
- src/services/documentService.ts: Add null check before upload call
- src/utils/sessionHelper.ts: Extract session validation logic
\`\`\`

> 💡 The Jira tag is **automatically extracted** from your branch name.
`;
    }
}