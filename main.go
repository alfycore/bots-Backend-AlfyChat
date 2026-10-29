// ==========================================
// ALFYCHAT - SERVICE BOTS
// Gestion des bots et de leurs permissions
// ==========================================

package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/alfychat/bots/internal/bots"
	"github.com/alfychat/bots/internal/platform"
	"github.com/redis/go-redis/v9"
)

func main() {
	platform.LoadEnv()
	platform.InitLogger()

	srv := platform.NewServer()
	auth := platform.NewAuth()
	auth.Loose = true

	db, err := platform.OpenDatabaseWithDefaults("root", "")
	if err != nil {
		platform.Fatal("Erreur de démarrage", err)
	}
	if err := bots.Migrate(context.Background(), db); err != nil {
		platform.Fatal("Erreur de démarrage", err)
	}

	// Redis est optionnel : sans lui, statuts et événements ne sont pas diffusés.
	var rdb *redis.Client
	if rdb, err = platform.OpenRedis(); err != nil {
		rdb = nil
		slog.Warn(fmt.Sprintf("Redis indisponible (%v) — le service continue sans Redis", err))
	} else {
		slog.Info(fmt.Sprintf("Connexion Redis établie (host=%s port=%s)",
			platform.Env("REDIS_HOST", "localhost"), platform.Env("REDIS_PORT", "6379")))
	}

	bots.Register(srv, db, rdb, auth)

	port := platform.Env("PORT", "3006")
	err = srv.Listen(port, func() {
		slog.Info("Service Bots démarré sur le port " + port)
		platform.StartServiceRegistration("bots")
	})
	if err != nil {
		platform.Fatal("Erreur de démarrage", err)
	}
}
