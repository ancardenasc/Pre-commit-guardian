import * as vscode from 'vscode';

export interface JiraTicket {
    raw: string;       // e.g., "proj-1234"
    key: string;       // e.g., "PROJ-1234"
    tag: string;       // e.g., "[PROJ-1234]"
    project: string;   // e.g., "PROJ"
    number: string;    // e.g., "7563"
}

export class BranchParser {
    /**
     * Extracts the Jira ticket from a branch name.
     * Works with formats like: proj-1234-description, PROJ-1234/description, feature/PROJ-1234-desc
     */
    extractJiraTicket(branchName: string): JiraTicket | null {
        const cfg = vscode.workspace.getConfiguration('precommitGuardian');
        const pattern = cfg.get<string>('jiraProjectPattern', '([a-zA-Z]{2,10}-\\d+)');

        try {
            const regex = new RegExp(pattern, 'i');
            const match = branchName.match(regex);
            if (!match) return null;

            const raw = match[1] ?? match[0];
            const key = raw.toUpperCase();
            const dashIdx = key.indexOf('-');
            if (dashIdx < 0) return null;

            return {
                raw,
                key,
                tag: `[${key}]`,
                project: key.substring(0, dashIdx),
                number: key.substring(dashIdx + 1)
            };
        } catch {
            return null;
        }
    }

    /**
     * Extracts a human-readable topic from a branch name by removing the ticket.
     * "proj-1234-improve-onedrive-document-upload-dialog"
     * → "improve onedrive document upload dialog"
     */
    extractTopic(branchName: string): string {
        const ticket = this.extractJiraTicket(branchName);
        let topic = branchName;

        // Remove common prefixes
        topic = topic.replace(/^(feature|feat|fix|hotfix|bugfix|chore|refactor|release|docs)\//i, '');

        // Remove the jira ticket part (case-insensitive)
        if (ticket) {
            // Handles proj-1234, PROJ-1234, proj_1234
            const ticketRegex = new RegExp(
                ticket.project + '[_-]' + ticket.number + '[_-]?',
                'i'
            );
            topic = topic.replace(ticketRegex, '');
        }

        return topic
            .replace(/^[-_/]+/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
}