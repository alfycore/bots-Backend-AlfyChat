# AlfyChat — Service Bots

Microservice de gestion des bots pour AlfyChat.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go)
![License](https://img.shields.io/badge/License-Source_Available-blue)

## Rôle

Ce service gère les comptes bots, leurs tokens d'accès, et les interactions bot ↔ serveur/salon via l'API REST. Il fait partie de l'architecture microservices AlfyChat.

## Stack technique

| Catégorie | Technologies |
|-----------|-------------|
| Langage | Go 1.26 |
| API | net/http (stdlib) |
| Auth | JWT HS256 (golang-jwt) |
| Cache | Redis |
| Base de données | MySQL 8 |

## Architecture globale

```
Frontend (:4000)  →  Gateway (:3000)  →  Microservices
                                          ├── users    (:3001)
                                          ├── messages  (:3002)
                                          ├── friends   (:3003)
                                          ├── calls     (:3004)
                                          ├── servers   (:3005)
                                          ├── bots      (:3006)  ← ce service
                                          └── media     (:3007)
```

## Démarrage

### Prérequis

- [Go](https://go.dev/) ≥ 1.26
- MySQL 8
- Redis 7

### Variables d'environnement

Copier `.env.example` en `.env` et renseigner les valeurs.

```env
PORT=3006
DB_HOST=localhost
DB_PORT=3306
DB_USER=alfychat
DB_PASSWORD=
DB_NAME=alfychat_bots
REDIS_URL=redis://localhost:6379
JWT_SECRET=
INTERNAL_SECRET=
GATEWAY_URL=http://localhost:3000
SERVICE_KEY=
SERVICE_ENDPOINT=http://localhost:3006
```

### Développement

```bash
go run .
```

### Build production

```bash
go build -o bin/bots .
./bin/bots
```

### Tests

```bash
go test ./...
```

### Docker

```bash
docker compose up bots
```

## Structure du projet

```
main.go                  # Point d'entrée
internal/
├── bots/                # Routes, accès aux données, OAuth2, droits serveur
└── platform/            # Socle commun aux services Go (HTTP, auth, MySQL,
                         # enregistrement auprès du gateway, validation)
public/                  # Pages HTML d'accueil et d'erreur
```

## Contribution

Voir [CONTRIBUTING.md](./CONTRIBUTING.md).
