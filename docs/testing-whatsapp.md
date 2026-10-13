# Plan de test — Envois WhatsApp par module

> **Prérequis communs**
> - Un client de test avec un vrai numéro WhatsApp, un prénom, nom et civilité renseignés
> - `WHATSAPP_PROVIDER` configuré (Twilio / Vonage / Cloud API)
> - Les crons tournent (Vercel ou déclenchement manuel via l'URL)
> - Quota WhatsApp suffisant (Twilio free : 50 msg/jour)

---

## Module 1 — Commandes

### Configuration préalable
Paramètres → Commandes :
- **Rappel 1** : activé, délai **2 min**
- **Rappel 2** : activé, délai **5 min**
- **Rappel 3** : activé, délai **10 min**
- Messages avec variables : `Bonjour {{civilite}} {{nom}}, votre commande #{reference} est prête !`

### Scénario A — Message "Prête" + rappels
| Étape | Action | Message attendu | Délai |
|-------|--------|-----------------|-------|
| 1 | Créer une commande pour le client de test | — | — |
| 2 | Marquer la commande comme **Prête** | `ready_message` envoyé immédiatement | < 1 min |
| 3 | Ne pas marquer comme récupérée | `reminder1_message` | +2 min |
| 4 | Toujours pas récupérée | `reminder2_message` | +5 min |
| 5 | Toujours pas récupérée | `reminder3_message` | +10 min |
| 6 | Marquer comme **Récupérée** | Plus de rappels | — |

### Scénario B — Correction d'erreur
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Marquer une commande comme Prête → message envoyé | `ready_message` reçu |
| 2 | Remettre en **En attente** (repasser à pending) | `order_ready_correction_template` envoyé |

### Vérifications variables
- `#{reference}` → référence de la commande (ex. `TEST-001`)
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom du client
- `{{nom}}` → nom du client

---

## Module 2 — Rendez-vous (RDV)

### Configuration préalable
Paramètres → Rendez-vous :
- **Rappel 1** : activé, **10 min** avant
- **Rappel 2** : activé, **5 min** avant
- **Rappel 3** : activé, **2 min** avant
- Messages avec variables : `Bonjour {{prenom}}, rappel de votre RDV {{jour}} {{date}} à {{heure}}.`
- Message post-présent et post-absent configurés

### Scénario A — Rappels pré-RDV
| Étape | Action | Message attendu | Délai |
|-------|--------|-----------------|-------|
| 1 | Créer un RDV dans **15 min** pour le client de test | — | — |
| 2 | Attendre | `reminder3_message` (rappel 2 min avant) | T−2 min |
| 3 | Attendre | `reminder2_message` (rappel 5 min avant) | T−5 min |
| 4 | Attendre | `reminder1_message` (rappel 10 min avant) | T−10 min |

> ⚠️ Les rappels déjà passés au moment de la création ne sont pas programmés. Créer le RDV suffisamment tôt pour que les 3 rappels soient futurs.

### Scénario B — Statut "Présent" (show)
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Après le RDV, cliquer **Présent** | `post_show_message` envoyé |

### Scénario C — Statut "Absent" (no-show)
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Après le RDV, cliquer **Absent** | `post_no_show_message` envoyé |

### Scénario D — Reprogrammation
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV dans 15 min | 3 rappels programmés |
| 2 | Reprogrammer le RDV à +30 min | Anciens rappels annulés, nouveaux programmés |
| 3 | Vérifier via `/api/debug/scheduled-messages?entity_id=<id>` | Nouveaux `send_at` corrects |

### Scénario E — Annulation
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

## Module 3 — Avis (Reviews)

### Configuration préalable
Paramètres → Avis :
- Module **activé**
- Délai après interaction : **2 min** (champ "Délai", unité "Minutes" → converti en heures : mettre `0` heures, ou tricher via SQL)
- Interactions minimum : **1**
- Message satisfaction : `Bonjour {{prenom}}, étiez-vous satisfait(e) de votre dernière visite ?`

> ⚠️ Le cron `/api/jobs/reviews` tourne **toutes les heures**. Pour tester rapidement, déclencher manuellement :
> ```
> GET /api/jobs/reviews?secret=CRON_SECRET
> ```

### Scénario A — Flux complet positif
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Créer un RDV / commande et le marquer terminé | Interaction enregistrée |
| 2 | Déclencher le cron reviews | `satisfaction_message` + boutons 👍 / 👎 |
| 3 | Appuyer sur **👍 Oui** | `positive_message` + lien Google (si configuré) |

### Scénario B — Flux négatif
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Même que scénario A, étapes 1 et 2 | `satisfaction_message` reçu |
| 2 | Appuyer sur **👎 Non** | `negative_message` |

### Scénario C — Rappel de satisfaction
| Étape | Action | Message attendu |
|-------|--------|-----------------|
| 1 | Laisser le premier message sans réponse | — |
| 2 | Attendre le délai de rappel configuré, déclencher le cron | Second envoi du `satisfaction_message` |
| 3 | Vérifier qu'il n'est envoyé qu'une seule fois | Silence après le rappel ✅ |

### Vérifications variables
- `{name}` → prénom (syntaxe historique, toujours supportée)
- `{{civilite}}` → "Mme" / "M."
- `{{prenom}}` → prénom
- `{{nom}}` → nom

---

## Module 4 — Fidélité

### 4a — Notification palier atteint

#### Configuration préalable
Paramètres → Fidélité :
- Créer un palier avec **1 point requis** (pour déclencher immédiatement)
- Activer **"Notifier lors du palier"**
- Message : `Félicitations {{prenom}} ! Vous avez débloqué : #{reward_title} (valable jusqu'au #{expiry_date}).`

#### Scénario
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

---

### 4b — Cadeau d'anniversaire

#### Configuration préalable
Paramètres → Fidélité → Cadeau d'anniversaire :
- Module **activé**
- Cadeau : "un café offert"
- Message : `Joyeux anniversaire {{prenom}} ! 🎂 Nous vous offrons #{cadeau}.`
- Heure d'envoi : **heure courante + 1 min** (pour déclencher dans la minute)

#### Scénario
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

---

## Déclenchement manuel des crons

En local ou en production, tous les crons peuvent être déclenchés manuellement :

```
# Commandes (reminders)
GET /api/jobs/order-reminders?secret=CRON_SECRET

# RDV (dispatch outbox)
GET /api/jobs/dispatch-scheduled-messages?secret=CRON_SECRET

# Avis
GET /api/jobs/reviews?secret=CRON_SECRET

# Anniversaires
GET /api/jobs/birthday-rewards?secret=CRON_SECRET
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

## Matrice de couverture

| Module | Envoi immédiat | Rappels planifiés | Variables client | Boutons interactifs |
|--------|:--------------:|:-----------------:|:----------------:|:-------------------:|
| Commandes | ✅ | ✅ (3) | ✅ | ❌ |
| RDV — Rappels | — | ✅ (3) | ✅ | ❌ |
| RDV — Post-visite | ✅ | — | — | ❌ |
| Avis | ✅ | ✅ (1 rappel) | ✅ | ✅ |
| Fidélité palier | ✅ | — | ✅ | ❌ |
| Fidélité anniversaire | ✅ (via cron) | — | ✅ | ❌ |
