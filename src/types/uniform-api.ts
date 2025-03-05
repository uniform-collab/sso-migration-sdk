export type UniformPermission =
  | 'OPT_CREATE_ENRICHMENTS'
  | 'OPT_CREATE_INTENTS'
  | 'OPT_CREATE_QUIRKS'
  | 'OPT_CREATE_SIGNALS'
  | 'OPT_CREATE_TESTS'
  | 'OPT_DELETE_ENRICHMENTS'
  | 'OPT_DELETE_INTENTS'
  | 'OPT_DELETE_QUIRKS'
  | 'OPT_DELETE_SIGNALS'
  | 'OPT_DELETE_TESTS'
  | 'OPT_PUB'
  | 'OPT_PUBLISH'
  | 'OPT_READ'
  | 'OPT_WRITE_ENRICHMENTS'
  | 'OPT_WRITE_INTENTS'
  | 'OPT_WRITE_QUIRKS'
  | 'OPT_WRITE_SIGNALS'
  | 'OPT_WRITE_TESTS'
  | 'PRM_SCHEMA'
  | 'PROJECT'
  | 'RDT_ADVANCED'
  | 'RDT_CREATE'
  | 'RDT_DELETE'
  | 'RDT_UPDATE'
  | 'UPM_CREATE'
  | 'UPM_DATACONN'
  | 'UPM_DATATYPE'
  | 'UPM_DELETE'
  | 'UPM_PUB'
  | 'UPM_PUBLISH'
  | 'UPM_READ'
  | 'UPM_RELEASE_CREATE'
  | 'UPM_RELEASE_DELETE'
  | 'UPM_RELEASE_LAUNCH'
  | 'UPM_RELEASE_UPDATE'
  | 'UPM_SCHEMA'
  | 'UPM_WRITE'
  | 'UTM_PUB'
  | 'UTM_WRITE';

export type MemberType = 'member' | 'apiKey';

export interface ProjectRoles {
  roles: string[];
  customPermissions?: UniformPermission[];
  name?: string;
}

export interface Member {
  subject: string;
  name: string;
  email: string;
  picture?: string;
  isTeamAdmin: boolean;
  projects: Record<string, ProjectRoles>;
  type: MemberType;
  memberSince: string;
}

export interface GetMembersResponse {
  members: Member[];
}

export interface ProjectInvite {
  projectId: string;
  useCustom?: boolean;
  roles: string[];
  permissions?: UniformPermission[];
}

export interface InviteMemberRequest {
  projects: ProjectInvite[];
  isAdmin: boolean;
  email: string;
  teamId: string;
  sendEmail: boolean;
  name?: string;
}

export interface UpdateMemberRequest {
  identity_subject: string;
  teamId: string;
  name?: string;
  isAdmin?: boolean;
  projects?: ProjectInvite[];
}

export interface DeleteMemberRequest {
  teamId: string;
  subject: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

export interface TeamConfig {
  teamId: string;
  apiKey: string;
}

export interface BackupOptions {
  enabled: boolean;
  path: string;
} 