// ==========================================
// ALFYCHAT - REDIS CLIENT
// Copié uniquement dans les services qui utilisent Redis.
// ==========================================

package platform

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// OpenRedis se connecte via REDIS_URL, sinon REDIS_HOST/PORT/PASSWORD, et
// vérifie la connexion par un PING (5 s max).
func OpenRedis() (*redis.Client, error) {
	var opts *redis.Options
	if u := Env("REDIS_URL", ""); u != "" {
		var err error
		if opts, err = redis.ParseURL(u); err != nil {
			return nil, err
		}
	} else {
		opts = &redis.Options{
			Addr:     fmt.Sprintf("%s:%d", Env("REDIS_HOST", "localhost"), EnvInt("REDIS_PORT", 6379)),
			Password: Env("REDIS_PASSWORD", ""),
		}
	}
	opts.DialTimeout = 5 * time.Second
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, err
	}
	return client, nil
}
