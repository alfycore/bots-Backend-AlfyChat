import mysql from 'mysql2/promise';
import { RedisClientType } from 'redis';
import winston from 'winston';
declare const app: import("express-serve-static-core").Express;
declare const logger: winston.Logger;
export declare function getDatabase(): mysql.Pool;
export declare function getRedis(): RedisClientType;
export { app, logger };
//# sourceMappingURL=index.d.ts.map