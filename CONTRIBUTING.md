# Contribuer à AlfyChat — Service Bots

Merci de l'intérêt que vous portez à ce projet ! Voici les règles à suivre.

## Prérequis

- [Bun](https://bun.sh/) ≥ 1.2
- MySQL 8 + Redis 7 en local (ou via Docker)
- Connaissances en TypeScript / Node.js

## Mise en place de l'environnement

```bash
git clone https://github.com/alfycore/bots-Backend-AlfyChat.git
cd bots-Backend-AlfyChat
bun install
cp .env.example .env
# Remplir les variables dans .env
bun run dev
```

## Workflow

1. **Forker** le dépôt
2. Créer une branche descriptive : `feat/nom-feature` ou `fix/nom-bug`
3. Faire des commits atomiques avec des messages clairs (voir ci-dessous)
4. Ouvrir une **Pull Request** vers `main` avec une description détaillée

## Convention de commits

Utiliser le format [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat: ajouter la gestion des webhooks bots
fix: corriger la validation du token bot
refactor: simplifier le service d'authentification
docs: mettre à jour les exemples d'API
```

## Règles de code

- TypeScript strict — pas de `any` sans justification
- Pas de secrets dans le code (utiliser `.env`)
- Nommer les variables et fonctions en anglais
- Tester manuellement les routes ajoutées

## Signaler un bug

Ouvrir une issue avec :
- La version du service
- Les étapes pour reproduire
- Le comportement attendu vs observé
- Les logs pertinents (sans données sensibles)

## Licence

En contribuant, vous acceptez que vos modifications soient soumises à la [licence AlfyChat](./LICENSE).
