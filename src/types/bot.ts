// ==========================================
// ALFYCHAT - TYPES BOTS (v2)
// ==========================================

export type BotStatus = 'online' | 'offline' | 'maintenance';

export type CertificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type OAuth2Scope = 'bot' | 'identify' | 'guilds';

export interface Bot {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  token: string;
  clientSecret?: string;
  redirectUris: string[];
  prefix: string;
  status: BotStatus;
  isPublic: boolean;
  isVerified: boolean;
  certificationStatus: CertificationStatus;
  certificationNote?: string;
  inviteCount: number;
  serverCount: number;
  tags: string[];
  websiteUrl?: string;
  supportServerUrl?: string;
  privacyPolicyUrl?: string;
  servers: string[];
  commands: BotCommand[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicApp {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  isVerified: boolean;
  redirectUris: string[];
}

export interface OAuth2Code {
  code: string;
  botId: string;
  userId: string;
  serverId?: string;
  scopes: OAuth2Scope[];
  redirectUri: string;
  permissions: number;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface OAuth2Token {
  accessToken: string;
  botId: string;
  userId: string;
  serverId?: string;
  scopes: OAuth2Scope[];
  expiresAt: Date;
  createdAt: Date;
}

export interface OAuth2AuthorizeDTO {
  clientId: string;
  userId: string;
  serverId?: string;
  redirectUri: string;
  scopes: OAuth2Scope[];
  permissions: number;
}

export interface OAuth2TokenExchangeDTO {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  grantType: 'authorization_code';
}

export interface BotCommand {
  id: string;
  botId: string;
  name: string;
  description: string;
  usage: string;
  isEnabled: boolean;
  cooldown: number;
  permissions: number;
}

export interface CreateBotDTO {
  ownerId: string;
  name: string;
  description?: string;
  prefix?: string;
}

export interface UpdateBotDTO {
  name?: string;
  description?: string;
  avatarUrl?: string;
  prefix?: string;
  isPublic?: boolean;
  tags?: string[];
  websiteUrl?: string;
  supportServerUrl?: string;
  privacyPolicyUrl?: string;
}

export interface CreateCommandDTO {
  botId: string;
  name: string;
  description: string;
  usage?: string;
  cooldown?: number;
  permissions?: number;
}

export interface AddBotToServerDTO {
  botId: string;
  serverId: string;
  permissions: number;
}

export interface CertificationRequestDTO {
  botId: string;
  reason: string;
}

export interface CertificationReviewDTO {
  requestId: string;
  status: 'approved' | 'rejected';
  note?: string;
}
