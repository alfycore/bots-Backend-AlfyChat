// ==========================================
// ALFYCHAT - TYPES BOTS (v2)
// ==========================================

export type BotStatus = 'online' | 'offline' | 'maintenance';

export type CertificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Bot {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  token: string;
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
