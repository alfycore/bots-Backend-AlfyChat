// ==========================================
// ALFYCHAT - SCHÉMA DU SERVICE BOTS
// ==========================================

package bots

import (
	"context"
	"log/slog"
	"strconv"
	"strings"

	"github.com/alfychat/bots/internal/platform"
)

var tables = []string{
	`CREATE TABLE IF NOT EXISTS bots (
        id VARCHAR(36) PRIMARY KEY,
        owner_id VARCHAR(36) NOT NULL,
        name VARCHAR(32) NOT NULL,
        description VARCHAR(500),
        token VARCHAR(64) NOT NULL,
        prefix VARCHAR(5) DEFAULT '!',
        status ENUM('online','offline','maintenance') DEFAULT 'offline',
        is_public TINYINT(1) DEFAULT 0,
        is_verified TINYINT(1) DEFAULT 0,
        certification_status ENUM('none','pending','approved','rejected') DEFAULT 'none',
        certification_note VARCHAR(500),
        invite_count INT DEFAULT 0,
        tags JSON,
        avatar_url VARCHAR(500),
        website_url VARCHAR(500),
        support_server_url VARCHAR(500),
        privacy_policy_url VARCHAR(500),
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )`,
	"CREATE TABLE IF NOT EXISTS bot_commands (\n" +
		"        id VARCHAR(36) PRIMARY KEY,\n" +
		"        bot_id VARCHAR(36) NOT NULL,\n" +
		"        name VARCHAR(32) NOT NULL,\n" +
		"        description VARCHAR(200) NOT NULL,\n" +
		"        `usage` VARCHAR(200),\n" +
		"        cooldown INT DEFAULT 0,\n" +
		"        permissions INT DEFAULT 0,\n" +
		"        is_enabled TINYINT(1) DEFAULT 1,\n" +
		"        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE\n" +
		"      )",
	`CREATE TABLE IF NOT EXISTS bot_servers (
        bot_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36) NOT NULL,
        permissions INT DEFAULT 0,
        added_at DATETIME NOT NULL,
        PRIMARY KEY (bot_id, server_id),
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )`,
	`CREATE TABLE IF NOT EXISTS bot_certifications (
        id VARCHAR(36) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        owner_id VARCHAR(36) NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        reviewer_id VARCHAR(36),
        review_note VARCHAR(500),
        created_at DATETIME NOT NULL,
        reviewed_at DATETIME,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )`,
}

var oauthTables = []string{
	`CREATE TABLE IF NOT EXISTS oauth2_codes (
        code VARCHAR(64) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36),
        scopes JSON NOT NULL,
        redirect_uri VARCHAR(500) NOT NULL,
        permissions INT DEFAULT 0,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )`,
	`CREATE TABLE IF NOT EXISTS oauth2_tokens (
        access_token VARCHAR(64) PRIMARY KEY,
        bot_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        server_id VARCHAR(36),
        scopes JSON NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
      )`,
}

// Migrate crée les tables, ajoute les colonnes OAuth2 (idempotent) et
// génère un client_secret pour les bots qui n'en ont pas.
func Migrate(ctx context.Context, db *platform.DB) error {
	if _, err := db.Exec(ctx, "SELECT 1"); err != nil {
		return err
	}
	slog.Info("Connexion MySQL établie")
	for _, q := range tables {
		if _, err := db.Exec(ctx, q); err != nil {
			return err
		}
	}
	slog.Info("Tables vérifiées/créées")

	// Pas de clause AFTER : la colonne de référence peut ne pas encore exister.
	for _, col := range [][2]string{
		{"client_secret", "ALTER TABLE bots ADD COLUMN client_secret VARCHAR(64)"},
		{"redirect_uris", "ALTER TABLE bots ADD COLUMN redirect_uris JSON"},
	} {
		if _, err := db.Exec(ctx, col[1]); err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				slog.Warn("Migration " + col[0] + ": " + err.Error())
			}
		} else {
			slog.Info("Migration: colonne " + col[0] + " ajoutée")
		}
	}
	for _, q := range oauthTables {
		if _, err := db.Exec(ctx, q); err != nil {
			return err
		}
	}

	rows, err := db.Rows(ctx, "SELECT id FROM bots WHERE client_secret IS NULL")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if _, err := db.Exec(ctx, "UPDATE bots SET client_secret = ? WHERE id = ?", randomHex32(), r.Get("id")); err != nil {
			return err
		}
	}
	if len(rows) > 0 {
		slog.Info("Backfill client_secret: " + strconv.Itoa(len(rows)) + " bot(s) mis à jour")
	}
	slog.Info("Migrations OAuth2 appliquées")
	return nil
}
