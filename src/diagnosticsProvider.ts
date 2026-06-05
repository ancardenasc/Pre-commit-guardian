import * as vscode from 'vscode';
import * as path from 'path';
import { GitHelper } from './gitHelper';
import { AICommentDetector } from './aiCommentDetector';

export class DiagnosticsProvider {
    private readonly collection: vscode.DiagnosticCollection;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly gitHelper: GitHelper,
        private readonly detector: AICommentDetector
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('pre-commit-guardian');
    }

    register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(this.collection);
        // Initial scan after short delay
        this.scheduleRefresh(3000);
    }

    scheduleRefresh(delayMs = 2000): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.refresh(), delayMs);
    }

    async refresh(): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('precommitGuardian');
        if (!cfg.get<boolean>('enableDiagnostics', true)) {
            this.collection.clear();
            return;
        }

        try {
            if (!this.gitHelper.isGitRepo()) return;

            const changes = this.gitHelper.getAllLocalChanges();
            if (!changes.hasChanges) {
                this.collection.clear();
                return;
            }

            const comments = this.detector.detectInDiff(changes.fullDiff);
            this.collection.clear();

            const diagnosticsByUri = new Map<string, vscode.Diagnostic[]>();
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

            for (const comment of comments) {
                const uri = vscode.Uri.file(path.join(root, comment.file));
                const key = uri.toString();

                const range = new vscode.Range(
                    Math.max(0, comment.line - 1), 0,
                    Math.max(0, comment.line - 1), 500
                );

                const d = new vscode.Diagnostic(
                    range,
                    `[Guardian] AI comment detected (${comment.matchedPattern}): ${comment.content.substring(0, 70)}`,
                    vscode.DiagnosticSeverity.Warning
                );
                d.source = 'Pre-Commit Guardian';
                d.code = { value: 'ai-comment', target: vscode.Uri.parse('https://github.com') };
                d.tags = [vscode.DiagnosticTag.Unnecessary];

                if (!diagnosticsByUri.has(key)) diagnosticsByUri.set(key, []);
                diagnosticsByUri.get(key)!.push(d);
            }

            for (const [key, diagnostics] of diagnosticsByUri) {
                this.collection.set(vscode.Uri.parse(key), diagnostics);
            }
        } catch {
            // Silent fail — diagnostics are a convenience, not critical
        }
    }
}