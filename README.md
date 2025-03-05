# Uniform SSO Migration Tool

This tool helps migrate users from email-based authentication to SSO in Uniform.app by:
1. Fetching all existing members and their roles from specified teams
2. Creating backups of team members before any modifications
3. Optionally marking existing email-based accounts as obsolete or deleting them
4. Sending new invitations to users with the same roles and permissions

## Prerequisites

- Node.js 16 or higher
- Team Admin API key for each team you want to migrate

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd uniform-sso-migration

# Install dependencies
npm install

# Copy the example environment file and edit it
cp .env.example .env

# For multiple teams with different API keys, create a teams.json file
cp teams.json.example teams.json
```

## Configuration

### Single API Key Configuration

If you're using the same API key for all teams, you can use the `.env` file:

```
UNIFORM_API_URL=https://uniform.app/api/v1
UNIFORM_API_KEY=your_team_admin_api_key
TEAM_IDS=team_id_1,team_id_2
MARK_OBSOLETE=true
DELETE_MEMBERS=false
DRY_RUN=true
BACKUP=true
BACKUP_DIR=./backups
IGNORED_EMAILS=user1@example.com,user2@example.com
```

- `UNIFORM_API_URL`: The Uniform API URL
- `UNIFORM_API_KEY`: Your Team Admin API key
- `TEAM_IDS`: Comma-separated list of team IDs to process
- `MARK_OBSOLETE`: Set to `true` to mark existing email-based accounts as obsolete
- `DELETE_MEMBERS`: Set to `true` to delete existing members instead of marking them as obsolete
- `DRY_RUN`: Set to `true` to run without making actual changes (recommended for testing)
- `BACKUP`: Set to `true` to create backups of team members before migration
- `BACKUP_DIR`: Directory to store backups
- `IGNORED_EMAILS`: Comma-separated list of additional emails to ignore during migration

### Multiple API Keys Configuration

If you have multiple teams with different API keys, create a `teams.json` file:

```json
[
  {
    "teamId": "team_id_1",
    "apiKey": "api_key_for_team_1"
  },
  {
    "teamId": "team_id_2",
    "apiKey": "api_key_for_team_2"
  }
]
```

Each entry in the array should have:
- `teamId`: The ID of the team to process
- `apiKey`: The Team Admin API key for that team

## Usage

### Migration

```bash
# Build the project
npm run build

# Run the migration with .env configuration
npm start

# Or run with a teams.json file
npm start -- --teams-file ./teams.json --mark-obsolete --no-dry-run

# Or run with specific options to delete members instead of marking them as obsolete
npm start -- --teams-file ./teams.json --delete-members --no-dry-run --ignore-emails user1@example.com,user2@example.com
```

### Backup and Restore

The tool automatically creates backups of team members before any modifications. You can also restore members from a backup:

```bash
# Run with backup enabled (default)
npm start -- --teams-file ./teams.json --backup --backup-dir ./my-backups

# Disable backup
npm start -- --teams-file ./teams.json --no-backup

# Restore members from a backup file
npm start -- --teams-file ./teams.json --restore-from ./backups/team-123-backup-2023-05-01T12-00-00-000Z.json
```

## Command Line Options

The tool supports the following command line options:

- `--teams-file <path>`: Path to JSON file containing team configurations
- `--mark-obsolete`: Mark existing email-based accounts as obsolete
- `--no-mark-obsolete`: Don't mark existing accounts as obsolete
- `--delete-members`: Delete existing members instead of marking them as obsolete
- `--no-delete-members`: Don't delete existing members
- `--backup`: Create a backup of team members before migration (default: true)
- `--no-backup`: Don't create a backup of team members
- `--backup-dir <path>`: Directory to store backups (default: ./backups)
- `--restore-from <path>`: Restore members from a backup file
- `--dry-run`: Run without making actual changes
- `--no-dry-run`: Make actual changes
- `--ignore-emails <emails>`: Comma-separated list of additional emails to ignore
- `--help`: Show help information

## Member Handling Options

The tool provides two options for handling existing members:

1. **Mark as Obsolete** (default): Prefixes the member's name with "OBSOLETE - " but keeps the account in the system.
2. **Delete Members**: Completely removes the member from the team.

These options are mutually exclusive. If both are specified, the delete option takes precedence.

## Backup and Restore

### Backup

By default, the tool creates a backup of all team members before any modifications. Backups are stored in the specified backup directory (default: `./backups`) with filenames in the format `team-{teamId}-backup-{timestamp}.json`.

If the `--delete-members` option is enabled and backup creation fails, the migration will be aborted to prevent data loss.

### Restore

You can restore members from a backup file using the `--restore-from` option. This will send new invitations to all members in the backup file, preserving their roles and permissions.

## Ignored Emails

By default, the following emails are always ignored during migration:
- `artemn@uniform.dev`

You can add more emails to ignore using the `--ignore-emails` option or the `IGNORED_EMAILS` environment variable.

## Output

The tool will generate a detailed report of actions taken or simulated, including:
- Members found in each team
- Members skipped (ignored emails)
- Members marked as obsolete
- Members deleted
- Invitations sent
- Backups created 