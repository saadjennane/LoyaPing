# Modèles WhatsApp à créer dans Meta

Avec l'API officielle (Cloud API / EasyCoexistence), un message envoyé **à l'initiative du commerce** ne peut partir en texte libre que si le client a écrit dans les **24 dernières heures**. Sinon LoyaPing envoie automatiquement le modèle correspondant ci-dessous.

À créer dans **WhatsApp Manager → Modèles de message**, pour le numéro connecté :
- **Nom** et **langue (Français, code `fr`)** exactement comme indiqué : LoyaPing les appelle par leur nom.
- Le **texte** à l'identique, variables `{{1}}`, `{{2}}`… comprises. Meta demande un exemple pour chaque variable (colonne « Exemple »).
- Les **boutons** en « Réponse rapide » (Quick reply), dans cet ordre.

Ce fichier est généré à partir de `lib/whatsapp/templates.ts` : si un texte doit changer, modifier les deux.

## `loyaping_commande_prete`

- **Utilisation** : Commande prête — {{1}} prénom, {{2}} référence, {{3}} nom du commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, votre commande {{2}} est prête. Vous pouvez venir la récupérer chez {{3}}.

**Exemple** : `{{1}}` = Sara · `{{2}}` = CMD-0042 · `{{3}}` = Institut Lina

## `loyaping_commande_rappel`

- **Utilisation** : Rappels de commande non récupérée — {{1}} prénom, {{2}} référence, {{3}} commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, petit rappel : votre commande {{2}} vous attend chez {{3}}.

**Exemple** : `{{1}}` = Sara · `{{2}}` = CMD-0042 · `{{3}}` = Institut Lina

## `loyaping_commande_correction`

- **Utilisation** : Correction « commande pas encore prête » — {{1}} prénom, {{2}} référence, {{3}} commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, désolé, votre commande {{2}} n'est finalement pas encore prête. {{3}} vous préviendra dès qu'elle le sera.

**Exemple** : `{{1}}` = Sara · `{{2}}` = CMD-0042 · `{{3}}` = Institut Lina

## `loyaping_rdv_rappel`

- **Utilisation** : Rappels de RDV sans boutons — {{1}} prénom, {{2}} commerce, {{3}} jour + date, {{4}} heure
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, nous vous rappelons votre rendez-vous chez {{2}} le {{3}} à {{4}}.

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina · `{{3}}` = mardi 4 mars · `{{4}}` = 14h30

## `loyaping_rdv_rappel_confirmation`

- **Utilisation** : Rappels de RDV avec boutons — mêmes variables
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, nous vous rappelons votre rendez-vous chez {{2}} le {{3}} à {{4}}. Merci de confirmer votre présence.

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina · `{{3}}` = mardi 4 mars · `{{4}}` = 14h30

**Boutons (réponse rapide)** : 1. ✅ Je confirme · 2. 🔁 Replanifier

## `loyaping_rdv_merci`

- **Utilisation** : Message après un RDV honoré — {{1}} prénom, {{2}} commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, merci pour votre visite chez {{2}} ! À très bientôt.

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina

## `loyaping_rdv_absence`

- **Utilisation** : Message après une absence — {{1}} prénom, {{2}} commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, nous ne vous avons pas vu à votre rendez-vous chez {{2}}. Répondez à ce message pour en fixer un nouveau.

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina

## `loyaping_anniversaire`

- **Utilisation** : Anniversaire — {{1}} prénom, {{2}} commerce, {{3}} cadeau
- **Catégorie** : Marketing
- **Langue** : Français (`fr`)

**Texte**

> Joyeux anniversaire {{1}} ! 🎉 Pour l'occasion, {{2}} vous offre {{3}}.

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina · `{{3}}` = un soin visage offert

## `loyaping_recompense`

- **Utilisation** : Récompense débloquée — {{1}} prénom, {{2}} commerce, {{3}} récompense
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, vous avez débloqué une récompense chez {{2}} : {{3}} 🎁

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina · `{{3}}` = une manucure offerte

## `loyaping_avis`

- **Utilisation** : Demande d'avis et relance — {{1}} prénom, {{2}} commerce
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> Bonjour {{1}}, avez-vous été satisfait(e) de votre dernière visite chez {{2}} ?

**Exemple** : `{{1}}` = Sara · `{{2}}` = Institut Lina

**Boutons (réponse rapide)** : 1. 👍 Oui · 2. 👎 Non

## `loyaping_alerte`

- **Utilisation** : Alerte envoyée à tes numéros d'urgence — {{1}} résumé
- **Catégorie** : Utilitaire (Utility)
- **Langue** : Français (`fr`)

**Texte**

> LoyaPing : {{1}}. Ouvrez l'application pour la traiter.

**Exemple** : `{{1}}` = un client souhaite replanifier son rendez-vous

