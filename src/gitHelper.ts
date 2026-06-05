import * as vscode from 'vscode';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

export interface LocalChanges {
    branch: string;
    stagedFiles: string[];
    unstagedFiles: string[];
    untrackedFiles: string[];
    allFiles: string[];
    stagedDiff: string;
    unstagedDiff: string;
    fullDiff: string;
    hasChanges: boolean;
    totalLines: number;
}

export class GitHelper {
    private workspaceRoot(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            throw new Error('No workspace folder open. Please open a project.');
        }
        return folders[0].uri.fsPath;
    }

    private exec(cmd: string): string {
        const opts: ExecSyncOptionsWithStringEncoding = {
            cwd: this.workspaceRoot(),
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024, // 50 MB
        };
        try {
            return execSync(cmd, opts).trim();
        } catch (err: any) {
            // git diff exits with code 1 when there are differences — that's not an error
            if (err.stdout) return err.stdout.trim();
            throw new Error(`Git command failed: ${cmd}\n${err.message}`);
        }
    }

    getCurrentBranch(): string {
        try {
            return this.exec('git rev-parse --abbrev-ref HEAD');
        } catch {
            return 'unknown';
        }
    }

    getStagedFiles(): string[] {
        try {
            const out = this.exec('git diff --staged --name-only');
            return out ? out.split('\n').filter(Boolean) : [];
        } catch { return []; }
    }

    getUnstagedFiles(): string[] {
        try {
            const out = this.exec('git diff --name-only');
            return out ? out.split('\n').filter(Boolean) : [];
        } catch { return []; }
    }

    getUntrackedFiles(): string[] {
        try {
            const out = this.exec('git ls-files --others --exclude-standard');
            return out ? out.split('\n').filter(Boolean) : [];
        } catch { return []; }
    }

    getStagedDiff(): string {
        try {
            const cfg = vscode.workspace.getConfiguration('precommitGuardian');
            const maxKB = cfg.get<number>('maxDiffSizeKB', 200);
            const diff = this.exec('git diff --staged --unified=5');
            return this.truncateDiff(diff, maxKB);
        } catch { return ''; }
    }

    getUnstagedDiff(): string {
        try {
            const cfg = vscode.workspace.getConfiguration('precommitGuardian');
            const maxKB = cfg.get<number>('maxDiffSizeKB', 200);
            const diff = this.exec('git diff --unified=5');
            return this.truncateDiff(diff, maxKB);
        } catch { return ''; }
    }

    getUntrackedFileContent(filePath: string): string {
        try {
            const fs = require('fs') as typeof import('fs');
            const path = require('path') as typeof import('path');
            const fullPath = path.join(this.workspaceRoot(), filePath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Format like a diff for uniform processing
            const lines = content.split('\n').map(l => `+${l}`).join('\n');
            return `diff --git a/${filePath} b/${filePath}\nnew file\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1 @@\n${lines}`;
        } catch { return ''; }
    }

    getStatusSummary(): string {
        try {
            return this.exec('git status --short');
        } catch { return ''; }
    }

    getAllLocalChanges(): LocalChanges {
        const cfg = vscode.workspace.getConfiguration('precommitGuardian');
        const analyzeUnstaged = cfg.get<boolean>('analyzeUnstaged', true);
        const analyzeUntracked = cfg.get<boolean>('analyzeUntracked', false);

        const branch = this.getCurrentBranch();
        const stagedFiles = this.getStagedFiles();
        const unstagedFiles = analyzeUnstaged ? this.getUnstagedFiles() : [];
        const untrackedFiles = analyzeUntracked ? this.getUntrackedFiles() : [];
        const allFiles = [...new Set([...stagedFiles, ...unstagedFiles, ...untrackedFiles])];

        const stagedDiff = stagedFiles.length > 0 ? this.getStagedDiff() : '';
        const unstagedDiff = unstagedFiles.length > 0 ? this.getUnstagedDiff() : '';

        let fullDiff = '';
        if (stagedDiff) fullDiff += `### STAGED CHANGES\n${stagedDiff}\n`;
        if (unstagedDiff) fullDiff += `### UNSTAGED CHANGES\n${unstagedDiff}\n`;
        if (analyzeUntracked) {
            for (const f of untrackedFiles) {
                fullDiff += `### NEW FILE: ${f}\n${this.getUntrackedFileContent(f)}\n`;
            }
        }

        const totalLines = fullDiff.split('\n').length;

        return {
            branch,
            stagedFiles,
            unstagedFiles,
            untrackedFiles,
            allFiles,
            stagedDiff,
            unstagedDiff,
            fullDiff,
            hasChanges: allFiles.length > 0,
            totalLines
        };
    }

    isGitRepo(): boolean {
        try {
            this.exec('git rev-parse --git-dir');
            return true;
        } catch { return false; }
    }

    private truncateDiff(diff: string, maxKB: number): string {
        const maxBytes = maxKB * 1024;
        if (Buffer.byteLength(diff, 'utf-8') <= maxBytes) return diff;
        const truncated = Buffer.from(diff, 'utf-8').slice(0, maxBytes).toString('utf-8');
        const lastNewline = truncated.lastIndexOf('\n');
        return truncated.substring(0, lastNewline) +
            `\n\n⚠️  [Diff truncated at ${maxKB}KB — remaining changes not shown]`;
    }
}