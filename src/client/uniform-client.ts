import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import {
  ApiResponse,
  DeleteMemberRequest,
  GetMembersResponse,
  InviteMemberRequest,
  Member,
  ProjectInvite,
  UpdateMemberRequest,
} from '../types/uniform-api';

export class UniformClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all members for a team
   * @param teamId The team ID
   * @param apiKey The API key for the team
   * @param includeMetadata Whether to include metadata
   * @returns A list of members
   */
  async getMembers(teamId: string, apiKey: string, includeMetadata = true): Promise<ApiResponse<Member[]>> {
    const config: AxiosRequestConfig = {
      params: {
        teamId,
        type: 'member',
        includeMetadata,
      },
      headers: {
        'x-api-key': apiKey,
      },
    };

    try {
      const response = await this.client.get<GetMembersResponse>('/members', config);
      return {
        data: response.data.members,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response) {
        return {
          data: [],
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
        };
      }
      throw error;
    }
  }

  /**
   * Invite a new member to a team
   * @param request The invitation request
   * @param apiKey The API key for the team
   * @returns The API response
   */
  async inviteMember(request: InviteMemberRequest, apiKey: string): Promise<ApiResponse<any>> {
    try {
      console.log(`Making POST request to /members with data:`, JSON.stringify(request, null, 2));
      
      const config: AxiosRequestConfig = {
        headers: {
          'x-api-key': apiKey,
        },
      };
      
      const response = await this.client.post('/members', request, config);
      
      console.log(`Invite response status: ${response.status} ${response.statusText}`);
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response) {
        console.error(`Invite request failed with status: ${axiosError.response.status}`);
        console.error(`Error response data:`, JSON.stringify(axiosError.response.data, null, 2));
        
        return {
          data: axiosError.response.data || {},
          status: axiosError.response.status,
          statusText: axiosError.response.statusText || 'Unknown Error',
        };
      }
      console.error(`Unexpected error during invitation:`, error);
      throw error;
    }
  }

  /**
   * Update an existing member
   * @param request The update request
   * @param apiKey The API key for the team
   * @returns The API response
   */
  async updateMember(request: UpdateMemberRequest, apiKey: string): Promise<ApiResponse<any>> {
    try {
      console.log(`Making PATCH request to /members with data:`, JSON.stringify(request, null, 2));
      
      const config: AxiosRequestConfig = {
        headers: {
          'x-api-key': apiKey,
        },
      };
      
      const response = await this.client.patch('/members', request, config);
      
      console.log(`Update response status: ${response.status} ${response.statusText}`);
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response) {
        console.error(`Update request failed with status: ${axiosError.response.status}`);
        console.error(`Error response data:`, JSON.stringify(axiosError.response.data, null, 2));
        
        return {
          data: axiosError.response.data || {},
          status: axiosError.response.status,
          statusText: axiosError.response.statusText || 'Unknown Error',
        };
      }
      console.error(`Unexpected error during update:`, error);
      throw error;
    }
  }

  /**
   * Delete a member from a team
   * @param request The delete request
   * @param apiKey The API key for the team
   * @returns The API response
   */
  async deleteMember(request: DeleteMemberRequest, apiKey: string): Promise<ApiResponse<any>> {
    try {
      console.log(`Making DELETE request to /members with data:`, JSON.stringify(request, null, 2));
      
      const config: AxiosRequestConfig = {
        headers: {
          'x-api-key': apiKey,
        },
        data: request,
      };
      
      const response = await this.client.delete('/members', config);
      
      console.log(`Delete response status: ${response.status} ${response.statusText}`);
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      if (axiosError.isAxiosError && axiosError.response) {
        console.error(`Delete request failed with status: ${axiosError.response.status}`);
        console.error(`Error response data:`, JSON.stringify(axiosError.response.data, null, 2));
        
        return {
          data: axiosError.response.data || {},
          status: axiosError.response.status,
          statusText: axiosError.response.statusText || 'Unknown Error',
        };
      }
      console.error(`Unexpected error during deletion:`, error);
      throw error;
    }
  }

  /**
   * Convert a member's project roles to the format needed for invitations
   * @param member The member
   * @returns An array of project invites
   */
  convertMemberProjectsToInvites(member: Member): ProjectInvite[] {
    return Object.entries(member.projects).map(([projectId, projectRoles]) => ({
      projectId,
      roles: projectRoles.roles,
      permissions: projectRoles.customPermissions,
      useCustom: !!projectRoles.customPermissions?.length,
    }));
  }
} 