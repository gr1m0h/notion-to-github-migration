# Notion to GitHub Issues Migration Tool

A TypeScript tool to migrate CSV exports from Notion database to GitHub Issues.

## Features
- Flexible Configuration: Customize migration mapping via JSON configuration
- Auto Label Creation: Automatically creates labels that don't exist in GitHub
- Issue Template Support: Uses repository issue templates
- Retry Mechanism: Automatic retry for temporary errors
- Auto Color Generation: Automatically fenerates label colors

## Requirements
- Node.js14+
- Typescript
- GitHub Personal Access Token (Fine-grained)

## Installation

```sh
npm install
```

## Dependencies

```json
{
  "dependencies": {
    "@octokit/rest": "^19.0.0",
    "csv-parse": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Usage

### 1. Create GitHub Personal Access Token
1. Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. Click "Generate new token"
3. Set required permissions:
   - Repository access: Select target repository
   - Permisison:
     - Issues: Read & Write
     - Metadata: Read

### 2. Export CSV from Notion
1. Select Export from your Notion database menu
2. Choose "CSV" as Export format
3. Save the exported CSV file

### 3. Create Configuration File
Create config.json with the following content:

```json
{
  "github": {
    "token": "github_pat_xxxxxxxxxxxxx",
    "owner": "your-org-or-username",
    "repo": "your-repository-name",
    "issueTemplate": "task"
  },
  "fieldMapping": {
    "Name": {
      "githubField": "title"
    },
    "Tag": {
      "githubField": "label",
      "delimiter": ", "
    },
    "Priority": {
      "githubField": "label",
      "delimiter": ", "
    },
  },
  "retry": {
    "maxAttempts": 3,
    "delayMs": 1000
  }
}
```

### 4. Run Migration
```sh
# Compile Typescript
npx tsc src/index.ts

# Run
node dist/index.js <path-to-csv-file> <path-to-config-file>

# Example
node migrate.js ./notion-export.csv ./config.json
```

## Configuration Options

### github
- token: GitHub Personal Access Token
- owner: Repository owner (organization or username)
- repo: Repository name
- issueTemplate: Issue template name to use (optional)

### fieldMapping
Defines mapping between Notion fields and GitHub fields.

- Key: Notion CSV column name
- Value:
  - githubField: Target field ("title", "label", or "body")
  - delimiter: Delimiter for multiple values (only for labels)

### retry
- maxAttempts: Maximum retry attempts
- delayMs: Delay between retries (milliseconds)

## Customization Examples
### Additional Field Mapping
```json
{
  "fieldMapping": {
    "Name": { "githubField": "title" },
    "Description": { "githubField": "body" },
    "Status": { "githubField": "label" },
    "Assignee": { "githubField": "label", "delimiter": ";" }
  }
}
```

### Set Token via Environment Variable
```sh
export GITHUB_TOKEN=github_pat_xxxxxxxxxxxxx
```

Token can be omitted from config file:
```json
{
  "github": {
    "owner": "your-org",
    "repo": "your-repo"
  }
}
```

## Notes
- CSV file must be UTF-8 encoded
- Be aware of GitHub API rate limits when creating many issues
- Label colors are auto-generated but can be changed later in GitHub UI

## License
MIT

## Contributing
Pull requests are welcome! Please report bugs and feature requests via Issues.
