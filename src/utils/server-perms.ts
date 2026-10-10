// ==========================================
// ALFYCHAT - DROITS SERVEUR (lecture base partagée)
// ==========================================
// Ajouter/retirer un bot d'un serveur, ou l'autoriser via OAuth2 avec le scope
// `bot`, ne vérifiait AUCUN droit sur le serveur visé : n'importe quel compte
// installait son propre bot, avec les permissions de son choix, sur n'importe
// quel serveur. On exige désormais propriétaire ou ADMIN (même bitmask que
// gateway/servers : ADMIN = 0x40).

import { getDatabase } from '../index';

const PERM_ADMIN = 0x40;
const ALL_PERMS_MASK = 0xFFF;

function toPerms(raw: unknown): number {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (Number(v) || 0) & ALL_PERMS_MASK;
  } catch {
    return 0;
  }
}

/** L'utilisateur peut-il gérer les intégrations (bots) de ce serveur ? */
export async function canManageServerBots(userId: string, serverId: string): Promise<boolean> {
  if (!userId || !serverId) return false;
  const db = getDatabase();
  const [servers] = await db.execute('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
  const server = (servers as any[])[0];
  if (!server) return false;
  if (server.owner_id === userId) return true;

  const [members] = await db.execute(
    'SELECT role_ids FROM server_members WHERE server_id = ? AND user_id = ?',
    [serverId, userId]
  );
  const member = (members as any[])[0];
  if (!member) return false;

  let roleIds: string[] = [];
  try {
    const raw = member.role_ids;
    roleIds = typeof raw === 'string' ? JSON.parse(raw) : raw || [];
  } catch { roleIds = []; }
  if (!Array.isArray(roleIds) || roleIds.length === 0) return false;

  const placeholders = roleIds.map(() => '?').join(',');
  const [roles] = await db.execute(
    `SELECT permissions FROM roles WHERE server_id = ? AND id IN (${placeholders})`,
    [serverId, ...roleIds]
  );
  return (roles as any[]).some((r) => (toPerms(r.permissions) & PERM_ADMIN) !== 0);
}

/** Rôle plateforme (admin) relu en base. */
export async function isPlatformAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const [rows] = await getDatabase().execute('SELECT role FROM users WHERE id = ?', [userId]);
  return (rows as any[])[0]?.role === 'admin';
}

/** Permissions demandées pour un bot : bornées, jamais ADMIN. */
export function sanitizeBotPermissions(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n & ALL_PERMS_MASK & ~PERM_ADMIN;
}
