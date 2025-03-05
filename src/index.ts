import dotenv from 'dotenv';
import { Command } from 'commander';
import { UniformClient } from './client/uniform-client';
import { MigrationOptions, MigrationResult, MigrationService } from './services/migration-service';
import { TeamConfig } from './types/uniform-api';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Define command line options
const program = new Command();
program
  .name('uniform-sso-migration')
  .description('Migrate Uniform.app users from email-based to SSO authentication')
  .version('1.0.0')
  .option(
    '--teams-file <path>',
    'Path to JSON file containing team configurations',
    ''
  )
  .option(
    '--mark-obsolete',
    'Mark existing email-based accounts as obsolete',
    process.env.MARK_OBSOLETE === 'true'
  )
  .option(
    '--no-mark-obsolete',
    'Don\'t mark existing accounts as obsolete'
  )
  .option(
    '--delete-members',
    'Delete existing members instead of marking them as obsolete',
    process.env.DELETE_MEMBERS === 'true'
  )
  .option(
    '--no-delete-members',
    'Don\'t delete existing members'
  )
  .option(
    '--backup',
    'Create a backup of team members before migration',
    process.env.BACKUP === 'true' || true // Enabled by default
  )
  .option(
    '--no-backup',
    'Don\'t create a backup of team members'
  )
  .option(
    '--backup-dir <path>',
    'Directory to store backups',
    process.env.BACKUP_DIR || './backups'
  )
  .option(
    '--restore-from <path>',
    'Restore members from a backup file',
    ''
  )
  .option(
    '--dry-run',
    'Run without making actual changes',
    process.env.DRY_RUN === 'true'
  )
  .option(
    '--no-dry-run',
    'Make actual changes'
  )
  .option(
    '--ignore-emails <emails>',
    'Comma-separated list of additional emails to ignore',
    ''
  );

program.parse();

const options = program.opts();

// Validate required environment variables
const apiUrl = process.env.UNIFORM_API_URL;

if (!apiUrl) {
  console.error('Error: UNIFORM_API_URL environment variable is required');
  process.exit(1);
}

// Get team configurations
let teamConfigs: TeamConfig[] = [];

// Try to load team configurations from file
if (options.teamsFile) {
  try {
    const teamsFilePath = path.resolve(options.teamsFile);
    console.log(`Loading team configurations from ${teamsFilePath}`);
    
    if (!fs.existsSync(teamsFilePath)) {
      console.error(`Error: Teams file not found: ${teamsFilePath}`);
      process.exit(1);
    }
    
    const teamsFileContent = fs.readFileSync(teamsFilePath, 'utf8');
    teamConfigs = JSON.parse(teamsFileContent);
    
    // Validate team configurations
    if (!Array.isArray(teamConfigs)) {
      console.error('Error: Teams file must contain an array of team configurations');
      process.exit(1);
    }
    
    for (const config of teamConfigs) {
      if (!config.teamId || !config.apiKey) {
        console.error('Error: Each team configuration must have teamId and apiKey properties');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error loading teams file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  // Try to load from environment variables for backward compatibility
  const teamIds = process.env.TEAM_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [];
  const apiKey = process.env.UNIFORM_API_KEY;
  
  if (teamIds.length === 0) {
    console.error('Error: No team configurations provided. Use --teams-file option or set TEAM_IDS and UNIFORM_API_KEY in .env file');
    process.exit(1);
  }
  
  if (!apiKey) {
    console.error('Error: UNIFORM_API_KEY environment variable is required when using TEAM_IDS');
    process.exit(1);
  }
  
  // Create team configurations from environment variables
  teamConfigs = teamIds.map(teamId => ({ teamId, apiKey }));
}

// Get additional ignored emails
const envIgnoredEmails = process.env.IGNORED_EMAILS 
  ? process.env.IGNORED_EMAILS.split(',').map(email => email.trim()).filter(Boolean)
  : [];

const additionalIgnoredEmails = options.ignoreEmails
  ? options.ignoreEmails.split(',').map((email: string) => email.trim()).filter(Boolean)
  : [];

// Combine ignored emails from both sources
const ignoredEmails = [...new Set([...envIgnoredEmails, ...additionalIgnoredEmails])];

// Create backup options
const backupOptions = {
  enabled: options.backup,
  path: options.backupDir
};

// Create migration options
const migrationOptions: MigrationOptions = {
  markObsolete: options.markObsolete && !options.deleteMembers,
  deleteMembers: options.deleteMembers,
  dryRun: options.dryRun,
  backup: backupOptions,
  ignoredEmails: ignoredEmails,
};

// Create client and service
const client = new UniformClient(apiUrl);
const migrationService = new MigrationService(client, migrationOptions);

// Run the migration or restore
async function run() {
  if (options.restoreFrom) {
    await runRestore();
  } else {
    await runMigration();
  }
}

// Run the restore process
async function runRestore() {
  console.log('Starting Uniform SSO Restore');
  console.log('============================');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Backup file: ${options.restoreFrom}`);
  console.log(`Dry run: ${migrationOptions.dryRun}`);
  
  if (ignoredEmails.length > 0) {
    console.log(`Ignored emails: ${ignoredEmails.join(', ')}`);
  }
  
  console.log('============================\n');

  const results: { teamId: string; success: boolean; membersRestored: number; errors: string[] }[] = [];

  // Process each team
  for (const teamConfig of teamConfigs) {
    try {
      console.log(`Processing team ${teamConfig.teamId} with API key ${teamConfig.apiKey.substring(0, 5)}...`);
      const result = await migrationService.restoreFromBackup(options.restoreFrom, teamConfig);
      results.push({
        teamId: teamConfig.teamId,
        ...result
      });
    } catch (error) {
      console.error(`Error restoring team ${teamConfig.teamId}:`, error);
    }
  }

  // Print summary
  console.log('\n============================');
  console.log('Restore Summary');
  console.log('============================');
  
  let totalRestored = 0;
  let totalErrors = 0;

  for (const result of results) {
    console.log(`\nTeam: ${result.teamId}`);
    console.log(`- Members restored: ${result.membersRestored}`);
    console.log(`- Errors: ${result.errors.length}`);

    totalRestored += result.membersRestored;
    totalErrors += result.errors.length;

    // Print errors if any
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
  }

  console.log('\nTotal:');
  console.log(`- Members restored: ${totalRestored}`);
  console.log(`- Errors: ${totalErrors}`);
  console.log('============================');

  if (migrationOptions.dryRun) {
    console.log('\nThis was a DRY RUN. No actual changes were made.');
    console.log('To make actual changes, run with --no-dry-run option.');
  }
}

// Run the migration
async function runMigration() {
  console.log('Starting Uniform SSO Migration');
  console.log('==============================');
  console.log(`API URL: ${apiUrl}`);
  console.log(`Teams to process: ${teamConfigs.map(config => config.teamId).join(', ')}`);
  console.log(`Mark obsolete: ${migrationOptions.markObsolete}`);
  console.log(`Delete members: ${migrationOptions.deleteMembers}`);
  console.log(`Backup enabled: ${migrationOptions.backup.enabled}`);
  console.log(`Backup directory: ${migrationOptions.backup.path}`);
  console.log(`Dry run: ${migrationOptions.dryRun}`);
  
  if (ignoredEmails.length > 0) {
    console.log(`Ignored emails: ${ignoredEmails.join(', ')}`);
  }
  
  console.log('==============================\n');

  const results: MigrationResult[] = [];

  // Process each team
  for (const teamConfig of teamConfigs) {
    try {
      console.log(`Processing team ${teamConfig.teamId} with API key ${teamConfig.apiKey.substring(0, 5)}...`);
      const result = await migrationService.migrateTeam(teamConfig);
      results.push(result);
    } catch (error) {
      console.error(`Error migrating team ${teamConfig.teamId}:`, error);
    }
  }

  // Print summary
  console.log('\n==============================');
  console.log('Migration Summary');
  console.log('==============================');
  
  let totalMembers = 0;
  let totalSkipped = 0;
  let totalMarkedObsolete = 0;
  let totalDeleted = 0;
  let totalInvitations = 0;
  let totalBackups = 0;
  let totalErrors = 0;

  for (const result of results) {
    console.log(`\nTeam: ${result.teamId}`);
    console.log(`- Members found: ${result.membersFound}`);
    console.log(`- Members skipped: ${result.skippedMembers}`);
    console.log(`- Members marked obsolete: ${result.membersMarkedObsolete}`);
    console.log(`- Members deleted: ${result.membersDeleted}`);
    console.log(`- Invitations sent: ${result.invitationsSent}`);
    console.log(`- Backup created: ${result.backupCreated ? 'Yes' : 'No'}`);
    if (result.backupPath) {
      console.log(`  - Backup path: ${result.backupPath}`);
    }
    console.log(`- Errors: ${result.errors.length}`);

    totalMembers += result.membersFound;
    totalSkipped += result.skippedMembers;
    totalMarkedObsolete += result.membersMarkedObsolete;
    totalDeleted += result.membersDeleted;
    totalInvitations += result.invitationsSent;
    totalBackups += result.backupCreated ? 1 : 0;
    totalErrors += result.errors.length;

    // Print errors if any
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
  }

  console.log('\nTotal:');
  console.log(`- Members found: ${totalMembers}`);
  console.log(`- Members skipped: ${totalSkipped}`);
  console.log(`- Members marked obsolete: ${totalMarkedObsolete}`);
  console.log(`- Members deleted: ${totalDeleted}`);
  console.log(`- Invitations sent: ${totalInvitations}`);
  console.log(`- Backups created: ${totalBackups}`);
  console.log(`- Errors: ${totalErrors}`);
  console.log('==============================');

  if (migrationOptions.dryRun) {
    console.log('\nThis was a DRY RUN. No actual changes were made.');
    console.log('To make actual changes, run with --no-dry-run option.');
  }
}

// Run the migration or restore and handle errors
run()
  .catch((error) => {
    console.error('Operation failed:', error);
    process.exit(1);
  }); 