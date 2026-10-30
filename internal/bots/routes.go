// ==========================================
// ALFYCHAT - ROUTES BOTS ET OAUTH2
// L'ordre de déclaration est celui des routeurs Express : la première route
// qui correspond gagne.
// ==========================================

package bots

import (
	"log/slog"
	"math"
	"net/http"
	"strings"

	"github.com/alfychat/bots/internal/platform"
	"github.com/redis/go-redis/v9"
)

type handlers struct {
	store *Store
}

// validated exécute les chaînes ; en cas d'erreur répond 400 comme validateRequest.
func validated(w http.ResponseWriter, r *http.Request, chains ...*platform.Chain) bool {
	if errs := platform.Validate(r, chains...); len(errs) > 0 {
		platform.JSON(w, 400, platform.O("error", "Données invalides", "details", errs))
		return false
	}
	return true
}

// v enchaîne validation puis handler, comme [validators..., validateRequest, handler].
func v(chains func() []*platform.Chain, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if validated(w, r, chains()...) {
			h(w, r)
		}
	}
}

func chains(c ...*platform.Chain) []*platform.Chain { return c }

func fail(w http.ResponseWriter, logMsg, msg string, err error) {
	slog.Error(logMsg, "err", err)
	platform.Error(w, http.StatusInternalServerError, msg)
}

func botID() *platform.Chain {
	return platform.ParamField("id").IsUUID().WithMessage("ID de bot invalide")
}

// Register déclare les routes /bots et /oauth2.
func Register(srv *platform.Server, db *platform.DB, rdb *redis.Client, auth *platform.Auth) {
	h := &handlers{store: &Store{db: db, redis: rdb}}
	a := auth.Require
	srv.Mount("/bots")
	srv.Mount("/oauth2")

	// ── Bots ──
	srv.Handle("POST /bots", a(v(func() []*platform.Chain {
		return chains(
			platform.BodyField("name").IsString().IsLength(2, 32).WithMessage("Nom requis (2-32 caractères)"),
			platform.BodyField("description").Optional().IsString().IsLength(0, 500),
			platform.BodyField("prefix").Optional().IsString().IsLength(1, 5),
		)
	}, h.create)))
	srv.Handle("GET /bots/me", a(h.myBots))
	srv.Handle("GET /bots/public", v(func() []*platform.Chain {
		return chains(
			platform.QueryField("search").Optional().IsString().IsLength(0, 100),
			platform.QueryField("tag").Optional().IsString().IsLength(0, 50),
		)
	}, h.publicBots))
	srv.Handle("POST /bots/authenticate", h.authenticate)
	srv.Handle("GET /bots/{id}", a(v(func() []*platform.Chain { return chains(botID()) }, h.getByID)))
	srv.Handle("PATCH /bots/{id}", a(v(func() []*platform.Chain {
		return chains(
			botID(),
			platform.BodyField("name").Optional().IsString().IsLength(2, 32),
			platform.BodyField("description").Optional().IsString().IsLength(0, 500),
			platform.BodyField("prefix").Optional().IsString().IsLength(1, 5),
			platform.BodyField("isPublic").Optional().IsBoolean(),
			platform.BodyField("tags").Optional().IsArray(-1, -1),
			platform.BodyField("websiteUrl").Optional().IsString().IsLength(0, 500),
			platform.BodyField("supportServerUrl").Optional().IsString().IsLength(0, 500),
			platform.BodyField("privacyPolicyUrl").Optional().IsString().IsLength(0, 500),
		)
	}, h.update)))
	srv.Handle("DELETE /bots/{id}", a(v(func() []*platform.Chain { return chains(botID()) }, h.delete)))
	srv.Handle("POST /bots/{id}/regenerate-token", a(v(func() []*platform.Chain { return chains(botID()) }, h.regenerateToken)))
	srv.Handle("PATCH /bots/{id}/status", a(v(func() []*platform.Chain {
		return chains(botID(), platform.BodyField("status").IsIn("online", "offline", "maintenance").WithMessage("Statut invalide"))
	}, h.updateStatus)))

	// ── Commandes ──
	srv.Handle("GET /bots/{id}/commands", v(func() []*platform.Chain { return chains(botID()) }, h.commands))
	srv.Handle("POST /bots/{id}/commands", a(v(func() []*platform.Chain {
		return chains(
			botID(),
			platform.BodyField("name").IsString().IsLength(1, 32).WithMessage("Nom requis"),
			platform.BodyField("description").IsString().IsLength(1, 200).WithMessage("Description requise"),
			platform.BodyField("usage").Optional().IsString().IsLength(0, 200),
			platform.BodyField("cooldown").Optional().IsInt(platform.Min(0)),
			platform.BodyField("permissions").Optional().IsInt(platform.Min(0)),
		)
	}, h.createCommand)))
	commandID := func() *platform.Chain {
		return platform.ParamField("commandId").IsUUID().WithMessage("ID de commande invalide")
	}
	srv.Handle("PATCH /bots/{id}/commands/{commandId}", a(v(func() []*platform.Chain {
		return chains(
			botID(), commandID(),
			platform.BodyField("name").Optional().IsString().IsLength(1, 32),
			platform.BodyField("description").Optional().IsString().IsLength(0, 200),
			platform.BodyField("usage").Optional().IsString().IsLength(0, 200),
			platform.BodyField("isEnabled").Optional().IsBoolean(),
			platform.BodyField("cooldown").Optional().IsInt(platform.Min(0)),
			platform.BodyField("permissions").Optional().IsInt(platform.Min(0)),
		)
	}, h.updateCommand)))
	srv.Handle("DELETE /bots/{id}/commands/{commandId}", a(v(func() []*platform.Chain {
		return chains(botID(), commandID())
	}, h.deleteCommand)))

	// ── Serveurs ──
	srv.Handle("POST /bots/{id}/servers", a(v(func() []*platform.Chain {
		return chains(
			botID(),
			platform.BodyField("serverId").IsUUID().WithMessage("ID de serveur invalide"),
			platform.BodyField("permissions").Optional().IsInt(platform.Min(0)),
		)
	}, h.addToServer)))
	serverIDParam := func() *platform.Chain {
		return platform.ParamField("serverId").IsUUID().WithMessage("ID de serveur invalide")
	}
	srv.Handle("DELETE /bots/{id}/servers/{serverId}", a(v(func() []*platform.Chain {
		return chains(botID(), serverIDParam())
	}, h.removeFromServer)))
	srv.Handle("GET /bots/servers/{serverId}", v(func() []*platform.Chain { return chains(serverIDParam()) }, h.botsInServer))

	// ── OAuth2 du bot ──
	srv.Handle("GET /bots/{id}/oauth2", a(v(func() []*platform.Chain { return chains(botID()) }, h.oauth2Config)))
	srv.Handle("POST /bots/{id}/oauth2/regenerate-secret", a(v(func() []*platform.Chain { return chains(botID()) }, h.regenerateSecret)))
	srv.Handle("PATCH /bots/{id}/oauth2/redirect-uris", a(v(func() []*platform.Chain {
		return chains(botID(), platform.BodyField("redirectUris").IsArray(-1, 5).WithMessage("Max 5 URIs"))
	}, h.updateRedirectUris)))

	// ── Certification ──
	srv.Handle("POST /bots/{id}/certification", a(v(func() []*platform.Chain {
		return chains(botID(), platform.BodyField("reason").IsString().IsLength(10, 1000).WithMessage("Raison requise (10-1000 caractères)"))
	}, h.requestCertification)))
	srv.Handle("GET /bots/certification/pending", a(h.pendingCertifications))
	srv.Handle("POST /bots/certification/{requestId}/review", a(v(func() []*platform.Chain {
		return chains(
			platform.ParamField("requestId").IsUUID().WithMessage("ID de demande invalide"),
			platform.BodyField("status").IsIn("approved", "rejected").WithMessage("Statut invalide"),
			platform.BodyField("note").Optional().IsString().IsLength(0, 500),
		)
	}, h.reviewCertification)))

	// ── OAuth2 public ──
	srv.Handle("GET /oauth2/applications/{clientId}", v(func() []*platform.Chain {
		return chains(platform.ParamField("clientId").IsUUID().WithMessage("client_id invalide"))
	}, h.application))
	srv.Handle("POST /oauth2/authorize", a(v(func() []*platform.Chain {
		return chains(
			platform.BodyField("clientId").IsUUID().WithMessage("clientId invalide"),
			// Facultatif : sans redirect_uri, c'est le lien d'ajout simple (scope `bot` seul).
			platform.BodyField("redirectUri").OptionalFalsy().IsURL(func(o *platform.URLOptions) { o.RequireTLD = false }).WithMessage("redirectUri invalide"),
			platform.BodyField("scopes").IsArray(1, -1).WithMessage("scopes requis"),
			platform.BodyField("permissions").Optional().IsInt(platform.Min(0)),
		)
	}, h.authorize)))
	srv.Handle("POST /oauth2/token", v(func() []*platform.Chain {
		return chains(
			platform.BodyField("grant_type").Equals("authorization_code").WithMessage("grant_type doit être authorization_code"),
			platform.BodyField("code").IsString().IsLength(1, -1).WithMessage("code requis"),
			platform.BodyField("client_id").IsUUID().WithMessage("client_id invalide"),
			platform.BodyField("client_secret").IsString().IsLength(1, -1).WithMessage("client_secret requis"),
			platform.BodyField("redirect_uri").IsURL(func(o *platform.URLOptions) { o.RequireTLD = false }).WithMessage("redirect_uri invalide"),
		)
	}, h.exchangeToken))

	srv.Handle("GET /health", func(w http.ResponseWriter, r *http.Request) {
		platform.JSON(w, 200, platform.O("status", "ok", "service", "bots"))
	})
	srv.Handle("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		body := platform.O(
			"service", "bots",
			"serviceId", platform.Env("SERVICE_ID", "bots-default"),
			"location", strings.ToUpper(platform.Env("SERVICE_LOCATION", "EU")),
		)
		m := platform.CollectServiceMetrics()
		for _, k := range m.Keys() {
			body.Set(k, m.Get(k))
		}
		body.Set("uptime", platform.Uptime())
		platform.JSON(w, 200, body)
	})
}

// ── Bots ──────────────────────────────────────────────────────────────────

func (h *handlers) create(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Non authentifié")
		return
	}
	bot, err := h.store.Create(r.Context(), userID, platform.Body(r))
	if err != nil {
		fail(w, "Create bot error:", "Erreur lors de la création du bot", err)
		return
	}
	platform.JSON(w, 201, platform.O("success", true, "bot", bot))
}

func (h *handlers) getByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, userID := r.PathValue("id"), platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	bot, err := h.store.GetByID(ctx, id, false)
	if err != nil {
		fail(w, "Get bot error:", "Erreur lors de la récupération du bot", err)
		return
	}
	if bot == nil {
		platform.Error(w, 404, "Bot non trouvé")
		return
	}
	if bot.Str("ownerId") == userID {
		full, err := h.store.GetByID(ctx, id, true)
		if err != nil {
			fail(w, "Get bot error:", "Erreur lors de la récupération du bot", err)
			return
		}
		platform.JSON(w, 200, platform.O("bot", full))
		return
	}
	platform.JSON(w, 200, platform.O("bot", bot))
}

func (h *handlers) myBots(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Non authentifié")
		return
	}
	bots, err := h.store.GetByOwner(r.Context(), userID)
	if err != nil {
		fail(w, "Get my bots error:", "Erreur lors de la récupération des bots", err)
		return
	}
	platform.JSON(w, 200, platform.O("bots", bots))
}

func (h *handlers) publicBots(w http.ResponseWriter, r *http.Request) {
	q := platform.Query(r)
	bots, err := h.store.GetPublicBots(r.Context(), q.Get("search"), q.Get("tag"))
	if err != nil {
		fail(w, "Get public bots error:", "Erreur lors de la récupération des bots publics", err)
		return
	}
	platform.JSON(w, 200, platform.O("bots", bots))
}

func (h *handlers) update(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	bot, err := h.store.Update(r.Context(), r.PathValue("id"), userID, platform.Body(r))
	if err != nil {
		fail(w, "Update bot error:", "Erreur lors de la mise à jour du bot", err)
		return
	}
	if bot == nil {
		platform.Error(w, 404, "Bot non trouvé ou non autorisé")
		return
	}
	platform.JSON(w, 200, platform.O("bot", bot))
}

func (h *handlers) delete(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	ok, err := h.store.Delete(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		fail(w, "Delete bot error:", "Erreur lors de la suppression du bot", err)
		return
	}
	if !ok {
		platform.Error(w, 404, "Bot non trouvé ou non autorisé")
		return
	}
	platform.JSON(w, 200, platform.O("success", true))
}

func (h *handlers) regenerateToken(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	token, err := h.store.RegenerateToken(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		fail(w, "Regenerate token error:", "Erreur lors de la régénération du token", err)
		return
	}
	if token == "" {
		platform.Error(w, 404, "Bot non trouvé ou non autorisé")
		return
	}
	platform.JSON(w, 200, platform.O("token", token))
}

// ownedOr404 vérifie que le bot appartient à l'appelant.
func (h *handlers) ownedOr404(w http.ResponseWriter, r *http.Request, logMsg, errMsg string) bool {
	bot, err := h.store.GetByID(r.Context(), r.PathValue("id"), false)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return false
	}
	if bot == nil || bot.Str("ownerId") != platform.UserID(r) {
		platform.Error(w, 404, "Bot non trouvé ou non autorisé")
		return false
	}
	return true
}

func (h *handlers) updateStatus(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Update status error:", "Erreur lors de la mise à jour du statut"
	if !h.ownedOr404(w, r, logMsg, errMsg) {
		return
	}
	status := platform.Body(r).Get("status")
	if err := h.store.UpdateStatus(r.Context(), r.PathValue("id"), status); err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	platform.JSON(w, 200, platform.O("success", true, "status", status))
}

// ── Commandes ─────────────────────────────────────────────────────────────

func (h *handlers) commands(w http.ResponseWriter, r *http.Request) {
	cmds, err := h.store.Commands(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, "Get commands error:", "Erreur lors de la récupération des commandes", err)
		return
	}
	platform.JSON(w, 200, platform.O("commands", cmds))
}

func (h *handlers) createCommand(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Create command error:", "Erreur lors de la création de la commande"
	if platform.UserID(r) == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	if !h.ownedOr404(w, r, logMsg, errMsg) {
		return
	}
	cmd, err := h.store.CreateCommand(r.Context(), r.PathValue("id"), platform.Body(r))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	platform.JSON(w, 201, platform.O("command", cmd))
}

func (h *handlers) updateCommand(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Update command error:", "Erreur lors de la mise à jour de la commande"
	if !h.ownedOr404(w, r, logMsg, errMsg) {
		return
	}
	cmd, err := h.store.UpdateCommand(r.Context(), r.PathValue("commandId"), r.PathValue("id"), platform.Body(r))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if cmd == nil {
		platform.Error(w, 404, "Commande non trouvée")
		return
	}
	platform.JSON(w, 200, platform.O("command", cmd))
}

func (h *handlers) deleteCommand(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Delete command error:", "Erreur lors de la suppression de la commande"
	if !h.ownedOr404(w, r, logMsg, errMsg) {
		return
	}
	ok, err := h.store.DeleteCommand(r.Context(), r.PathValue("commandId"), r.PathValue("id"))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !ok {
		platform.Error(w, 404, "Commande non trouvée")
		return
	}
	platform.JSON(w, 200, platform.O("success", true))
}

// ── Serveurs ──────────────────────────────────────────────────────────────

func (h *handlers) addToServer(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Add to server error:", "Erreur lors de l'ajout du bot au serveur"
	ctx := r.Context()
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	body := platform.Body(r)
	serverID := body.Get("serverId")
	bot, err := h.store.GetByID(ctx, r.PathValue("id"), false)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if bot == nil {
		platform.Error(w, 404, "Bot non trouvé")
		return
	}
	// Aucun contrôle auparavant : n'importe qui installait n'importe quel bot
	// (avec les permissions de son choix) sur n'importe quel serveur.
	ok, err := h.store.canManageServerBots(ctx, userID, serverID)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !ok {
		platform.Error(w, 403, "Droits d'administration du serveur requis")
		return
	}
	added, err := h.store.AddToServer(ctx, r.PathValue("id"), serverID, sanitizeBotPermissions(platform.GetPath(body, "permissions")))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !added {
		platform.Error(w, 400, "Le bot est déjà sur ce serveur")
		return
	}
	platform.JSON(w, 201, platform.O("success", true))
}

func (h *handlers) removeFromServer(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Remove from server error:", "Erreur lors du retrait du bot du serveur"
	ctx := r.Context()
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	id, serverID := r.PathValue("id"), r.PathValue("serverId")
	// Le propriétaire du bot ou un administrateur du serveur uniquement.
	bot, err := h.store.GetByID(ctx, id, false)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if bot == nil {
		platform.Error(w, 404, "Bot non trouvé")
		return
	}
	if bot.Str("ownerId") != userID {
		ok, err := h.store.canManageServerBots(ctx, userID, serverID)
		if err != nil {
			fail(w, logMsg, errMsg, err)
			return
		}
		if !ok {
			platform.Error(w, 403, "Non autorisé")
			return
		}
	}
	removed, err := h.store.RemoveFromServer(ctx, id, serverID)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !removed {
		platform.Error(w, 404, "Bot non trouvé sur ce serveur")
		return
	}
	platform.JSON(w, 200, platform.O("success", true))
}

func (h *handlers) botsInServer(w http.ResponseWriter, r *http.Request) {
	bots, err := h.store.BotsInServer(r.Context(), r.PathValue("serverId"))
	if err != nil {
		fail(w, "Get bots in server error:", "Erreur lors de la récupération des bots", err)
		return
	}
	platform.JSON(w, 200, platform.O("bots", bots))
}

// ── Certification ─────────────────────────────────────────────────────────

func (h *handlers) requestCertification(w http.ResponseWriter, r *http.Request) {
	userID := platform.UserID(r)
	if userID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	id, err := h.store.RequestCertification(r.Context(), r.PathValue("id"), userID, platform.Body(r).Get("reason"))
	if err != nil {
		fail(w, "Request certification error:", "Erreur lors de la demande de certification", err)
		return
	}
	if id == "" {
		platform.Error(w, 400, "Demande impossible (bot non trouvé, non autorisé, ou déjà en attente)")
		return
	}
	platform.JSON(w, 201, platform.O("success", true, "requestId", id))
}

func (h *handlers) pendingCertifications(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Get pending certifications error:", "Erreur lors de la récupération des certifications"
	admin, err := h.store.isPlatformAdmin(r.Context(), platform.UserID(r))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !admin {
		platform.Error(w, 403, "Accès réservé aux administrateurs")
		return
	}
	rows, err := h.store.PendingCertifications(r.Context())
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	platform.JSON(w, 200, platform.O("certifications", rows))
}

func (h *handlers) reviewCertification(w http.ResponseWriter, r *http.Request) {
	const logMsg, errMsg = "Review certification error:", "Erreur lors de l'examen de la certification"
	reviewerID := platform.UserID(r)
	if reviewerID == "" {
		platform.Error(w, 401, "Authentification requise")
		return
	}
	// N'importe quel compte pouvait certifier un bot — y compris le sien.
	admin, err := h.store.isPlatformAdmin(r.Context(), reviewerID)
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !admin {
		platform.Error(w, 403, "Accès réservé aux administrateurs")
		return
	}
	body := platform.Body(r)
	ok, err := h.store.ReviewCertification(r.Context(), r.PathValue("requestId"), reviewerID, body.Get("status"), body.Get("note"))
	if err != nil {
		fail(w, logMsg, errMsg, err)
		return
	}
	if !ok {
		platform.Error(w, 404, "Demande de certification non trouvée")
		return
	}
	platform.JSON(w, 200, platform.O("success", true))
}

// authenticate : authentification d'un bot par "Authorization: Bot <token>" (pour le gateway).
func (h *handlers) authenticate(w http.ResponseWriter, r *http.Request) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bot ") {
		platform.Error(w, 401, "Token de bot invalide")
		return
	}
	bot, err := h.store.AuthenticateBot(r.Context(), header[4:])
	if err != nil {
		fail(w, "Bot authenticate error:", "Erreur d'authentification", err)
		return
	}
	if bot == nil {
		platform.Error(w, 401, "Bot non trouvé")
		return
	}
	platform.JSON(w, 200, platform.O("bot", bot))
}

// ── OAuth2 ────────────────────────────────────────────────────────────────

func (h *handlers) application(w http.ResponseWriter, r *http.Request) {
	app, err := h.store.PublicApp(r.Context(), r.PathValue("clientId"))
	if err != nil {
		fail(w, "oauth2 application", "Erreur serveur", err)
		return
	}
	if app == nil {
		platform.Error(w, 404, "Application introuvable")
		return
	}
	platform.JSON(w, 200, platform.O("app", app))
}

func (h *handlers) authorize(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := platform.UserID(r)
	body := platform.Body(r)
	clientID := body.Get("clientId")
	serverID := platform.GetPath(body, "serverId")
	redirectURI := platform.GetPath(body, "redirectUri")
	state := body.Get("state")
	scopes, isArr := body.Get("scopes").([]any)
	if !platform.Truthy(clientID) || !isArr {
		platform.Error(w, 400, "Paramètres manquants")
		return
	}
	permissions := platform.ParseIntOr(platform.GetPath(body, "permissions"), 0)
	if math.IsNaN(permissions) {
		permissions = 0
	}
	if !platform.Truthy(serverID) {
		serverID = nil
	}

	// Lien d'ajout simple (alfy.chat/b/ID) : scope `bot` seul, sans redirection.
	if !platform.Truthy(redirectURI) {
		if len(scopes) != 1 || !platform.StrictEqual(scopes[0], "bot") {
			platform.Error(w, 400, "redirect_uri requis pour ces scopes")
			return
		}
		installed, err := h.store.InstallBot(ctx, clientID, userID, serverID, permissions)
		if err != nil {
			fail(w, "oauth2 install", "Erreur serveur", err)
			return
		}
		if !installed {
			platform.Error(w, 400, "Autorisation refusée")
			return
		}
		res := platform.O("installed", true)
		if v := platform.GetPath(body, "serverId"); v != platform.Undefined {
			res.Set("serverId", v)
		}
		platform.JSON(w, 200, res)
		return
	}

	for _, sc := range scopes {
		if !platform.StrictEqual(sc, "bot") && !platform.StrictEqual(sc, "identify") && !platform.StrictEqual(sc, "guilds") {
			platform.Error(w, 400, "Scope invalide: "+platform.JSString(sc))
			return
		}
	}

	code, err := h.store.GenerateCode(ctx, clientID, userID, serverID, redirectURI, scopes, permissions)
	if err != nil {
		fail(w, "oauth2 authorize", "Erreur serveur", err)
		return
	}
	if code == "" {
		platform.Error(w, 400, "Autorisation refusée ou redirect_uri invalide")
		return
	}
	params := [][2]string{{"code", code}}
	if platform.Truthy(state) {
		params = append(params, [2]string{"state", platform.JSString(state)})
	}
	if platform.Truthy(serverID) {
		params = append(params, [2]string{"guild_id", platform.JSString(serverID)})
	}
	redirectStr, _ := redirectURI.(string)
	platform.JSON(w, 200, platform.O("code", code, "redirectUri", withSearchParams(redirectStr, params)))
}

func (h *handlers) exchangeToken(w http.ResponseWriter, r *http.Request) {
	body := platform.Body(r)
	if !platform.StrictEqual(body.Get("grant_type"), "authorization_code") {
		platform.Error(w, 400, "unsupported_grant_type")
		return
	}
	code, clientID, secret, redirect := body.Get("code"), body.Get("client_id"), body.Get("client_secret"), body.Get("redirect_uri")
	if !platform.Truthy(code) || !platform.Truthy(clientID) || !platform.Truthy(secret) || !platform.Truthy(redirect) {
		platform.Error(w, 400, "invalid_request")
		return
	}
	res, err := h.store.ExchangeCode(r.Context(), code, clientID, secret, redirect)
	if err != nil {
		slog.Error("oauth2 token", "err", err)
		platform.Error(w, 500, "server_error")
		return
	}
	if res == nil {
		platform.Error(w, 400, "invalid_grant")
		return
	}
	platform.JSON(w, 200, res)
}

func (h *handlers) oauth2Config(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.OAuth2Config(r.Context(), r.PathValue("id"), platform.UserID(r))
	if err != nil {
		fail(w, "oauth2 config", "Erreur serveur", err)
		return
	}
	if cfg == nil {
		platform.Error(w, 404, "Bot introuvable ou accès refusé")
		return
	}
	platform.JSON(w, 200, cfg)
}

func (h *handlers) regenerateSecret(w http.ResponseWriter, r *http.Request) {
	secret, err := h.store.RegenerateClientSecret(r.Context(), r.PathValue("id"), platform.UserID(r))
	if err != nil {
		fail(w, "oauth2 secret", "Erreur serveur", err)
		return
	}
	if secret == "" {
		platform.Error(w, 404, "Bot introuvable ou accès refusé")
		return
	}
	platform.JSON(w, 200, platform.O("clientSecret", secret))
}

func (h *handlers) updateRedirectUris(w http.ResponseWriter, r *http.Request) {
	uris, isArr := platform.Body(r).Get("redirectUris").([]any)
	if !isArr {
		platform.Error(w, 400, "redirectUris doit être un tableau")
		return
	}
	res, ok, err := h.store.UpdateRedirectUris(r.Context(), r.PathValue("id"), platform.UserID(r), uris)
	if err != nil {
		slog.Error("oauth2 redirect uris", "err", err)
		msg := err.Error()
		if msg == "" {
			msg = "Erreur serveur"
		}
		platform.Error(w, 500, msg)
		return
	}
	if !ok {
		platform.Error(w, 400, "Bot introuvable, accès refusé, ou URIs invalides (max 5, https:// ou http://localhost)")
		return
	}
	platform.JSON(w, 200, platform.O("redirectUris", res))
}
