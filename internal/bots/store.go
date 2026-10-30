// ==========================================
// ALFYCHAT - BOTS SERVICE (v2)
// Gestion complète des bots, commandes, serveurs et certifications.
// ==========================================

package bots

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"

	"github.com/alfychat/bots/internal/platform"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Store regroupe la base et le Redis optionnel.
type Store struct {
	db    *platform.DB
	redis *redis.Client // nil si Redis est indisponible
}

func randomHex32() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// jsonList lit une colonne JSON : mysql2 la renvoie déjà décodée ; une chaîne
// est re-décodée, et une valeur vide devient [].
func jsonList(v any) any {
	if s, ok := v.(string); ok {
		parsed, err := platform.ParseJSON([]byte(s))
		if err != nil {
			return []any{}
		}
		return parsed
	}
	if !platform.Truthy(v) {
		return []any{}
	}
	return v
}

// mapBot construit la représentation publique d'un bot.
func mapBot(row *platform.Object, servers []any, commands []any, includeToken bool) *platform.Object {
	token := any("[HIDDEN]")
	if includeToken {
		token = row.Get("token")
	}
	certStatus := row.Get("certification_status")
	if !platform.Truthy(certStatus) {
		certStatus = "none"
	}
	inviteCount := row.Get("invite_count")
	if !platform.Truthy(inviteCount) {
		inviteCount = 0
	}
	return platform.O(
		"id", row.Get("id"),
		"ownerId", row.Get("owner_id"),
		"name", row.Get("name"),
		"description", row.Get("description"),
		"avatarUrl", row.Get("avatar_url"),
		"token", token,
		"redirectUris", jsonList(row.Get("redirect_uris")),
		"prefix", row.Get("prefix"),
		"status", row.Get("status"),
		"isPublic", row.Bool("is_public"),
		"isVerified", row.Bool("is_verified"),
		"certificationStatus", certStatus,
		"certificationNote", row.Get("certification_note"),
		"inviteCount", inviteCount,
		"serverCount", len(servers),
		"tags", jsonList(row.Get("tags")),
		"websiteUrl", row.Get("website_url"),
		"supportServerUrl", row.Get("support_server_url"),
		"privacyPolicyUrl", row.Get("privacy_policy_url"),
		"servers", servers,
		"commands", commands,
		"createdAt", dateOrEpoch(row.Get("created_at")),
		"updatedAt", dateOrEpoch(row.Get("updated_at")),
	)
}

// dateOrEpoch reproduit new Date(row.x) : NULL donne l'epoch.
func dateOrEpoch(v any) any {
	if v == nil {
		return "1970-01-01T00:00:00.000Z"
	}
	return v
}

func mapCommand(row *platform.Object) *platform.Object {
	return platform.O(
		"id", row.Get("id"),
		"botId", row.Get("bot_id"),
		"name", row.Get("name"),
		"description", row.Get("description"),
		"usage", row.Get("usage"),
		"isEnabled", row.Bool("is_enabled"),
		"cooldown", row.Get("cooldown"),
		"permissions", row.Get("permissions"),
	)
}

// ── Bots ──────────────────────────────────────────────────────────────────

// Create insère un bot et renvoie sa représentation complète (token et secret).
func (s *Store) Create(ctx context.Context, ownerID string, body *platform.Object) (*platform.Object, error) {
	id := uuid.NewString()
	token := randomHex32()
	clientSecret := randomHex32()
	now := platform.Now()

	description := body.Get("description")
	prefix := platform.Or(body.Get("prefix"), "!")
	descParam := any(nil)
	if platform.Truthy(description) {
		descParam = description
	}
	_, err := s.db.Exec(ctx,
		`INSERT INTO bots (id, owner_id, name, description, token, client_secret, redirect_uris, prefix, status,
        is_public, is_verified, certification_status, invite_count, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'offline', 0, 0, 'none', 0, '[]', ?, ?)`,
		id, ownerID, platform.SQLParam(body.Get("name")), platform.SQLParam(descParam), token, clientSecret,
		platform.SQLParam(prefix), now, now)
	if err != nil {
		return nil, err
	}

	bot := platform.O("id", id, "ownerId", ownerID, "name", body.Get("name"))
	if body.Has("description") && description != platform.Undefined {
		bot.Set("description", description)
	}
	return bot.Set("token", token).
		Set("clientSecret", clientSecret).
		Set("redirectUris", []any{}).
		Set("prefix", prefix).
		Set("status", "offline").
		Set("isPublic", false).
		Set("isVerified", false).
		Set("certificationStatus", "none").
		Set("inviteCount", 0).
		Set("serverCount", 0).
		Set("tags", []any{}).
		Set("servers", []any{}).
		Set("commands", []any{}).
		Set("createdAt", platform.JSDate(now)).
		Set("updatedAt", platform.JSDate(now)), nil
}

// hydrate ajoute serveurs et commandes à une ligne de bot.
func (s *Store) hydrate(ctx context.Context, row *platform.Object, includeToken bool) (*platform.Object, error) {
	servers, err := s.BotServers(ctx, row.Str("id"))
	if err != nil {
		return nil, err
	}
	commands, err := s.Commands(ctx, row.Str("id"))
	if err != nil {
		return nil, err
	}
	return mapBot(row, servers, commands, includeToken), nil
}

func (s *Store) hydrateAll(ctx context.Context, rows []*platform.Object) ([]any, error) {
	out := []any{}
	for _, row := range rows {
		bot, err := s.hydrate(ctx, row, false)
		if err != nil {
			return nil, err
		}
		out = append(out, bot)
	}
	return out, nil
}

// GetByID renvoie le bot ou nil.
func (s *Store) GetByID(ctx context.Context, id any, includeToken bool) (*platform.Object, error) {
	row, err := s.db.First(ctx, "SELECT * FROM bots WHERE id = ?", platform.SQLParam(id))
	if err != nil || row == nil {
		return nil, err
	}
	return s.hydrate(ctx, row, includeToken)
}

func (s *Store) GetByOwner(ctx context.Context, ownerID string) ([]any, error) {
	rows, err := s.db.Rows(ctx, "SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at DESC", ownerID)
	if err != nil {
		return nil, err
	}
	return s.hydrateAll(ctx, rows)
}

func (s *Store) GetPublicBots(ctx context.Context, search, tag any) ([]any, error) {
	query := "SELECT * FROM bots WHERE is_public = 1 AND status != 'maintenance'"
	var params []any
	if platform.Truthy(search) {
		query += " AND (name LIKE ? OR description LIKE ?)"
		pattern := "%" + platform.JSString(search) + "%"
		params = append(params, pattern, pattern)
	}
	if platform.Truthy(tag) {
		query += " AND tags LIKE ?"
		params = append(params, `%"`+platform.JSString(tag)+`"%`)
	}
	query += " ORDER BY invite_count DESC, name ASC"
	rows, err := s.db.Rows(ctx, query, params...)
	if err != nil {
		return nil, err
	}
	return s.hydrateAll(ctx, rows)
}

var botFieldMap = [][2]string{
	{"name", "name"},
	{"description", "description"},
	{"avatarUrl", "avatar_url"},
	{"prefix", "prefix"},
	{"isPublic", "is_public"},
	{"websiteUrl", "website_url"},
	{"supportServerUrl", "support_server_url"},
	{"privacyPolicyUrl", "privacy_policy_url"},
}

// Update applique les champs présents ; nil si le bot n'existe pas ou n'est pas à ownerID.
func (s *Store) Update(ctx context.Context, id, ownerID string, updates *platform.Object) (*platform.Object, error) {
	bot, err := s.GetByID(ctx, id, false)
	if err != nil || bot == nil || bot.Str("ownerId") != ownerID {
		return nil, err
	}
	var set []string
	var values []any
	for _, f := range botFieldMap {
		if v := platform.GetPath(updates, f[0]); v != platform.Undefined {
			set = append(set, f[1]+" = ?")
			values = append(values, platform.SQLParam(v))
		}
	}
	if v := platform.GetPath(updates, "tags"); v != platform.Undefined {
		b, _ := json.Marshal(v)
		set = append(set, "tags = ?")
		values = append(values, string(b))
	}
	if len(set) == 0 {
		return bot, nil
	}
	set = append(set, "updated_at = ?")
	values = append(values, platform.Now(), id)
	if _, err := s.db.Exec(ctx, "UPDATE bots SET "+joinComma(set)+" WHERE id = ?", values...); err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id, false)
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

// Delete supprime le bot et ses dépendances ; false si non autorisé.
func (s *Store) Delete(ctx context.Context, id, ownerID string) (bool, error) {
	bot, err := s.GetByID(ctx, id, false)
	if err != nil || bot == nil || bot.Str("ownerId") != ownerID {
		return false, err
	}
	for _, q := range []string{
		"DELETE FROM bot_servers WHERE bot_id = ?",
		"DELETE FROM bot_commands WHERE bot_id = ?",
		"DELETE FROM bot_certifications WHERE bot_id = ?",
		"DELETE FROM bots WHERE id = ?",
	} {
		if _, err := s.db.Exec(ctx, q, id); err != nil {
			return false, err
		}
	}
	return true, nil
}

// RegenerateToken renvoie le nouveau token, ou "" si non autorisé.
func (s *Store) RegenerateToken(ctx context.Context, id, ownerID string) (string, error) {
	bot, err := s.GetByID(ctx, id, false)
	if err != nil || bot == nil || bot.Str("ownerId") != ownerID {
		return "", err
	}
	token := randomHex32()
	if _, err := s.db.Exec(ctx, "UPDATE bots SET token = ?, updated_at = ? WHERE id = ?", token, platform.Now(), id); err != nil {
		return "", err
	}
	return token, nil
}

// UpdateStatus enregistre le statut et le diffuse sur Redis si disponible.
func (s *Store) UpdateStatus(ctx context.Context, id string, status any) error {
	if _, err := s.db.Exec(ctx, "UPDATE bots SET status = ?, updated_at = ? WHERE id = ?", platform.SQLParam(status), platform.Now(), id); err != nil {
		return err
	}
	if s.redis != nil {
		st := platform.JSString(status)
		if err := s.redis.Set(ctx, "bot:"+id+":status", st, 0).Err(); err == nil {
			msg, _ := json.Marshal(platform.O("botId", id, "status", status))
			s.redis.Publish(ctx, "bot:status", string(msg))
		}
	}
	return nil
}

// ── Commandes ─────────────────────────────────────────────────────────────

func (s *Store) Commands(ctx context.Context, botID string) ([]any, error) {
	rows, err := s.db.Rows(ctx, "SELECT * FROM bot_commands WHERE bot_id = ? ORDER BY name ASC", botID)
	if err != nil {
		return nil, err
	}
	out := []any{}
	for _, r := range rows {
		out = append(out, mapCommand(r))
	}
	return out, nil
}

func (s *Store) CreateCommand(ctx context.Context, botID string, body *platform.Object) (*platform.Object, error) {
	id := uuid.NewString()
	usage := platform.Or(body.Get("usage"), "")
	cooldown := platform.Or(body.Get("cooldown"), 0)
	permissions := platform.Or(body.Get("permissions"), 0)
	if _, err := s.db.Exec(ctx,
		"INSERT INTO bot_commands (id, bot_id, name, description, `usage`, cooldown, permissions, is_enabled)\n       VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
		id, botID, platform.SQLParam(body.Get("name")), platform.SQLParam(body.Get("description")),
		platform.SQLParam(usage), platform.SQLParam(cooldown), platform.SQLParam(permissions)); err != nil {
		return nil, err
	}
	return platform.O(
		"id", id,
		"botId", botID,
		"name", body.Get("name"),
		"description", body.Get("description"),
		"usage", usage,
		"isEnabled", true,
		"cooldown", cooldown,
		"permissions", permissions,
	), nil
}

var commandFields = [][2]string{
	{"name", "`name`"},
	{"description", "`description`"},
	{"usage", "`usage`"},
	{"isEnabled", "is_enabled"},
	{"cooldown", "`cooldown`"},
	{"permissions", "`permissions`"},
}

// UpdateCommand renvoie la commande relue, ou nil si rien à modifier / introuvable.
func (s *Store) UpdateCommand(ctx context.Context, id, botID string, updates *platform.Object) (*platform.Object, error) {
	var set []string
	var values []any
	for _, f := range commandFields {
		if v := platform.GetPath(updates, f[0]); v != platform.Undefined {
			set = append(set, f[1]+" = ?")
			values = append(values, platform.SQLParam(v))
		}
	}
	if len(set) == 0 {
		return nil, nil
	}
	values = append(values, id, botID)
	if _, err := s.db.Exec(ctx, "UPDATE bot_commands SET "+joinComma(set)+" WHERE id = ? AND bot_id = ?", values...); err != nil {
		return nil, err
	}
	row, err := s.db.First(ctx, "SELECT * FROM bot_commands WHERE id = ?", id)
	if err != nil || row == nil {
		return nil, err
	}
	return mapCommand(row), nil
}

func (s *Store) DeleteCommand(ctx context.Context, id, botID string) (bool, error) {
	res, err := s.db.Exec(ctx, "DELETE FROM bot_commands WHERE id = ? AND bot_id = ?", id, botID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ── Serveurs ──────────────────────────────────────────────────────────────

func (s *Store) BotServers(ctx context.Context, botID string) ([]any, error) {
	rows, err := s.db.Rows(ctx, "SELECT server_id FROM bot_servers WHERE bot_id = ?", botID)
	if err != nil {
		return nil, err
	}
	out := []any{}
	for _, r := range rows {
		out = append(out, r.Get("server_id"))
	}
	return out, nil
}

// AddToServer ajoute le bot ; false s'il n'existe pas ou y est déjà.
func (s *Store) AddToServer(ctx context.Context, botID string, serverID any, permissions int32) (bool, error) {
	bot, err := s.GetByID(ctx, botID, false)
	if err != nil || bot == nil {
		return false, err
	}
	existing, err := s.db.Rows(ctx, "SELECT * FROM bot_servers WHERE bot_id = ? AND server_id = ?", botID, platform.SQLParam(serverID))
	if err != nil || len(existing) > 0 {
		return false, err
	}
	if _, err := s.db.Exec(ctx, "INSERT INTO bot_servers (bot_id, server_id, permissions, added_at) VALUES (?, ?, ?, ?)",
		botID, platform.SQLParam(serverID), permissions, platform.Now()); err != nil {
		return false, err
	}
	if _, err := s.db.Exec(ctx, "UPDATE bots SET invite_count = invite_count + 1 WHERE id = ?", botID); err != nil {
		return false, err
	}
	if s.redis != nil {
		msg, _ := json.Marshal(platform.O("botId", botID, "serverId", serverID))
		s.redis.Publish(ctx, "bot:joined", string(msg))
	}
	return true, nil
}

func (s *Store) RemoveFromServer(ctx context.Context, botID, serverID string) (bool, error) {
	res, err := s.db.Exec(ctx, "DELETE FROM bot_servers WHERE bot_id = ? AND server_id = ?", botID, serverID)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		if s.redis != nil {
			msg, _ := json.Marshal(platform.O("botId", botID, "serverId", serverID))
			s.redis.Publish(ctx, "bot:left", string(msg))
		}
		return true, nil
	}
	return false, nil
}

func (s *Store) BotsInServer(ctx context.Context, serverID string) ([]any, error) {
	rows, err := s.db.Rows(ctx,
		"SELECT b.* FROM bots b INNER JOIN bot_servers bs ON b.id = bs.bot_id WHERE bs.server_id = ?", serverID)
	if err != nil {
		return nil, err
	}
	return s.hydrateAll(ctx, rows)
}

// ── Certification ─────────────────────────────────────────────────────────

// RequestCertification renvoie l'ID de la demande, ou "" si refusée.
func (s *Store) RequestCertification(ctx context.Context, botID, ownerID string, reason any) (string, error) {
	bot, err := s.GetByID(ctx, botID, false)
	if err != nil || bot == nil || bot.Str("ownerId") != ownerID {
		return "", err
	}
	if st := bot.Str("certificationStatus"); st == "pending" || st == "approved" {
		return "", nil
	}
	id := uuid.NewString()
	if _, err := s.db.Exec(ctx,
		`INSERT INTO bot_certifications (id, bot_id, owner_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
		id, botID, ownerID, platform.SQLParam(reason), platform.Now()); err != nil {
		return "", err
	}
	if _, err := s.db.Exec(ctx, "UPDATE bots SET certification_status = 'pending', updated_at = ? WHERE id = ?", platform.Now(), botID); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) PendingCertifications(ctx context.Context) ([]*platform.Object, error) {
	return s.db.Rows(ctx,
		`SELECT c.*, b.name as bot_name, b.description as bot_description, b.invite_count, b.avatar_url as bot_avatar
       FROM bot_certifications c
       INNER JOIN bots b ON c.bot_id = b.id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`)
}

// ReviewCertification : false si la demande n'existe pas.
func (s *Store) ReviewCertification(ctx context.Context, requestID, reviewerID string, status, note any) (bool, error) {
	req, err := s.db.First(ctx, "SELECT * FROM bot_certifications WHERE id = ?", requestID)
	if err != nil || req == nil {
		return false, err
	}
	noteParam := any(nil)
	if platform.Truthy(note) {
		noteParam = platform.SQLParam(note)
	}
	if _, err := s.db.Exec(ctx,
		"UPDATE bot_certifications SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ?",
		platform.SQLParam(status), reviewerID, noteParam, platform.Now(), requestID); err != nil {
		return false, err
	}
	approved := 0
	if s, ok := status.(string); ok && s == "approved" {
		approved = 1
	}
	if _, err := s.db.Exec(ctx,
		"UPDATE bots SET certification_status = ?, is_verified = ?, certification_note = ?, updated_at = ? WHERE id = ?",
		platform.SQLParam(status), approved, noteParam, platform.Now(), req.Get("bot_id")); err != nil {
		return false, err
	}
	return true, nil
}

// AuthenticateBot renvoie le bot complet (avec token) correspondant au token.
func (s *Store) AuthenticateBot(ctx context.Context, token string) (*platform.Object, error) {
	row, err := s.db.First(ctx, "SELECT * FROM bots WHERE token = ?", token)
	if err != nil || row == nil {
		return nil, err
	}
	return s.GetByID(ctx, row.Get("id"), true)
}
