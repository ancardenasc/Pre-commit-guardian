# 🛡️ Pre-Commit Guardian

A VS Code extension that acts as your **pre-commit quality gate** — powered by GitHub Copilot.

## Features

| Command | What it does |
|---------|-------------|
| `@guardian /review` | Full review: AI-generated comments + code optimization + security + deep analysis |
| `@guardian /check` | Quick readiness scan: debug statements, hardcoded secrets, TODOs, incomplete code |
| `@guardian /aicomments` | Detect and list Copilot/AI-generated comments in local changes |
| `@guardian /commit` | Generate Jira-structured commit message(s) extracted from branch name |
| `@guardian /structure` | Plan how to split local changes into atomic, reviewable commits |

## Branch → Commit Tag

The extension **automatically extracts** the Jira ticket from your branch name:

```
Branch:  bdd-7563-improve-onedrive-document-upload-dialog
         └─────────────────────────────────────────────┘
                         ↓ extracted
Commit:  [BDD-7563] Fix null reference in upload dialog
```

Supported branch formats:
- `bdd-7563-description`
- `BDD-7563/description`
- `feature/bdd-7563-description`
- `bugfix/BDD-7563-some-fix`

## Commit Message Format

```
[BDD-7563] Fix null reference in document upload      ← max 50 chars (incl. tag)
                                                       ← blank line
Resolves issue where uploading a document without a   ← max 72 chars/line
valid session caused an unhandled null reference
exception in the upload service layer.

Changes:
- src/services/documentService.ts: Add null guard before S3 upload call
- src/utils/sessionHelper.ts: Extract and reuse session validation logic
- src/types/document.ts: Add optional sessionId field to UploadPayload
```

## Setup

```bash
git clone <this-repo>
cd pre-commit-guardian
npm install
```

Press **F5** in VS Code to launch the Extension Development Host.

To install permanently:
```bash
npm run package   # creates pre-commit-guardian-1.0.0.vsix
code --install-extension pre-commit-guardian-1.0.0.vsix
```

## Usage

1. Open a project in VS Code with local (uncommitted) changes
2. Open Copilot Chat (`Ctrl+Alt+I`)
3. Type `@guardian /review` and press Enter
4. Or click the **🛡️** buttons in the Source Control panel

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Alt+R` | Open full review |
| `Ctrl+Shift+Alt+C` | Generate commit message |

## Configuration

```json
{
  "precommitGuardian.jiraProjectPattern": "([a-zA-Z]{2,10}-\\d+)",
  "precommitGuardian.maxFirstLineLength": 50,
  "precommitGuardian.maxBodyLineLength": 72,
  "precommitGuardian.analyzeUnstaged": true,
  "precommitGuardian.analyzeUntracked": false,
  "precommitGuardian.maxDiffSizeKB": 200,
  "precommitGuardian.enableDiagnostics": true,
  "precommitGuardian.aiCommentPatterns": []
}
```

## Optional: Git Pre-Commit Hook

Auto-trigger a quick check before every `git commit`:

```bash
# Install husky
npm install --save-dev husky
npx husky init

# Add hook
echo 'code --wait --command "precommit.guardian.quickCheck"' > .husky/pre-commit
```

## Requirements

- VS Code `^1.90.0`
- GitHub Copilot extension installed and signed in