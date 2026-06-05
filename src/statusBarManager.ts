import * as vscode from 'vscode';
import { GitHelper } from './gitHelper';

export class StatusBarManager {
    private readonly item: vscode.StatusBarItem;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly gitHelper: GitHelper) {
        this.item = vscode.window.createStatusBarItem(
            'precommit.guardian.status',
            vscode.StatusBarAlignment.Left,
            100
        );
        this.item.command = 'precommit.guardian.review';
        this.item.name = 'Pre-Commit Guardian';
    }

    register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(this.item);
        this.update();

        // Refresh status bar when the active editor changes (proxy for file saves)
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
            vscode.workspace.onDidSaveTextDocument(() => this.scheduleUpdate())
        );
    }

    scheduleUpdate(delayMs = 1500): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.update(), delayMs);
    }

    update(): void {
        try {
            if (!this.gitHelper.isGitRepo()) {
                this.item.hide();
                return;
            }

            const changes = this.gitHelper.getAllLocalChanges();
            const staged = changes.stagedFiles.length;
            const unstaged = changes.unstagedFiles.length;

            if (staged > 0) {
                this.item.text = `$(shield) ${staged} staged`;
                this.item.tooltip = `${staged} staged file(s), ${unstaged} unstaged — Click to run Pre-Commit Review`;
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.item.color = undefined;
            } else if (unstaged > 0) {
                this.item.text = `$(shield) ${unstaged} modified`;
                this.item.tooltip = `${unstaged} unstaged file(s) — Click to run Pre-Commit Review`;
                this.item.backgroundColor = undefined;
                this.item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
            } else {
                this.item.text = `$(shield) Guardian`;
                this.item.tooltip = 'Pre-Commit Guardian — no local changes';
                this.item.backgroundColor = undefined;
                this.item.color = undefined;
            }
            this.item.show();
        } catch {
            this.item.hide();
        }
    }
}