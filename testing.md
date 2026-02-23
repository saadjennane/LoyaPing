# Plan de test — LoyaPing

> Testé sur Vercel (prod) avec Twilio Sandbox WhatsApp.
> Avant chaque session de test, vérifier que le numéro destinataire a rejoint le sandbox Twilio (sinon les messages n'arriveront pas).

---

## 0. Prérequis globaux

- [ ] Twilio sandbox actif : envoyer `join <mot-clé>` au `+14155238886` depuis le numéro de test
- [ ] Variables d'env sur Vercel correctement configurées (`WHATSAPP_PROVIDER=twilio`, `TWILIO_*`, `DEFAULT_BUSINESS_ID`, `CRON_SECRET`)
- [ ] Au moins 1 client avec numéro WhatsApp valide en base
- [ ] Programme de fidélité configuré (type + au moins 1 palier)

---

## 1. Authentification

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1.1 | Accéder à l'app sans être connecté | Redirection vers `/login` |
| 1.2 | Se connecter avec les identifiants corrects | Redirection vers le dashboard |
| 1.3 | Se déconnecter | Redirection vers `/login`, session détruite |

---

## 2. Dashboard

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 2.1 | Ouvrir le dashboard | Métriques affichées (commandes, RDV, fidélité selon modules activés) |
| 2.2 | Désactiver un module (ex: commandes) dans Paramètres → Modules | Le widget commandes disparaît du dashboard |
| 2.3 | Cliquer sur un raccourci du dashboard | Navigation vers la bonne page |

---

## 3. Commandes

### 3.1 Création

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.1.1 | Créer une commande avec un client existant | Commande créée, apparaît dans l'onglet "En attente" |
| 3.1.2 | Créer une commande en créant un nouveau client à la volée | Client créé ET commande créée |
| 3.1.3 | Créer une commande sans référence | Commande créée sans référence |
| 3.1.4 | Créer une commande avec un montant | Montant visible dans le détail |

### 3.2 Marquer comme prête (flow WhatsApp)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.2.1 | Cliquer "Prête" sur une commande | Toast 10s avec bouton Annuler, commande passe dans l'onglet "Prête" |
| 3.2.2 | Attendre 10s sans annuler | Message WhatsApp reçu sur le numéro du client |
| 3.2.3 | Cliquer "Prête" puis "Annuler" dans les 10s | Aucun message WhatsApp envoyé, commande repassée en "En attente" |
| 3.2.4 | Cliquer "Annuler" après les 10s (trop tard) | Toast d'erreur "trop tard", proposition de message de correction |
| 3.2.5 | Vérifier dans Supabase `scheduled_messages` | Ligne avec `status=SENT` et `message_type=order_ready` |

### 3.3 Récupération et points fidélité

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.3.1 | Marquer une commande comme récupérée (programme "passage") | Points crédités au client (1 point ou `points_per_visit`) |
| 3.3.2 | Marquer une commande récupérée avec montant (programme "montant") | Points calculés selon le montant et le taux de conversion |
| 3.3.3 | Annuler une commande récupérée → repasser en "Prête" | Points débités, `points_credited` repassé à false |
| 3.3.4 | Vérifier dans Supabase `points_log` | Entrée avec `source_type=order` et `points_delta` correct |

### 3.4 Rappels automatiques

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.4.1 | Commande "Prête" non récupérée depuis 24h | 1er rappel WhatsApp envoyé (via cron) |
| 3.4.2 | Commande "Prête" non récupérée depuis 48h | 2ème rappel WhatsApp envoyé |
| 3.4.3 | Commande avec 3+ rappels | Apparaît dans l'onglet "Non récupérées" |

### 3.5 Opérations diverses

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.5.1 | Rechercher une commande par nom client | Résultats filtrés en temps réel |
| 3.5.2 | Rechercher par référence | Commande trouvée |
| 3.5.3 | Supprimer une commande | Commande supprimée (soft delete) |
| 3.5.4 | Sélectionner plusieurs commandes → Marquer comme prêtes en masse | Toutes passent en "Prête" |
| 3.5.5 | Sélectionner plusieurs commandes → Supprimer en masse | Toutes supprimées |

---

## 4. Rendez-vous

### 4.1 Création

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.1.1 | Créer un RDV avec un client existant | RDV créé, visible dans le calendrier et la liste |
| 4.1.2 | Créer un RDV en créant un nouveau client | Client créé ET RDV créé |
| 4.1.3 | Créer un RDV avec des notes | Notes visibles dans le détail |

### 4.2 Vues calendrier

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.2.1 | Passer en vue "Jour" | Affiche les RDV du jour sélectionné par heure |
| 4.2.2 | Passer en vue "3 jours" | Affiche 3 colonnes |
| 4.2.3 | Passer en vue "Semaine" | Affiche 7 colonnes |
| 4.2.4 | Passer en vue "Mois" | Affiche grille mensuelle |
| 4.2.5 | Passer en vue "Liste" | Affiche RDV en liste avec filtres |
| 4.2.6 | Naviguer vers le mois suivant/précédent | Calendrier mis à jour |

### 4.3 Statuts et points

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.3.1 | Marquer un RDV "Présent" (programme "passage") | Statut → `show`, points crédités |
| 4.3.2 | Marquer un RDV "Présent" avec montant (programme "montant") | Points calculés selon montant |
| 4.3.3 | Marquer un RDV "Absent" | Statut → `no_show`, aucun point |
| 4.3.4 | Passer de "Absent" à "Présent" (correction) | Statut corrigé via force, points crédités |
| 4.3.5 | Passer de "Présent" à "Absent" (correction) | Statut corrigé via force, pas de double-débit de points |
| 4.3.6 | Vérifier `points_log` en base | Entrée `source_type=appointment` avec bon `points_delta` |

### 4.4 Rappels WhatsApp (R1 / R2 / R3)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.4.1 | Créer un RDV + configurer 1 rappel à 1h avant | Message WhatsApp envoyé 1h avant (via cron) |
| 4.4.2 | Vérifier badges R1/R2/R3 dans la liste | Badges verts visibles pour les rappels planifiés |
| 4.4.3 | Supprimer un RDV → vérifier rappels | Rappels CANCELLED dans `scheduled_messages` |
| 4.4.4 | Reprogrammer un RDV | Anciens rappels annulés, nouveaux créés |

### 4.5 Messages post-RDV

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.5.1 | Marquer "Présent" avec post-show activé dans les paramètres | Message post-show WhatsApp reçu |
| 4.5.2 | Marquer "Absent" avec post-no-show activé | Message post-no-show WhatsApp reçu |
| 4.5.3 | Passer de "Absent" à "Présent" | Post-no-show annulé, post-show envoyé à la place |

### 4.6 Opérations diverses

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.6.1 | Filtrer la liste par statut "Absent" | Seuls les no-show affichés |
| 4.6.2 | Filtrer par "WhatsApp échoué" | Seuls les RDV avec `hasFailed=true` |
| 4.6.3 | Sélectionner plusieurs RDV → marquer présents en masse | Tous mis à jour |
| 4.6.4 | Supprimer plusieurs RDV | Suppression en masse |

---

## 5. Clients

### 5.1 Création et édition

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.1.1 | Créer un client avec nom + téléphone | Client créé, visible dans la liste |
| 5.1.2 | Créer un client avec tous les champs (civilité, email, anniversaire, notes) | Tous les champs sauvegardés |
| 5.1.3 | Créer un client avec un numéro déjà existant | Erreur de doublon |
| 5.1.4 | Modifier les infos d'un client | Modifications sauvegardées |
| 5.1.5 | Supprimer un client | Client supprimé (soft delete) |

### 5.2 Recherche et filtres

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.2.1 | Rechercher par nom | Résultats filtrés en temps réel |
| 5.2.2 | Rechercher par téléphone (4 derniers chiffres) | Client trouvé |
| 5.2.3 | Trier par dernière activité | Liste triée correctement |

### 5.3 Fidélité depuis la fiche client

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.3.1 | Ajouter des points manuellement | Points mis à jour, entrée dans `points_log` avec `source_type=manual` |
| 5.3.2 | Retirer des points manuellement | Points décrémentés (pas sous 0) |
| 5.3.3 | Débloquer un palier manuellement | Coupon créé pour ce client |
| 5.3.4 | Voir l'historique des points | Toutes les transactions affichées |
| 5.3.5 | Voir les coupons actifs du client | Liste coupons avec statut |

### 5.4 Lien client (magic link)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.4.1 | Copier le lien client depuis la fiche | Lien `/u/[token]` copié |
| 5.4.2 | Ouvrir le lien dans un autre navigateur | Page client accessible sans connexion |

### 5.5 Opérations en masse

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.5.1 | Sélectionner plusieurs clients → ajouter X points | Points mis à jour pour tous |
| 5.5.2 | Sélectionner plusieurs clients → supprimer | Tous supprimés |

---

## 6. Fidélité

### 6.1 Programme "Passage"

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 6.1.1 | Configurer le programme type "passage" avec 1 point par visite | Sauvegardé |
| 6.1.2 | Valider un RDV ou une commande | 1 point crédité au client |
| 6.1.3 | Atteindre le seuil d'un palier | Coupon créé automatiquement |
| 6.1.4 | Atteindre le dernier palier | Cycle réinitialisé, `total_cycles_completed` incrémenté |

### 6.2 Programme "Montant"

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 6.2.1 | Configurer "montant" avec 10 MAD = 1 point | Sauvegardé |
| 6.2.2 | Valider une commande de 50 MAD | 5 points crédités |
| 6.2.3 | Valider une commande de 7 MAD (< 10) | 0 points crédités |

### 6.3 Notification de palier

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 6.3.1 | Activer "Notification au palier" dans les paramètres | Champ message visible par palier |
| 6.3.2 | Client atteint un palier | WhatsApp envoyé avec le message du palier |

### 6.4 Gestion des paliers

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 6.4.1 | Créer 5 paliers | 5 paliers visibles, bouton "Ajouter" désactivé |
| 6.4.2 | Modifier un palier (points requis, description) | Modifications sauvegardées |
| 6.4.3 | Supprimer un palier | Palier supprimé |
| 6.4.4 | Désactiver un palier | Palier ignoré pour les déblocages |

---

## 7. Coupons

### 7.1 Génération et cycle de vie

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 7.1.1 | Client atteint un palier | Coupon créé dans l'onglet "Actifs" |
| 7.1.2 | Créer un coupon manuellement (Offrir un coupon) | Coupon créé pour le client sélectionné |
| 7.1.3 | Coupon expiré (date dépassée) | Passe dans l'onglet "Expirés" |

### 7.2 Rédemption

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 7.2.1 | Générer le code à 6 chiffres depuis la page client | Code affiché, valide 10 min |
| 7.2.2 | Entrer le code dans "Valider un coupon" | Coupon marqué "utilisé" |
| 7.2.3 | Entrer un code expiré (>10 min) | Erreur "code expiré" |
| 7.2.4 | Entrer un code incorrect | Erreur "code invalide" |
| 7.2.5 | Utiliser le même code 2 fois | Erreur à la 2ème tentative |

### 7.3 Opérations en masse

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 7.3.1 | Sélectionner des coupons expirés → Réactiver | Coupons repassent en "Actifs" avec nouvelle date |
| 7.3.2 | Sélectionner des coupons actifs → Prolonger de X jours | Date d'expiration repoussée |
| 7.3.3 | Sélectionner des coupons → Supprimer en masse | Coupons supprimés |

---

## 8. Anniversaire

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 8.1 | Configurer un message d'anniversaire dans les paramètres fidélité | Champ template visible |
| 8.2 | Définir la date d'anniversaire d'un client à aujourd'hui | Date sauvegardée |
| 8.3 | Déclencher le cron birthday-rewards | Coupon anniversaire créé, WhatsApp envoyé |
| 8.4 | Vérifier que le cron ne re-crédite pas si déjà envoyé aujourd'hui | Idempotent — pas de doublon |

---

## 9. Paramètres

### 9.1 Organisation

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 9.1.1 | Modifier le nom de l'entreprise | Nouveau nom visible partout |
| 9.1.2 | Uploader un logo | Logo visible dans le dashboard/portal |
| 9.1.3 | Configurer les horaires d'ouverture | Horaires sauvegardés |
| 9.1.4 | Changer le fuseau horaire | Fuseau sauvegardé |

### 9.2 Modules

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 9.2.1 | Désactiver le module "Commandes" | Onglet Commandes masqué dans la nav |
| 9.2.2 | Réactiver le module "Commandes" | Onglet réapparaît |
| 9.2.3 | Désactiver tous les modules sauf "Fidélité" | Dashboard centré sur la fidélité |

### 9.3 Notifications commandes

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 9.3.1 | Modifier le message "commande prête" | Nouveau message envoyé aux prochaines commandes |
| 9.3.2 | Effacer le message → sauvegarder | Bannière d'avertissement "WhatsApp désactivé" sur la page commandes |
| 9.3.3 | Configurer les 3 rappels avec intervalles différents | Rappels programmés selon ces intervalles |

### 9.4 Notifications RDV

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 9.4.1 | Activer R1 avec 24h avant | Rappel R1 planifié pour les prochains RDV |
| 9.4.2 | Désactiver R2 et R3 | Seul R1 planifié |
| 9.4.3 | Modifier le message R1 | Nouveau texte utilisé dès le prochain RDV |
| 9.4.4 | Activer les messages post-RDV | Message envoyé après chaque présent/absent |

### 9.5 Champs clients

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 9.5.1 | Désactiver "Email" dans la fiche | Champ email masqué dans le formulaire client |
| 9.5.2 | Désactiver "Email" dans la fiche → la colonne email dans la liste est grisée | Bascule colonne email non cliquable |
| 9.5.3 | Désactiver "Anniversaire" dans la fiche | Champ anniversaire masqué |
| 9.5.4 | Désactiver "Notes" dans la fiche | Champ notes masqué |

---

## 10. Portail client

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 10.1 | Ouvrir le lien `/u/[token]` | Page client affichée avec points et coupons actifs |
| 10.2 | Cliquer "Générer mon code" sur un coupon | Code à 6 chiffres affiché, expiration 10 min visible |
| 10.3 | Rafraîchir la page après génération du code | Code toujours visible tant qu'il est valide |
| 10.4 | Attendre expiration du code (10 min) | Code expiré, bouton "Générer" de nouveau disponible |
| 10.5 | Coupon utilisé | Disparaît des coupons actifs |
| 10.6 | Ouvrir le lien avec un token invalide | Page d'erreur ou redirection |

---

## 11. Outbox WhatsApp (scheduled_messages)

Ces tests vérifient le comportement de l'outbox directement dans Supabase.

| # | Scénario | Vérification en base |
|---|----------|---------------------|
| 11.1 | Déclencher une action WhatsApp | Ligne créée dans `scheduled_messages` avec `status=SCHEDULED` |
| 11.2 | Attendre 10s (send-now) ou 60s (cron) | Ligne passe à `status=SENT` |
| 11.3 | Annuler dans les 10s | Ligne passe à `status=CANCELLED` |
| 11.4 | Simuler un échec WhatsApp | Ligne passe à `status=SCHEDULED` (retry avec backoff 30s/60s/90s) |
| 11.5 | 4 tentatives échouées | Ligne passe à `status=FAILED` avec `last_error` renseigné |
| 11.6 | Déclencher 2 fois la même action | Pas de doublon (index unique sur SCHEDULED/PROCESSING) |

---

## 12. Cas limites et edge cases

| # | Scénario | Résultat attendu |
|---|----------|-----------------|
| 12.1 | Client sans numéro de téléphone WhatsApp | Aucun message envoyé, pas d'erreur bloquante |
| 12.2 | Atteindre le 5ème palier d'un coup (plusieurs paliers franchis) | Tous les coupons créés, cycle réinitialisé |
| 12.3 | Cliquer 2 fois rapidement sur "Prête" | 2ème clic bloqué (OUTBOX_CONFLICT ou guard PROCESSING) |
| 12.4 | RDV passé supprimé → rappels futurs | Rappels annulés dans `scheduled_messages` |
| 12.5 | Programme de fidélité modifié entre 2 commandes | Nouveaux points calculés avec les nouveaux paramètres |
| 12.6 | Montant 0 avec programme "montant" | 0 points crédités, pas d'erreur |

---

## Checklist pre-production

- [ ] Toutes les variables d'env configurées sur Vercel
- [ ] `WHATSAPP_PROVIDER` correctement défini (`twilio` ou `cloud_api`)
- [ ] Cron jobs actifs dans Vercel → Settings → Cron Jobs (4 crons attendus)
- [ ] `CRON_SECRET` défini et identique dans Vercel
- [ ] `DEFAULT_BUSINESS_ID` correspond bien au business en base
- [ ] Programme de fidélité activé (`is_active=true`)
- [ ] Au moins 1 message configuré dans Paramètres → Commandes et Paramètres → RDV
- [ ] Sandbox Twilio : numéro de test a rejoint avec `join <mot-clé>`
