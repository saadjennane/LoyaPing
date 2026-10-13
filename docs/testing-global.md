# Testing Global — LoyaPing

> Plan de test exhaustif par module. Couvre les fonctionnalités métier, les envois WhatsApp, les crons et les intégrations.

---

## Prérequis communs

- Un client de test avec un vrai numéro WhatsApp, un prénom, nom et civilité renseignés
- `WHATSAPP_PROVIDER` configuré (Twilio / Vonage / Cloud API)
- Les crons tournent (Vercel ou déclenchement manuel via l'URL)
- Quota WhatsApp suffisant (Twilio free : 50 msg/jour)
- Accès Supabase (dashboard ou CLI) pour vérifier les données
- `CRON_SECRET` connu pour le déclenchement manuel des jobs

---

## 1. Clients

### 1a — Création & recherche

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Créer un client (prénom, nom, téléphone, email, civilité) | Client visible dans la liste |
| 2 | Rechercher par nom | Client trouvé |
| 3 | Rechercher par numéro de téléphone (partiel) | Client trouvé via `phone_digits` index |
| 4 | Modifier les infos du client | Données mises à jour en base |

### 1b — Champs personnalisés

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Paramètres → configurer des champs personnalisés | Champs créés |
| 2 | Fiche client → renseigner les champs custom | Valeurs sauvegardées et affichées |

### 1c — Portail client (Magic Link)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Ouvrir l'URL `/u/<token>` du client | Page portail chargée |
| 2 | Vérifier : commandes en cours, RDV à venir, fidélité, coupons | Données correctes |
| 3 | Régénérer le token du client | Ancien lien invalide, nouveau fonctionne |

---

## 2. Commandes

### Configuration préalable
Paramètres → Commandes :
- **Rappel 1** : activé, délai **2 min**
- **Rappel 2** : activé, délai **5 min**
- **Rappel 3** : activé, délai **10 min**
- Messages avec variables : `Bonjour {{civilite}} {{nom}}, votre commande #{reference} est prête !`

### 2a — Cycle de vie d'une commande

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Créer une commande pour le client de test | Commande en statut `pending`, numéro séquentiel attribué |
| 2 | Vérifier la référence | Format `PREFIXE-001` correct |
| 3 | Marquer comme **Prête** | Statut `ready`, `ready_at` renseigné |
| 4 | Marquer comme **Récupérée** | Statut `completed`, `picked_up_at` renseigné |
| 5 | Points fidélité crédités (si programme actif) | Points ajoutés dans `points_log` |

### 2b — Message "Prête" + rappels WhatsApp

| Étape | Action | Message attendu | Délai |
|-------|--------|-----------------|-------|
| 1 | Créer une commande pour le client de test | — | — |
| 2 | Marquer la commande comme **Prête** | `ready_message` envoyé immédiatement | < 1 min |
| 3 | Ne pas marquer comme récupérée | `reminder1_message` | +2 min |
| 4 | Toujours pas récupérée | `reminder2_message` | +5 min |
| 5 | Toujours pas récupérée | `reminder3_message` | +10 min |
| 6 | Marquer comme **Récupérée** | Plus de rappels | — |

### 2c — Correction d'erreur

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Marquer une commande comme Prête → message envoyé | `ready_message` reçu |
| 2 | Remettre en **En attente** (repasser à pending) | `order_ready_correction_template` envoyé |

### 2d — Suppression / restauration

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Supprimer une commande | Commande masquée de la liste |
| 2 | Restaurer la commande | Commande réapparaît |

### Vérifications variables
- `#{reference}` → référence de la commande (ex. `TEST-001`)
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom du client
- `{{nom}}` → nom du client

---

## 3. Rendez-vous (RDV)

### Configuration préalable
Paramètres → Rendez-vous :
- **Rappel 1** : activé, **10 min** avant
- **Rappel 2** : activé, **5 min** avant
- **Rappel 3** : activé, **2 min** avant
- Messages avec variables : `Bonjour {{prenom}}, rappel de votre RDV {{jour}} {{date}} à {{heure}}.`
- Message post-présent et post-absent configurés
- Boutons interactifs (confirmer / reprogrammer) activés si souhaité

### 3a — Cycle de vie d'un RDV

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV dans 15 min pour le client de test | Statut `scheduled` |
| 2 | Vérifier les horaires (début, fin) | `started_at` et `ended_at` corrects (gestion minuit) |
| 3 | Marquer comme **Présent** | Statut `show`, points crédités si fidélité active |
| 4 | Vérifier les points | `points_log` mis à jour |

### 3b — Rappels pré-RDV (WhatsApp)

| Étape | Action | Message attendu | Délai |
|-------|--------|-----------------|-------|
| 1 | Créer un RDV dans **15 min** pour le client de test | — | — |
| 2 | Attendre | `reminder1_message` (rappel 10 min avant) | T−10 min |
| 3 | Attendre | `reminder2_message` (rappel 5 min avant) | T−5 min |
| 4 | Attendre | `reminder3_message` (rappel 2 min avant) | T−2 min |

> ⚠️ Les rappels déjà passés au moment de la création ne sont pas programmés. Créer le RDV suffisamment tôt pour que les 3 rappels soient futurs.

### 3c — Boutons interactifs (confirmer / reprogrammer)

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Recevoir un rappel avec boutons | Boutons "Confirmer" et "Reprogrammer" affichés |
| 2 | Appuyer sur **Confirmer** | Statut passe à `confirmed` |
| 3 | (Autre test) Appuyer sur **Reprogrammer** | Statut passe à `reschedule_requested`, notification urgente envoyée |

### 3d — Statut "Présent" (show)

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Après le RDV, cliquer **Présent** | `post_show_message` envoyé |

### 3e — Statut "Absent" (no-show)

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Après le RDV, cliquer **Absent** | `post_no_show_message` envoyé |

### 3f — Reprogrammation

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV dans 15 min | 3 rappels programmés |
| 2 | Reprogrammer le RDV à +30 min | Anciens rappels annulés, nouveaux programmés |
| 3 | Vérifier via `/api/debug/scheduled-messages?entity_id=<id>` | Nouveaux `send_at` corrects |

### 3g — Annulation

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV dans 15 min | Rappels programmés |
| 2 | Supprimer le RDV | Rappels annulés (status = CANCELLED) |
| 3 | Vérifier qu'aucun message n'arrive | Silence ✅ |

### Vérifications variables
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom du client
- `{{nom}}` → nom du client
- `{{jour}}` → "lundi" / "mardi" / …
- `{{date}}` → "5 mars" / "12 avril" / …
- `{{heure}}` → "14h30"

---

## 4. Avis (Reviews)

### Configuration préalable
Paramètres → Avis :
- Module **activé**
- Délai après interaction : **2 min** (via SQL si nécessaire)
- Interactions minimum : **1**
- Message satisfaction : `Bonjour {{prenom}}, étiez-vous satisfait(e) de votre dernière visite ?`

> ⚠️ Le cron `/api/jobs/reviews` tourne **toutes les heures**. Pour tester rapidement, déclencher manuellement :
> ```
> GET /api/jobs/reviews?secret=CRON_SECRET
> ```

### 4a — Flux complet positif

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV / commande et le marquer terminé | Interaction enregistrée |
| 2 | Déclencher le cron reviews | `satisfaction_message` + boutons 👍 / 👎 |
| 3 | Appuyer sur **👍 Oui** | `positive_message` + lien Google (si configuré) |

### 4b — Flux négatif

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Même que scénario 4a, étapes 1 et 2 | `satisfaction_message` reçu |
| 2 | Appuyer sur **👎 Non** | `negative_message` |
| 3 | Vérifier la page Avis dans le dashboard | Avis négatif visible, marqué "À traiter" |

### 4c — Rappel de satisfaction

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Laisser le premier message sans réponse | — |
| 2 | Attendre le délai de rappel configuré, déclencher le cron | Second envoi du `satisfaction_message` |
| 3 | Vérifier qu'il n'est envoyé qu'une seule fois | Silence après le rappel ✅ |

### 4d — Notification urgente (avis négatif)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Configurer les notifications urgentes (numéro destinataire) | — |
| 2 | Recevoir un avis négatif (👎) | Notification urgente envoyée au propriétaire |

### Vérifications variables
- `{name}` → prénom (syntaxe historique, toujours supportée)
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom
- `{{nom}}` → nom

---

## 5. Fidélité

### 5a — Programme et points

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Paramètres → Fidélité → Créer un programme (type "passage" ou "montant") | Programme actif |
| 2 | Configurer les paliers (ex. 1 point → café offert) | Paliers créés |
| 3 | Fiche client → Ajouter des points | Points ajoutés, `points_log` mis à jour |
| 4 | Atteindre un palier | Coupon généré automatiquement (source `tier_unlock`) |
| 5 | Vérifier le cycle de points | Points cycle remis à 0 après déverrouillage du palier |

### 5b — Notification palier atteint (WhatsApp)

#### Configuration préalable
Paramètres → Fidélité :
- Créer un palier avec **1 point requis** (pour déclencher immédiatement)
- Activer **"Notifier lors du palier"**
- Message : `Félicitations {{prenom}} ! Vous avez débloqué : #{reward_title} (valable jusqu'au #{expiry_date}).`

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Ouvrir la fiche client de test | — |
| 2 | Ajouter **1 point fidélité** (passage ou montant) | `notification_message_template` envoyé |

#### Vérifications variables
- `#{reward_title}` → titre de la récompense du palier
- `#{expiry_date}` → date d'expiration calculée (J + validité_jours)
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom
- `{{nom}}` → nom

### 5c — Cadeau d'anniversaire (WhatsApp)

#### Configuration préalable
Paramètres → Fidélité → Cadeau d'anniversaire :
- Module **activé**
- Cadeau : "un café offert"
- Message : `Joyeux anniversaire {{prenom}} ! 🎂 Nous vous offrons #{cadeau}.`
- Heure d'envoi : **heure courante + 1 min** (pour déclencher dans la minute)

| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Modifier la date de naissance du client de test → **aujourd'hui** (même MM-JJ) | — |
| 2 | Déclencher manuellement le cron birthday : `GET /api/jobs/birthday-rewards?secret=CRON_SECRET` | `birthday_message_template` envoyé |
| 3 | Relancer le cron | Silence (idempotent, déjà envoyé aujourd'hui) ✅ |

#### Vérifications variables
- `#{cadeau}` → titre du cadeau configuré
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom
- `{{nom}}` → nom

### 5d — Coupons

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Vérifier qu'un coupon a été créé (palier ou anniversaire) | Coupon `active` en base |
| 2 | Générer un code de remboursement (10 min de validité) | Code à 6 chiffres affiché |
| 3 | Utiliser le code côté vendeur | Coupon passe en statut `used` |
| 4 | Tenter de réutiliser le même code | Rejeté ✅ |
| 5 | Laisser un coupon expirer | Statut passe à `expired` |

### 5e — Annulation de crédits (Undo)

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Créditer des points au client | Points ajoutés |
| 2 | Annuler le crédit (undo) | Points retirés, `points_log` mis à jour |

---

## 6. Conversations

### 6a — Flux conversation après avis négatif

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Recevoir un avis négatif (👎 Non) | Conversation créée, statut `TO_TREAT` |
| 2 | Ouvrir la conversation dans le dashboard | Messages visibles |
| 3 | Passer en statut **OPEN** | Statut mis à jour |
| 4 | Répondre au client | Message sortant enregistré, envoyé via WhatsApp |
| 5 | Client répond | Message entrant enregistré, `last_inbound_at` mis à jour |
| 6 | Résoudre la conversation | Statut passe à `RESOLVED` |

### 6b — Unicité

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Déclencher un 2e avis négatif pour le même client | Même conversation réutilisée (pas de doublon) |

---

## 7. Calendrier (Intégrations)

### 7a — Google Calendar

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Connecter un compte Google | OAuth complété, calendriers listés |
| 2 | Sélectionner un calendrier | Sync activée |
| 3 | Créer un événement dans Google Calendar | RDV créé dans LoyaPing (non assigné) |
| 4 | Modifier l'événement | RDV mis à jour |
| 5 | Supprimer l'événement | RDV supprimé |

### 7b — Microsoft Calendar

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Connecter un compte Microsoft | OAuth complété |
| 2 | Sélectionner un calendrier | Sync activée |
| 3 | Créer / modifier / supprimer un événement | Synchronisation bidirectionnelle correcte |

### 7c — Renouvellement du watch

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Vérifier le cron `calendar-watch-renew` (6h UTC) | Watch renouvelé sans erreur |

---

## 8. Notifications urgentes

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Paramètres → Configurer 1 ou 2 numéros destinataires | Numéros sauvegardés |
| 2 | Déclencher un événement urgent (avis négatif ou demande de reprogrammation) | Message WhatsApp reçu par le(s) destinataire(s) |
| 3 | Déclencher 2 événements en < 5 min | Un seul message groupé (anti-spam) |

---

## 9. Paramètres & Configuration

### 9a — Profil business

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Modifier nom, logo, couleurs, liens sociaux | Données sauvegardées, visibles sur le portail client |
| 2 | Modifier le fuseau horaire | Tous les calculs de dates utilisent le nouveau TZ |

### 9b — Horaires d'ouverture

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Configurer les horaires (7 jours, 2 créneaux/jour) | Horaires sauvegardés |
| 2 | Ajouter une exception de disponibilité (fermeture) | Exception visible, bloque les RDV ce jour |

### 9c — Modules activés/désactivés

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Désactiver le module "Commandes" | Section commandes masquée dans le dashboard |
| 2 | Réactiver | Section réapparaît |

---

## 10. Outbox (file d'attente universelle)

> L'outbox (`scheduled_messages`) est le cœur de la planification des messages. Tous les modules passent par elle.

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Vérifier les messages planifiés après une action (RDV, commande) | Lignes créées avec `status = SCHEDULED` |
| 2 | Déclencher `dispatch-scheduled-messages` | Messages passent en `PROCESSING` puis `SENT` |
| 3 | Simuler un échec (provider down) | `status = FAILED`, `attempts` incrémenté, `last_error` renseigné |
| 4 | Relancer le dispatch | Retry automatique (backoff exponentiel, max 4 tentatives) |
| 5 | Annuler un message (ex. suppression RDV) | `status = CANCELLED` |
| 6 | Vérifier l'unicité | Pas de doublon pour le même `entity_id` + `slot` |

---

## 11. Dashboard

| Étape | Action | Résultat attendu |
|-------|--------|-----------------|
| 1 | Ouvrir le dashboard | Métriques affichées correctement |
| 2 | Vérifier les compteurs commandes | Prêtes, en attente, non récupérées (3+ rappels), créées aujourd'hui |
| 3 | Vérifier les compteurs RDV | Aujourd'hui, prochain RDV, no-shows, demain |
| 4 | Vérifier les compteurs fidélité | Coupons actifs, anniversaires, expirant bientôt |
| 5 | Désactiver un module | Section correspondante disparaît du dashboard |

---

## Déclenchement manuel des crons

En local ou en production, tous les crons peuvent être déclenchés manuellement :

```bash
# Commandes (reminders)
GET /api/jobs/order-reminders?secret=CRON_SECRET

# RDV (dispatch outbox)
GET /api/jobs/dispatch-scheduled-messages?secret=CRON_SECRET

# RDV (rappels spécifiques)
GET /api/jobs/appointment-reminders?secret=CRON_SECRET

# Avis
GET /api/jobs/reviews?secret=CRON_SECRET

# Anniversaires
GET /api/jobs/birthday-rewards?secret=CRON_SECRET

# Renouvellement watch calendrier
GET /api/jobs/calendar-watch-renew?secret=CRON_SECRET
```

---

## Debug — Vérifier l'état des messages schedulés

```
GET /api/debug/scheduled-messages?entity_id=<appointment_id_ou_order_id>
```

Champs utiles :
- `status` : `SCHEDULED` / `PROCESSING` / `SENT` / `FAILED` / `CANCELLED`
- `send_at` : heure prévue d'envoi
- `attempts` : nombre de tentatives
- `last_error` : dernier message d'erreur (ex. quota Twilio)

> 💡 Endpoint temporaire — à supprimer après les tests de production.

---

## Matrice de couverture WhatsApp

| Module | Envoi immédiat | Rappels planifiés | Variables client | Boutons interactifs |
|--------|:--------------:|:-----------------:|:----------------:|:-------------------:|
| Commandes | ✅ | ✅ (3) | ✅ | ❌ |
| RDV — Rappels | — | ✅ (3) | ✅ | ✅ (confirmer/reprogrammer) |
| RDV — Post-visite | ✅ | — | ✅ | ❌ |
| Avis | ✅ | ✅ (1 rappel) | ✅ | ✅ (👍/👎) |
| Fidélité palier | ✅ | — | ✅ | ❌ |
| Fidélité anniversaire | ✅ (via cron) | — | ✅ | ❌ |
| Conversations | ✅ | — | — | ❌ |
| Notifications urgentes | ✅ | — | — | ❌ |

---

## Matrice de couverture fonctionnelle

| Module | CRUD | WhatsApp | Cron | Portail client | Dashboard |
|--------|:----:|:--------:|:----:|:--------------:|:---------:|
| Clients | ✅ | — | — | ✅ | — |
| Commandes | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rendez-vous | ✅ | ✅ | ✅ | ✅ | ✅ |
| Avis | ✅ | ✅ | ✅ | — | ✅ |
| Fidélité | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conversations | ✅ | ✅ | — | — | — |
| Calendrier | ✅ | — | ✅ | — | — |
| Paramètres | ✅ | — | — | — | — |
