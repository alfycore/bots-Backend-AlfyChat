import { Bot, BotCommand, CreateBotDTO, CreateCommandDTO, AddBotToServerDTO, BotStatus } from '../types';
export declare class BotsService {
    private get db();
    private get redis();
    private generateBotToken;
    create(data: CreateBotDTO): Promise<Bot>;
    getById(id: string, includeToken?: boolean): Promise<Bot | null>;
    getByOwner(ownerId: string): Promise<Bot[]>;
    getPublicBots(): Promise<Bot[]>;
    update(id: string, ownerId: string, updates: Partial<Bot>): Promise<Bot | null>;
    delete(id: string, ownerId: string): Promise<boolean>;
    regenerateToken(id: string, ownerId: string): Promise<string | null>;
    updateStatus(id: string, status: BotStatus): Promise<boolean>;
    getCommands(botId: string): Promise<BotCommand[]>;
    createCommand(data: CreateCommandDTO): Promise<BotCommand>;
    updateCommand(id: string, botId: string, updates: Partial<BotCommand>): Promise<BotCommand | null>;
    deleteCommand(id: string, botId: string): Promise<boolean>;
    getBotServers(botId: string): Promise<string[]>;
    addToServer(data: AddBotToServerDTO): Promise<boolean>;
    removeFromServer(botId: string, serverId: string): Promise<boolean>;
    getBotsInServer(serverId: string): Promise<Bot[]>;
    authenticateBot(token: string): Promise<Bot | null>;
}
export declare const botsService: BotsService;
//# sourceMappingURL=bots.service.d.ts.map