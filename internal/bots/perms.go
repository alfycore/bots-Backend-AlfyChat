// ==========================================
// ALFYCHAT - DROITS SERVEUR (lecture base partagée)
// Ajouter/retirer un bot d'un serveur, ou l'autoriser via OAuth2 avec le
// scope `bot`, exige d'être propriétaire ou ADMIN du serveur (même bitmask
// que gateway/servers : ADMIN = 0x40).
// ==========================================

package bots

import (
	"context"

	"github.com/alfychat/bots/internal/platform"
)

const (
	permAdmin    = 0x40
	allPermsMask = 0xFFF
)

func toPerms(raw any) int32 {
	v := raw
	if s, ok := raw.(string); ok {
		parsed, err := platform.ParseJSON([]byte(s))
		if err != nil {
			return 0
		}
		v = parsed
	}
	n := platform.ToNumber(v)
	if !platform.Truthy(n) {
		n = 0
	}
	return platform.ToInt32(n) & allPermsMask
}

// canManageServerBots : l'utilisateur peut-il gérer les bots de ce serveur ?
func (s *Store) canManageServerBots(ctx context.Context, userID string, serverID any) (bool, error) {
	if userID == "" || !platform.Truthy(serverID) {
		return false, nil
	}
	server, err := s.db.First(ctx, "SELECT owner_id FROM servers WHERE id = ?", platform.SQLParam(serverID))
	if err != nil || server == nil {
		return false, err
	}
	if server.Str("owner_id") == userID && server.Get("owner_id") != nil {
		return true, nil
	}

	member, err := s.db.First(ctx, "SELECT role_ids FROM server_members WHERE server_id = ? AND user_id = ?", platform.SQLParam(serverID), userID)
	if err != nil || member == nil {
		return false, err
	}
	raw := member.Get("role_ids")
	var roleIDs any
	if str, ok := raw.(string); ok {
		parsed, err := platform.ParseJSON([]byte(str))
		if err != nil {
			parsed = []any{}
		}
		roleIDs = parsed
	} else if platform.Truthy(raw) {
		roleIDs = raw
	} else {
		roleIDs = []any{}
	}
	ids, ok := roleIDs.([]any)
	if !ok || len(ids) == 0 {
		return false, nil
	}

	params := append([]any{platform.SQLParam(serverID)}, sqlParams(ids)...)
	roles, err := s.db.Rows(ctx,
		"SELECT permissions FROM roles WHERE server_id = ? AND id IN ("+platform.Placeholders(len(ids))+")", params...)
	if err != nil {
		return false, err
	}
	for _, r := range roles {
		if toPerms(r.Get("permissions"))&permAdmin != 0 {
			return true, nil
		}
	}
	return false, nil
}

func sqlParams(vals []any) []any {
	out := make([]any, len(vals))
	for i, v := range vals {
		out[i] = platform.SQLParam(v)
	}
	return out
}

// isPlatformAdmin relit le rôle plateforme en base.
func (s *Store) isPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	row, err := s.db.First(ctx, "SELECT role FROM users WHERE id = ?", userID)
	if err != nil || row == nil {
		return false, err
	}
	return row.Str("role") == "admin", nil
}

// sanitizeBotPermissions : permissions demandées pour un bot, bornées, jamais ADMIN.
func sanitizeBotPermissions(raw any) int32 {
	n := platform.ToNumber(raw)
	if !platform.IsInteger(n) || n < 0 {
		return 0
	}
	return platform.ToInt32(n) & allPermsMask &^ permAdmin
}
