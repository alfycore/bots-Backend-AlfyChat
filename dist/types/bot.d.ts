export type BotStatus = 'online' | 'offline' | 'maintenance';
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
//# sourceMappingURL=bot.d.ts.map