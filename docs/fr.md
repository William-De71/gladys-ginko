# Ginko

## Présentation

Cette intégration amène **Ginko**, le réseau de bus et de tram du Grand Besançon, dans Gladys : les **prochains passages en temps réel** aux arrêts de votre choix (trois dans le formulaire, jusqu’à 20 de plus avec un bouton), filtrés par ligne et direction, et le **trafic** de six lignes au plus (normal, perturbé, interrompu, avec les messages de Ginko). Chaque arrêt et chaque ligne devient un appareil à afficher sur un tableau de bord et à utiliser dans les scènes.

Les données viennent de l’**API open data de Ginko** (Keolis Besançon Mobilités, pour Grand Besançon Métropole), sous licence ODbL. Les arrêts sont lus toutes les minutes par défaut (toutes les 10 minutes quand un arrêt n’annonce rien, la nuit), le trafic toutes les 5 minutes. Les lignes et arrêts du réseau sont gardés par l’intégration et relus une fois par jour et une fois par semaine.

C’est une intégration **cloud** : elle contacte `api.ginko.voyage` avec votre clé. Rien d’autre ne quitte votre réseau.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Une **clé d’API Ginko**, gratuite : demandez-la par e-mail à ginko.support-ssi@keolis.com. Pour essayer d’abord, le site [api.ginko.voyage](https://api.ginko.voyage/) donne une clé temporaire valable 24 heures (rubrique « Clé temporaire »).

## Configuration

| Champ              | Quoi saisir                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clé d’API          | La clé envoyée par Ginko, ou la clé temporaire du jour.                                                                            |
| Arrêt 1, 2, 3      | Le nom de l’arrêt (« Chamars », « Gare Viotte ») pour les deux côtés de la rue, ou un identifiant (« t_cham1 ») pour un seul côté. |
| Ligne              | Seulement cette ligne : « T1 », « L3 », « 3 », « Plan B », « 51 ». Vide : toutes les lignes de l’arrêt.                            |
| Direction          | Seulement les destinations contenant ces mots : « Chalezeule », « Temis \| Gare Viotte ». Vide : les deux sens.                    |
| Lignes suivies     | Les lignes dont vous suivez le trafic, six au plus : « T1, L3, 7 ».                                                                |
| Lecture des arrêts | Toutes les 30 secondes, minutes, 2 minutes ou 5 minutes.                                                                           |
| Langue des textes  | Noms des appareils, résumés et sorties des scènes. Les noms d’arrêts et les messages de Ginko restent en français.                 |

Le bouton **Chercher un arrêt** donne les noms exacts des arrêts contenant quelques mots, avec l’identifiant de chaque côté de la rue et les directions qui y sont desservies (« BQTSO01 → Prés de Vaux (12), Trey (D4) ») : copiez l’identifiant du côté où vous montez. Un nom que Ginko écrit autrement est trouvé quand même (« Pôle Temis » donne « Temis »). **Tester la connexion** vérifie la clé et lit tout de suite chaque arrêt et chaque ligne.

Plus d’arrêts que les trois du formulaire (domicile, travail…) : **Ajouter un arrêt** reprend les trois mêmes champs — arrêt, ligne, direction — et suit jusqu’à 20 arrêts de plus. **Lister les arrêts** montre tous les arrêts suivis, numérotés ; **Retirer un arrêt** prend ce numéro (ou le nom). Les arrêts ajoutés sont gardés dans la configuration de Gladys et suivent donc ses sauvegardes.

## Utilisation

### Appareils

Dans l’onglet **Découvrir**, créez les appareils voulus :

- **Ginko \<arrêt\>** : le prochain passage en texte (« T2 → Hauts du Chazal · 3 min »), l’attente du prochain passage et du suivant (minutes), et le nombre de passages annoncés qui ne desservent pas l’arrêt (« Non desservi », « Déviation ») ;
- **Ginko ligne \<ligne\>** : le trafic en texte (« Perturbation en cours : Manifestation ») et le nombre de perturbations en cours.

Quand le véhicule n’est pas localisé, Ginko donne l’horaire théorique : l’intégration le précise (« horaire théorique »). La nuit, sans aucun passage, les attentes gardent leur dernière valeur.

### Widgets du tableau de bord

![Le widget Passages Ginko à Gare Viotte et le widget Trafic Ginko de cinq lignes (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-ginko/main/docs/assets/widgets.fr.png)

- **Passages Ginko** : les prochains passages d’un arrêt, en compact : une ligne par ligne de bus et destination, avec ses prochains passages à la suite (« 1 · 9 · 27 min », « 23:32 », « Non desservi »), les horaires théoriques en gris. Le réglage **Trajets affichés** fixe le nombre de lignes. Choisissez un arrêt suivi, ou saisissez n’importe quel arrêt (et une ligne) dans les réglages du widget. Avec **Plusieurs arrêts**, un seul widget affiche plusieurs appareils arrêts : les appareils d’un même arrêt (un par ligne, par exemple) sont réunis sous son nom, leurs trajets du plus proche au plus lointain ; pour des arrêts différents, chaque ligne commence par son arrêt. Le réglage **Trajets affichés** vaut alors pour chaque arrêt, 10 lignes au plus en tout.
- **Trafic Ginko** : l’état de chaque ligne, puis les messages de Ginko ; touchez une carte pour le texte complet et le lien vers ginko.voyage. Les lignes suivies, ou celles saisies dans les réglages.

### Scènes

Déclencheurs, une fois par changement (la première lecture d’un arrêt ou d’une ligne sert seulement de référence) :

- **Ginko : bus ou tram imminent** : un passage desservant un arrêt suivi arrive dans 2, 3, 5, 10, 15 ou 20 minutes.
- **Ginko : arrêt non desservi** : le prochain passage d’une ligne ne dessert plus un arrêt suivi (déviation, travaux).
- **Ginko : ligne perturbée** : une ligne suivie devient perturbée ou interrompue.
- **Ginko : retour à la normale** : elle circule de nouveau.
- **Ginko : nouvelle info trafic** : Ginko publie un message sur une ligne suivie (information, perturbation prévue ou en cours).

Chacun donne une phrase toute prête, `{{triggerEvent.data.summary}}`, et ses valeurs (ligne, destination, heure, titre, message…). Les actions **Ginko : prochains passages** et **Ginko : trafic d’une ligne** renvoient le même genre de valeurs, à mettre dans un message ou à tester dans une condition.

Exemples :

- Quand le T2 vers Hauts du Chazal arrive à Gare Viotte dans 5 minutes → allumer la lampe de l’entrée en vert.
- Quand la ligne L4 est interrompue → envoyer le résumé et le lien sur votre téléphone.
- Chaque jour de semaine à 7 h 30 → lire les prochains passages de votre arrêt et les faire annoncer par l’enceinte de la cuisine.

### Transport

Cloud uniquement : les données viennent d’internet. Seuls votre clé et les noms des arrêts et lignes suivis sont envoyés à Ginko.

## Dépannage

- **« Ginko refuse la clé d’API »** : une clé temporaire ne dure que 24 heures ; demandez une clé permanente à Ginko.
- **« Inconnu de Ginko »** : utilisez **Chercher un arrêt**, puis copiez le nom exact ou un identifiant ; pour une ligne, son numéro comme sur les véhicules (« L3 », « Plan B »).
- **Aucun passage la nuit** : le réseau dort ; l’arrêt est lu toutes les 10 minutes jusqu’à l’annonce du premier passage.
- **« Non desservi » partout** : une manifestation ou des travaux : les véhicules ne s’y arrêtent pas, voyez les infos trafic.
- **« L’API Ginko ne répond pas »** : l’intégration réessaie à chaque lecture ; les derniers passages restent sur les widgets.
- **Pour signaler un problème** : appuyez sur **Diagnostic**, puis copiez les lignes commençant par « Ginko diagnostic » de l’onglet Journaux (la clé n’y figure jamais) dans une issue GitHub ou une réponse sur le forum, avec les versions de Gladys et de l’intégration.
