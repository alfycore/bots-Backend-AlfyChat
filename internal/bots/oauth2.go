// ==========================================
// ALFYCHAT - SERVICE OAUTH2
// Authorization code flow pour les bots.
// ==========================================

package bots

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/alfychat/bots/internal/platform"
)

// parseWHATWG approche new URL(s) : espaces et contrôles C0 retirés aux
// extrémités, tabulations/retours supprimés, "\" traité comme "/" et "//"
// implicite pour les schémas spéciaux ("https:exemple.com").
func parseWHATWG(raw string) (*url.URL, bool) {
	s := strings.TrimFunc(raw, func(r rune) bool { return r <= 0x20 })
	s = strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(s)
	scheme, rest, ok := strings.Cut(s, ":")
	if !ok || scheme == "" {
		return nil, false
	}
	scheme = strings.ToLower(scheme)
	special := scheme == "http" || scheme == "https" || scheme == "ftp" || scheme == "ws" || scheme == "wss"
	if special {
		rest = strings.ReplaceAll(rest, `\`, "/")
		rest = "//" + strings.TrimLeft(rest, "/")
	}
	u, err := url.Parse(scheme + ":" + rest)
	if err != nil {
		return nil, false
	}
	if special && u.Host == "" {
		return nil, false
	}
	return u, true
}

// isAcceptableRedirectUri : https, ou http limité à localhost / 127.0.0.1.
func isAcceptableRedirectUri(uri string) bool {
	u, ok := parseWHATWG(uri)
	if !ok {
		return false
	}
	if u.User != nil {
		if pw, _ := u.User.Password(); u.User.Username() != "" || pw != "" {
			return false
		}
	}
	if u.Fragment != "" {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	host := strings.ToLower(u.Hostname())
	return u.Scheme == "http" && (host == "localhost" || host == "127.0.0.1")
}

// formEncode : sérialisation application/x-www-form-urlencoded de URLSearchParams.
func formEncode(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		switch {
		case c == ' ':
			b.WriteByte('+')
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '*', c == '-', c == '.', c == '_':
			b.WriteByte(c)
		default:
			b.WriteString("%" + strings.ToUpper(hexByte(c)))
		}
	}
	return b.String()
}

func hexByte(c byte) string {
	const digits = "0123456789abcdef"
	return string([]byte{digits[c>>4], digits[c&0xf]})
}

// withSearchParams reproduit callbackUrl.searchParams.set(k, v) puis toString().
func withSearchParams(raw string, kv [][2]string) string {
	u, ok := parseWHATWG(raw)
	if !ok {
		return raw
	}
	type pair struct{ k, v string }
	var pairs []pair
	for _, part := range strings.Split(u.RawQuery, "&") {
		if part == "" {
			continue
		}
		k, v, _ := strings.Cut(part, "=")
		k, _ = url.QueryUnescape(k)
		v, _ = url.QueryUnescape(v)
		pairs = append(pairs, pair{k, v})
	}
	for _, p := range kv {
		found := false
		out := pairs[:0]
		for _, q := range pairs {
			if q.k == p[0] {
				if !found {
					out = append(out, pair{p[0], p[1]})
					found = true
				}
				continue
			}
			out = append(out, q)
		}
		pairs = out
		if !found {
			pairs = append(pairs, pair{p[0], p[1]})
		}
	}
	enc := make([]string, len(pairs))
	for i, p := range pairs {
		enc[i] = formEncode(p.k) + "=" + formEncode(p.v)
	}

	host := strings.ToLower(u.Hostname())
	if port := u.Port(); port != "" && !(u.Scheme == "http" && port == "80") && !(u.Scheme == "https" && port == "443") {
		host += ":" + port
	}
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	out := u.Scheme + "://" + host + path
	if len(enc) > 0 {
		out += "?" + strings.Join(enc, "&")
	}
	return out
}

// PublicApp : infos publiques pour la page authorize.
func (s *Store) PublicApp(ctx context.Context, clientID any) (*platform.Object, error) {
	row, err := s.db.First(ctx,
		"SELECT id, name, description, avatar_url, is_verified, redirect_uris FROM bots WHERE id = ?", platform.SQLParam(clientID))
	if err != nil || row == nil {
		return nil, err
	}
	return platform.O(
		"id", row.Get("id"),
		"name", row.Get("name"),
		"description", row.Get("description"),
		"avatarUrl", row.Get("avatar_url"),
		"isVerified", row.Bool("is_verified"),
		"redirectUris", jsonList(row.Get("redirect_uris")),
	), nil
}

// OAuth2Config : configuration masquée, pour le propriétaire seulement.
func (s *Store) OAuth2Config(ctx context.Context, botID, ownerID string) (*platform.Object, error) {
	row, err := s.db.First(ctx, "SELECT id, owner_id, client_secret, redirect_uris FROM bots WHERE id = ?", botID)
	if err != nil {
		// Repli si redirect_uris ou client_secret n'existe pas encore (migration en attente).
		if row, err = s.db.First(ctx, "SELECT id, owner_id FROM bots WHERE id = ?", botID); err != nil {
			return nil, err
		}
	}
	if row == nil || row.Str("owner_id") != ownerID {
		return nil, nil
	}
	secret := row.Str("client_secret")
	masked := "••••"
	if platform.JSLength(secret) >= 4 {
		r := []rune(secret)
		masked = "••••••••••••••••••••••••••••" + string(r[len(r)-4:])
	}
	return platform.O("clientId", botID, "clientSecretMasked", masked, "redirectUris", jsonList(row.Get("redirect_uris"))), nil
}

func (s *Store) ownedBot(ctx context.Context, botID, ownerID string) (bool, error) {
	row, err := s.db.First(ctx, "SELECT id, owner_id FROM bots WHERE id = ?", botID)
	if err != nil || row == nil {
		return false, err
	}
	return row.Str("owner_id") == ownerID, nil
}

func (s *Store) RegenerateClientSecret(ctx context.Context, botID, ownerID string) (string, error) {
	ok, err := s.ownedBot(ctx, botID, ownerID)
	if err != nil || !ok {
		return "", err
	}
	secret := randomHex32()
	if _, err := s.db.Exec(ctx, "UPDATE bots SET client_secret = ?, updated_at = ? WHERE id = ?", secret, platform.Now(), botID); err != nil {
		return "", err
	}
	return secret, nil
}

// errRedirectColumn : la colonne redirect_uris manque (migration non appliquée).
type errRedirectColumn struct{ err error }

func (e errRedirectColumn) Error() string {
	return "Colonne redirect_uris manquante — redémarrez le service bots. (" + e.err.Error() + ")"
}

// UpdateRedirectUris renvoie les URIs gardées, ou nil (ok=false) si refusées.
func (s *Store) UpdateRedirectUris(ctx context.Context, botID, ownerID string, uris []any) ([]any, bool, error) {
	ok, err := s.ownedBot(ctx, botID, ownerID)
	if err != nil || !ok {
		return nil, false, err
	}
	if len(uris) > 5 {
		return nil, false, nil
	}
	for _, u := range uris {
		str, isStr := u.(string)
		if !isStr || platform.JSLength(str) > 500 || !isAcceptableRedirectUri(str) {
			return nil, false, nil
		}
	}
	valid := []any{}
	for _, u := range uris {
		if strings.TrimFunc(u.(string), func(r rune) bool { return r <= ' ' || r == 0xa0 || r == 0xfeff }) != "" {
			valid = append(valid, u)
		}
	}
	b, _ := json.Marshal(valid)
	if _, err := s.db.Exec(ctx, "UPDATE bots SET redirect_uris = ?, updated_at = ? WHERE id = ?", string(b), platform.Now(), botID); err != nil {
		return nil, false, errRedirectColumn{err}
	}
	return valid, true, nil
}

// InstallBot : ajout simple (scope `bot` seul, sans redirect_uri), aucun code émis.
func (s *Store) InstallBot(ctx context.Context, clientID any, userID string, serverID any, permissions float64) (bool, error) {
	app, err := s.PublicApp(ctx, clientID)
	if err != nil || app == nil || !platform.Truthy(serverID) {
		return false, err
	}
	ok, err := s.canManageServerBots(ctx, userID, serverID)
	if err != nil || !ok {
		return false, err
	}
	if _, err := s.AddToServer(ctx, app.Str("id"), serverID, sanitizeBotPermissions(permissions)); err != nil {
		return false, err
	}
	return true, nil
}

// GenerateCode émet un code d'autorisation (10 min) ; "" si refusé.
func (s *Store) GenerateCode(ctx context.Context, clientID any, userID string, serverID any, redirectURI any, scopes []any, permissions float64) (string, error) {
	app, err := s.PublicApp(ctx, clientID)
	if err != nil || app == nil {
		return "", err
	}
	allowed := false
	if list, ok := app.Get("redirectUris").([]any); ok {
		for _, u := range list {
			if platform.StrictEqual(u, redirectURI) {
				allowed = true
				break
			}
		}
	}
	if !allowed {
		return "", nil
	}

	perms := sanitizeBotPermissions(permissions)
	hasBot := false
	for _, sc := range scopes {
		if platform.StrictEqual(sc, "bot") {
			hasBot = true
		}
	}
	if hasBot {
		if !platform.Truthy(serverID) {
			return "", nil
		}
		ok, err := s.canManageServerBots(ctx, userID, serverID)
		if err != nil || !ok {
			return "", err
		}
	}

	code := randomHex32()
	scopesJSON, _ := json.Marshal(scopes)
	serverParam := any(nil)
	if platform.Truthy(serverID) {
		serverParam = platform.SQLParam(serverID)
	}
	if _, err := s.db.Exec(ctx,
		`INSERT INTO oauth2_codes (code, bot_id, user_id, server_id, scopes, redirect_uri, permissions, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
		code, platform.SQLParam(clientID), userID, serverParam, string(scopesJSON), platform.SQLParam(redirectURI), perms,
		platform.Now().Add(10*time.Minute), platform.Now()); err != nil {
		return "", err
	}
	if hasBot && platform.Truthy(serverID) {
		if _, err := s.AddToServer(ctx, platform.JSString(clientID), serverID, perms); err != nil {
			return "", err
		}
	}
	return code, nil
}

var errSecretLength = errors.New("Input buffers must have the same byte length")

// ExchangeCode échange un code contre un access_token (30 jours).
func (s *Store) ExchangeCode(ctx context.Context, code, clientID, clientSecret, redirectURI any) (*platform.Object, error) {
	codeRow, err := s.db.First(ctx, "SELECT * FROM oauth2_codes WHERE code = ? AND used = 0 AND expires_at > NOW()", platform.SQLParam(code))
	if err != nil || codeRow == nil {
		return nil, err
	}
	if !platform.StrictEqual(codeRow.Get("bot_id"), clientID) || !platform.StrictEqual(codeRow.Get("redirect_uri"), redirectURI) {
		return nil, nil
	}
	bot, err := s.db.First(ctx, "SELECT client_secret FROM bots WHERE id = ?", platform.SQLParam(clientID))
	if err != nil || bot == nil {
		return nil, err
	}
	stored := bot.Str("client_secret")
	given, _ := clientSecret.(string)
	if platform.JSLength(stored) != platform.JSLength(given) {
		return nil, nil
	}
	if len(stored) != len(given) {
		return nil, errSecretLength
	}
	if subtle.ConstantTimeCompare([]byte(stored), []byte(given)) != 1 {
		return nil, nil
	}

	if _, err := s.db.Exec(ctx, "UPDATE oauth2_codes SET used = 1 WHERE code = ?", platform.SQLParam(code)); err != nil {
		return nil, err
	}
	accessToken := randomHex32()
	scopes, _ := jsonList(codeRow.Get("scopes")).([]any)
	if scopes == nil {
		scopes = []any{}
	}
	scopesJSON, _ := json.Marshal(scopes)
	serverParam := any(nil)
	if platform.Truthy(codeRow.Get("server_id")) {
		serverParam = codeRow.Get("server_id")
	}
	if _, err := s.db.Exec(ctx,
		`INSERT INTO oauth2_tokens (access_token, bot_id, user_id, server_id, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		accessToken, platform.SQLParam(clientID), codeRow.Get("user_id"), serverParam, string(scopesJSON),
		platform.Now().Add(30*24*time.Hour), platform.Now()); err != nil {
		return nil, err
	}
	parts := make([]string, len(scopes))
	for i, sc := range scopes {
		if sc != nil {
			parts[i] = platform.JSString(sc)
		}
	}
	return platform.O(
		"access_token", accessToken,
		"token_type", "Bot",
		"expires_in", 30*24*60*60,
		"scope", strings.Join(parts, " "),
	), nil
}
