import * as vscode from 'vscode';
import { GitHelper } from './gitHelper';
import { AICommentDetector } from './aiCommentDetector';
import { CodeAnalyzer } from './codeAnalyzer';
import { CommitGenerator } from './commitGenerator';
import { CommitStructurer } from './commitStructurer';
import { StatusBarManager } from './statusBarManager';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { PreCommitChatParticipant } from './chatParticipant';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Core services
    const gitHelper = new GitHelper();
    const aiCommentDetector = new AICommentDetector();
    const codeAnalyzer = new CodeAnalyzer();
    const commitGenerator = new CommitGenerator(gitHelper);
    const commitStructurer = new CommitStructurer(gitHelper);

    // UI services
    const statusBarManager = new StatusBarManager(gitHelper);
    const diagnosticsProvider = new DiagnosticsProvider(gitHelper, aiCommentDetector);

    // Chat participant
    const chatParticipant = new PreCommitChatParticipant(
        gitHelper,
        aiCommentDetector,
        codeAnalyzer,
        commitGenerator,
        commitStructurer,
        diagnosticsProvider
    );

    // Register everything
    chatParticipant.register(context);
    statusBarManager.register(context);
    diagnosticsProvider.register(context);

    // Register commands — all open Copilot Chat with the relevant slash command
    const openChat = (query: string) =>
        vscode.commands.executeCommand('workbench.action.chat.open', { query });

    context.subscriptions.push(
        vscode.commands.registerCommand('precommit.guardian.review', () =>
            openChat('@guardian /review')),
        vscode.commands.registerCommand('precommit.guardian.generateCommit', () =>
            openChat('@guardian /commit')),
        vscode.commands.registerCommand('precommit.guardian.structureCommits', () =>
            openChat('@guardian /structure')),
        vscode.commands.registerCommand('precommit.guardian.detectAIComments', () =>
            openChat('@guardian /aicomments')),
        vscode.commands.registerCommand('precommit.guardian.quickCheck', () =>
            openChat('@guardian /check')),
        vscode.commands.registerCommand('precommit.guardian.refreshDiagnostics', () =>
            diagnosticsProvider.refresh())
    );

    // Auto-refresh diagnostics when source files change
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
        '**/*.{ts,js,tsx,jsx,py,java,cs,go,rs,php,rb,swift,kt}'
    );
    context.subscriptions.push(
        fileWatcher,
        fileWatcher.onDidChange(() => diagnosticsProvider.scheduleRefresh()),
        fileWatcher.onDidCreate(() => diagnosticsProvider.scheduleRefresh()),
        fileWatcher.onDidDelete(() => diagnosticsProvider.scheduleRefresh())
    );

    vscode.window.setStatusBarMessage('$(shield) Pre-Commit Guardian ready', 3000);
}

export function deactivate(): void { /* cleanup handled by disposables */ }