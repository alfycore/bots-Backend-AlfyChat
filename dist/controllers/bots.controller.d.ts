import { Response } from 'express';
import { AuthRequest } from '../types';
export declare class BotsController {
    create(req: AuthRequest, res: Response): Promise<void>;
    getById(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getMyBots(req: AuthRequest, res: Response): Promise<void>;
    getPublicBots(req: AuthRequest, res: Response): Promise<void>;
    update(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    delete(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    regenerateToken(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    updateStatus(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getCommands(req: AuthRequest, res: Response): Promise<void>;
    createCommand(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    updateCommand(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    deleteCommand(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    addToServer(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    removeFromServer(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getBotsInServer(req: AuthRequest, res: Response): Promise<void>;
    authenticate(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
export declare const botsController: BotsController;
//# sourceMappingURL=bots.controller.d.ts.map