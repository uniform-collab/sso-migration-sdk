import { UniformClient } from '../client/uniform-client';
import {
  BackupOptions,
  DeleteMemberRequest,
  InviteMemberRequest,
  Member,
  TeamConfig,
  UpdateMemberRequest,
} from '../types/uniform-api';
import * as fs from 'fs';
import * as path from 'path';

export interface MigrationOptions {
  markObsolete: boolean;
  deleteMembers: boolean;
  dryRun: boolean;
  backup: BackupOptions;
  ignoredEmails?: string[];
}

export interface MigrationResult {
  teamId: string;
  membersFound: number;
  membersMarkedObsolete: number;
  membersDeleted: number;
  invitationsSent: number;
  skippedMembers: number;
  backupCreated: boolean;
  backupPath?: string;
  errors: string[];
}

export class MigrationService {
  private client: UniformClient;
  private options: MigrationOptions;
  //private readonly defaultIgnoredEmails = ["artemn@uniform.dev"];
  private readonly defaultIgnoredEmails = [];

  constructor(client: UniformClient, options: MigrationOptions) {
    this.client = client;
    this.options = {
      ...options,
      ignoredEmails: [
        ...(options.ignoredEmails || []),
        ...this.defaultIgnoredEmails,
      ],
    };
  }

  /**
   * Migrate members for a specific team
   * @param teamConfig The team configuration with ID and API key
   * @returns Migration results
   */
  async migrateTeam(teamConfig: TeamConfig): Promise<MigrationResult> {
    const { teamId, apiKey } = teamConfig;
    
    const result: MigrationResult = {
      teamId,
      membersFound: 0,
      membersMarkedObsolete: 0,
      membersDeleted: 0,
      invitationsSent: 0,
      skippedMembers: 0,
      backupCreated: false,
      errors: [],
    };

    console.log(`\nStarting migration for team: ${teamId}`);
    console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Backup enabled: ${this.options.backup.enabled}`);
    console.log(`Ignored emails: ${this.options.ignoredEmails?.join(', ') || 'None'}`);
    
    try {
      // Get all members for the team
      const membersResponse = await this.client.getMembers(teamId, apiKey);
      
      if (membersResponse.status !== 200) {
        result.errors.push(`Failed to get members: ${membersResponse.statusText}`);
        return result;
      }

      const members = membersResponse.data;
      result.membersFound = members.length;
      
      console.log(`Found ${members.length} members in team ${teamId}`);

      // Create backup if enabled
      if (this.options.backup.enabled && members.length > 0) {
        try {
          const backupResult = await this.backupMembers(teamId, members);
          result.backupCreated = backupResult.success;
          result.backupPath = backupResult.path;
          
          if (backupResult.success) {
            console.log(`Backup created at: ${backupResult.path}`);
          } else {
            console.error(`Failed to create backup: ${backupResult.error}`);
            result.errors.push(`Failed to create backup: ${backupResult.error}`);
            
            // If backup is required for deletion and it failed, abort the migration
            if (this.options.deleteMembers && !this.options.dryRun) {
              console.error('Aborting migration because backup failed and delete members is enabled');
              result.errors.push('Migration aborted because backup failed and delete members is enabled');
              return result;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error creating backup: ${errorMessage}`);
          result.errors.push(`Error creating backup: ${errorMessage}`);
          
          // If backup is required for deletion and it failed, abort the migration
          if (this.options.deleteMembers && !this.options.dryRun) {
            console.error('Aborting migration because backup failed and delete members is enabled');
            result.errors.push('Migration aborted because backup failed and delete members is enabled');
            return result;
          }
        }
      }

      // Process each member
      for (const member of members) {
        try {
          // Skip ignored emails
          if (this.shouldIgnoreMember(member)) {
            console.log(`Skipping ignored member: ${member.name} (${member.email})`);
            result.skippedMembers++;
            continue;
          }
          
          await this.processMember(member, teamConfig, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Error processing member ${member.email}: ${errorMessage}`);
          console.error(`Error processing member ${member.email}:`, error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error migrating team ${teamId}: ${errorMessage}`);
      console.error(`Error migrating team ${teamId}:`, error);
    }

    return result;
  }

  /**
   * Backup team members to a JSON file
   * @param teamId The team ID
   * @param members The members to backup
   * @returns Backup result
   */
  private async backupMembers(teamId: string, members: Member[]): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // Create backup directory if it doesn't exist
      const backupDir = path.resolve(this.options.backup.path);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Create backup file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `team-${teamId}-backup-${timestamp}.json`;
      const backupFilePath = path.join(backupDir, backupFileName);

      // Write members to backup file
      fs.writeFileSync(backupFilePath, JSON.stringify(members, null, 2), 'utf8');

      return {
        success: true,
        path: backupFilePath
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Check if a member should be ignored based on email
   * @param member The member to check
   * @returns True if the member should be ignored
   */
  private shouldIgnoreMember(member: Member): boolean {
    return (
      this.options.ignoredEmails?.some(
        (email) => email.toLowerCase() === member.email.toLowerCase()
      ) || false
    );
  }

  /**
   * Process a single member
   * @param member The member to process
   * @param teamConfig The team configuration
   * @param result The migration result to update
   */
  private async processMember(
    member: Member,
    teamConfig: TeamConfig,
    result: MigrationResult
  ): Promise<void> {
    const { teamId, apiKey } = teamConfig;
    
    console.log(`Processing member: ${member.name} (${member.email})`);

    // Delete the member if configured
    if (this.options.deleteMembers) {
      await this.deleteMember(member, teamConfig, result);
    }
    // Mark the existing member as obsolete if configured (and not deleting)
    else if (this.options.markObsolete) {
      await this.markMemberAsObsolete(member, teamConfig, result);
    }

    // Send a new invitation with the same roles
    await this.sendNewInvitation(member, teamConfig, result);
  }

  /**
   * Mark a member as obsolete
   * @param member The member to mark as obsolete
   * @param teamConfig The team configuration
   * @param result The migration result to update
   */
  private async markMemberAsObsolete(
    member: Member,
    teamConfig: TeamConfig,
    result: MigrationResult
  ): Promise<void> {
    const { teamId, apiKey } = teamConfig;
    const obsoleteName = `OBSOLETE - ${member.name}`;

    console.log(
      `Marking member as obsolete: ${member.name} -> ${obsoleteName}`
    );

    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would mark ${member.email} as obsolete`);
      result.membersMarkedObsolete++;
      return;
    }

    // Convert member's projects to the format needed for the update request
    const projects = this.client.convertMemberProjectsToInvites(member);

    const updateRequest: UpdateMemberRequest = {
      identity_subject: member.subject,
      teamId,
      name: obsoleteName,
      isAdmin: member.isTeamAdmin,
      projects: projects,
    };

    console.log(
      `Sending update request for ${member.email}:`,
      JSON.stringify(updateRequest, null, 2)
    );

    const response = await this.client.updateMember(updateRequest, apiKey);

    if (response.status >= 200 && response.status < 300) {
      console.log(`Successfully marked ${member.email} as obsolete`);
      result.membersMarkedObsolete++;
    } else {
      const errorMessage = `Failed to mark ${member.email} as obsolete: ${response.statusText}`;
      console.error(errorMessage);
      console.error(`Response data:`, JSON.stringify(response.data, null, 2));
      result.errors.push(errorMessage);
    }
  }

  /**
   * Send a new invitation to a member
   * @param member The member to invite
   * @param teamConfig The team configuration
   * @param result The migration result to update
   */
  private async sendNewInvitation(
    member: Member,
    teamConfig: TeamConfig,
    result: MigrationResult
  ): Promise<void> {
    const { teamId, apiKey } = teamConfig;
    const projects = this.client.convertMemberProjectsToInvites(member);

    console.log(
      `Sending new invitation to ${member.email} with ${projects.length} projects`
    );

    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would send invitation to ${member.email}`);
      result.invitationsSent++;
      return;
    }

    const inviteRequest: InviteMemberRequest = {
      email: member.email,
      name: member.name,
      isAdmin: member.isTeamAdmin,
      teamId,
      projects,
      sendEmail: true,
    };

    console.log(
      `Sending invitation request for ${member.email}:`,
      JSON.stringify(inviteRequest, null, 2)
    );

    const response = await this.client.inviteMember(inviteRequest, apiKey);

    if (response.status >= 200 && response.status < 300) {
      console.log(`Successfully sent invitation to ${member.email}`);
      result.invitationsSent++;
    } else {
      const errorMessage = `Failed to send invitation to ${member.email}: ${response.statusText}`;
      console.error(errorMessage);
      console.error(`Response data:`, JSON.stringify(response.data, null, 2));
      result.errors.push(errorMessage);
    }
  }

  /**
   * Delete a member from a team
   * @param member The member to delete
   * @param teamConfig The team configuration
   * @param result The migration result to update
   */
  private async deleteMember(member: Member, teamConfig: TeamConfig, result: MigrationResult): Promise<void> {
    const { teamId, apiKey } = teamConfig;
    
    console.log(`Deleting member: ${member.name} (${member.email})`);
    
    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would delete ${member.email}`);
      result.membersDeleted++;
      return;
    }

    const deleteRequest: DeleteMemberRequest = {
      teamId,
      subject: member.subject
    };

    console.log(`Sending delete request for ${member.email}:`, JSON.stringify(deleteRequest, null, 2));
    
    const response = await this.client.deleteMember(deleteRequest, apiKey);
    
    if (response.status >= 200 && response.status < 300) {
      console.log(`Successfully deleted ${member.email}`);
      result.membersDeleted++;
    } else {
      const errorMessage = `Failed to delete ${member.email}: ${response.statusText}`;
      console.error(errorMessage);
      console.error(`Response data:`, JSON.stringify(response.data, null, 2));
      result.errors.push(errorMessage);
    }
  }

  /**
   * Restore members from a backup file
   * @param backupFilePath Path to the backup file
   * @param teamConfig Team configuration
   * @returns Restore result
   */
  async restoreFromBackup(backupFilePath: string, teamConfig: TeamConfig): Promise<{
    success: boolean;
    membersRestored: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      membersRestored: 0,
      errors: [] as string[],
    };

    console.log(`\nRestoring members for team: ${teamConfig.teamId}`);
    console.log(`From backup file: ${backupFilePath}`);
    console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);

    try {
      // Check if backup file exists
      if (!fs.existsSync(backupFilePath)) {
        const error = `Backup file not found: ${backupFilePath}`;
        console.error(error);
        result.errors.push(error);
        return result;
      }

      // Read backup file
      const backupData = fs.readFileSync(backupFilePath, 'utf8');
      const members = JSON.parse(backupData) as Member[];

      console.log(`Found ${members.length} members in backup file`);

      if (this.options.dryRun) {
        console.log(`[DRY RUN] Would restore ${members.length} members`);
        result.success = true;
        return result;
      }

      // Process each member
      for (const member of members) {
        try {
          // Skip ignored emails
          if (this.shouldIgnoreMember(member)) {
            console.log(`Skipping ignored member: ${member.name} (${member.email})`);
            continue;
          }

          // Send invitation for the member
          await this.sendNewInvitation(member, teamConfig, {
            teamId: teamConfig.teamId,
            membersFound: 0,
            membersMarkedObsolete: 0,
            membersDeleted: 0,
            invitationsSent: 0,
            skippedMembers: 0,
            backupCreated: false,
            errors: [],
          });

          result.membersRestored++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Error restoring member ${member.email}: ${errorMessage}`);
          console.error(`Error restoring member ${member.email}:`, error);
        }
      }

      result.success = result.membersRestored > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error restoring from backup: ${errorMessage}`);
      console.error(`Error restoring from backup:`, error);
    }

    return result;
  }
}
