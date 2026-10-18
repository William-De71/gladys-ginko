// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, line states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface (appareil / Gerät / dispositivo, scène / Szene / escena) and of
// Ginko (arrêt, ligne, passage, info trafic). The names of stops and lines,
// the destinations and the traffic messages stay as Ginko writes them, in
// French: the network has no other language.
// -----------------------------------------------------------------------------

import { minutesLeft } from './departures.js';
import { formatTime } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  stopDeviceName: {
    en: 'Ginko {stop}',
    fr: 'Ginko {stop}',
    de: 'Ginko {stop}',
    es: 'Ginko {stop}',
  },
  lineDeviceName: {
    en: 'Ginko line {line}',
    fr: 'Ginko ligne {line}',
    de: 'Ginko Linie {line}',
    es: 'Ginko línea {line}',
  },
  featureNext: {
    en: 'Next passage',
    fr: 'Prochain passage',
    de: 'Nächste Abfahrt',
    es: 'Próximo paso',
  },
  featureWait: {
    en: 'Wait',
    fr: 'Attente',
    de: 'Wartezeit',
    es: 'Espera',
  },
  featureFollowing: {
    en: 'Wait for the following one',
    fr: 'Attente du suivant',
    de: 'Wartezeit der folgenden',
    es: 'Espera del siguiente',
  },
  featureNotServed: {
    en: 'Passages not serving the stop',
    fr: 'Passages sans desserte',
    de: 'Fahrten ohne Halt',
    es: 'Pasos sin parada',
  },
  featureStatus: {
    en: 'Traffic',
    fr: 'Trafic',
    de: 'Verkehrslage',
    es: 'Tráfico',
  },
  featureDisruptions: {
    en: 'Disruptions under way',
    fr: 'Perturbations en cours',
    de: 'Aktuelle Störungen',
    es: 'Incidencias en curso',
  },

  // passages
  noPassage: {
    en: 'No passage announced',
    fr: 'Aucun passage annoncé',
    de: 'Keine Abfahrt angekündigt',
    es: 'Ningún paso anunciado',
  },
  minutesValue: {
    en: '{n} min',
    fr: '{n} min',
    de: '{n} Min.',
    es: '{n} min',
  },
  approaching: {
    en: 'Approaching',
    fr: 'À l’approche',
    de: 'Fährt ein',
    es: 'Llegando',
  },
  inMinutes: {
    en: 'in {n} min',
    fr: 'dans {n} min',
    de: 'in {n} Min.',
    es: 'dentro de {n} min',
  },
  atTime: {
    en: 'at {time}',
    fr: 'à {time}',
    de: 'um {time}',
    es: 'a las {time}',
  },
  timetable: {
    en: 'timetable',
    fr: 'horaire théorique',
    de: 'Fahrplanzeit',
    es: 'horario teórico',
  },

  // line states
  state_unknown: {
    en: 'No information',
    fr: 'Pas d’information',
    de: 'Keine Information',
    es: 'Sin información',
  },
  state_normal: {
    en: 'Normal traffic',
    fr: 'Trafic normal',
    de: 'Normaler Betrieb',
    es: 'Tráfico normal',
  },
  state_information: {
    en: 'Information',
    fr: 'Information',
    de: 'Information',
    es: 'Información',
  },
  state_closed: {
    en: 'Not running now',
    fr: 'Ne circule pas en ce moment',
    de: 'Derzeit kein Betrieb',
    es: 'Sin servicio ahora',
  },
  state_planned: {
    en: 'Disruption planned',
    fr: 'Perturbation prévue',
    de: 'Störung geplant',
    es: 'Incidencia prevista',
  },
  state_disrupted: {
    en: 'Disruption under way',
    fr: 'Perturbation en cours',
    de: 'Störung im Gange',
    es: 'Incidencia en curso',
  },
  state_interrupted: {
    en: 'Traffic interrupted',
    fr: 'Circulation interrompue',
    de: 'Verkehr unterbrochen',
    es: 'Circulación interrumpida',
  },
  stateWithTitle: {
    en: '{state}: {title}',
    fr: '{state} : {title}',
    de: '{state}: {title}',
    es: '{state}: {title}',
  },

  // scene summaries
  summarySoon: {
    en: '{line} towards {destination} arrives at {stop} in {minutes} min ({time}).',
    fr: '{line} vers {destination} arrive à {stop} dans {minutes} min ({time}).',
    de: '{line} Richtung {destination} erreicht {stop} in {minutes} Min. ({time}).',
    es: '{line} hacia {destination} llega a {stop} dentro de {minutes} min ({time}).',
  },
  summarySoonTimetable: {
    en: '{line} towards {destination} is due at {stop} in {minutes} min ({time}, timetable: the vehicle is not located).',
    fr: '{line} vers {destination} est attendu à {stop} dans {minutes} min ({time}, horaire théorique : le véhicule n’est pas localisé).',
    de: '{line} Richtung {destination} wird an {stop} in {minutes} Min. erwartet ({time}, Fahrplanzeit: Fahrzeug nicht geortet).',
    es: '{line} hacia {destination} está previsto en {stop} dentro de {minutes} min ({time}, horario teórico: el vehículo no está localizado).',
  },
  summaryNotServed: {
    en: '{line} towards {destination} does not serve {stop}: {reason}.',
    fr: '{line} vers {destination} ne dessert pas {stop} : {reason}.',
    de: '{line} Richtung {destination} hält nicht an {stop}: {reason}.',
    es: '{line} hacia {destination} no para en {stop}: {reason}.',
  },
  summaryDisrupted: {
    en: 'Ginko line {line}: {state}.',
    fr: 'Ligne Ginko {line} : {state}.',
    de: 'Ginko-Linie {line}: {state}.',
    es: 'Línea Ginko {line}: {state}.',
  },
  summaryDisruptedTitle: {
    en: 'Ginko line {line}: {state} ({title}).',
    fr: 'Ligne Ginko {line} : {state} ({title}).',
    de: 'Ginko-Linie {line}: {state} ({title}).',
    es: 'Línea Ginko {line}: {state} ({title}).',
  },
  summaryRestored: {
    en: 'Ginko line {line} is back to normal ({state}).',
    fr: 'La ligne Ginko {line} est revenue à la normale ({state}).',
    de: 'Die Ginko-Linie {line} fährt wieder normal ({state}).',
    es: 'La línea Ginko {line} vuelve a la normalidad ({state}).',
  },
  summaryMessage: {
    en: 'Ginko line {line}, {kind}: {title}.',
    fr: 'Ligne Ginko {line}, {kind} : {title}.',
    de: 'Ginko-Linie {line}, {kind}: {title}.',
    es: 'Línea Ginko {line}, {kind}: {title}.',
  },
  summaryLineState: {
    en: 'Ginko line {line}: {state} ({title}).',
    fr: 'Ligne Ginko {line} : {state} ({title}).',
    de: 'Ginko-Linie {line}: {state} ({title}).',
    es: 'Línea Ginko {line}: {state} ({title}).',
  },
  summaryLineStateOnly: {
    en: 'Ginko line {line}: {state}.',
    fr: 'Ligne Ginko {line} : {state}.',
    de: 'Ginko-Linie {line}: {state}.',
    es: 'Línea Ginko {line}: {state}.',
  },
  outputNext: {
    en: 'Next passage at {stop}: {line} towards {destination} {when}.',
    fr: 'Prochain passage à {stop} : {line} vers {destination} {when}.',
    de: 'Nächste Abfahrt an {stop}: {line} Richtung {destination} {when}.',
    es: 'Próximo paso en {stop}: {line} hacia {destination} {when}.',
  },
  outputNextTimetable: {
    en: 'Next passage at {stop}: {line} towards {destination} {when} (timetable).',
    fr: 'Prochain passage à {stop} : {line} vers {destination} {when} (horaire théorique).',
    de: 'Nächste Abfahrt an {stop}: {line} Richtung {destination} {when} (Fahrplanzeit).',
    es: 'Próximo paso en {stop}: {line} hacia {destination} {when} (horario teórico).',
  },
  outputFollowing: {
    en: 'The following one {when}.',
    fr: 'Le suivant {when}.',
    de: 'Die folgende {when}.',
    es: 'El siguiente {when}.',
  },
  outputOnlyNotServed: {
    en: 'No passage serves {stop} at the moment: {reason}.',
    fr: 'Aucun passage ne dessert {stop} en ce moment : {reason}.',
    de: 'Derzeit hält keine Fahrt an {stop}: {reason}.',
    es: 'Ningún paso para en {stop} en este momento: {reason}.',
  },
  outputNone: {
    en: 'No passage announced at {stop}.',
    fr: 'Aucun passage annoncé à {stop}.',
    de: 'Keine Abfahrt an {stop} angekündigt.',
    es: 'Ningún paso anunciado en {stop}.',
  },

  // widgets
  updatedAt: {
    en: 'Ginko · updated at {time}',
    fr: 'Ginko · mis à jour à {time}',
    de: 'Ginko · aktualisiert um {time}',
    es: 'Ginko · actualizado a las {time}',
  },
  minutesShort: {
    en: 'min',
    fr: 'min',
    de: 'Min.',
    es: 'min',
  },
  badgeNotServed: {
    en: 'Not served',
    fr: 'Non desservi',
    de: 'Kein Halt',
    es: 'Sin parada',
  },
  timetableShort: {
    en: 'timetable',
    fr: 'théorique',
    de: 'Fahrplan',
    es: 'teórico',
  },
  moreInfo: {
    en: 'More on ginko.voyage',
    fr: 'Plus sur ginko.voyage',
    de: 'Mehr auf ginko.voyage',
    es: 'Más en ginko.voyage',
  },
  trafficTitle: {
    en: 'Ginko traffic',
    fr: 'Trafic Ginko',
    de: 'Ginko-Verkehrslage',
    es: 'Tráfico Ginko',
  },
  noMessage: {
    en: 'No traffic message for these lines.',
    fr: 'Aucune info trafic pour ces lignes.',
    de: 'Keine Verkehrsmeldung für diese Linien.',
    es: 'Ningún aviso de tráfico para estas líneas.',
  },
  widgetNoStop: {
    en: 'No stop is followed: add one on the Configuration screen of the integration, or type one in the widget settings.',
    fr: 'Aucun arrêt n’est suivi : ajoutez-en un dans l’écran Configuration de l’intégration, ou saisissez-en un dans les réglages du widget.',
    de: 'Keine Haltestelle wird verfolgt: Füge eine im Konfigurationsbildschirm der Integration hinzu oder gib eine in den Widget-Einstellungen ein.',
    es: 'No se sigue ninguna parada: añade una en la pantalla Configuración de la integración, o escribe una en los ajustes del widget.',
  },
  widgetNoLine: {
    en: 'No line is followed: add some on the Configuration screen of the integration, or type them in the widget settings.',
    fr: 'Aucune ligne n’est suivie : ajoutez-en dans l’écran Configuration de l’intégration, ou saisissez-les dans les réglages du widget.',
    de: 'Keine Linie wird verfolgt: Füge welche im Konfigurationsbildschirm der Integration hinzu oder gib sie in den Widget-Einstellungen ein.',
    es: 'No se sigue ninguna línea: añade alguna en la pantalla Configuración de la integración, o escríbelas en los ajustes del widget.',
  },
  widgetNotRead: {
    en: 'Not read yet: try again in a minute.',
    fr: 'Pas encore lu : réessayez dans une minute.',
    de: 'Noch nicht gelesen: Versuche es in einer Minute erneut.',
    es: 'Aún no leído: inténtalo de nuevo en un minuto.',
  },

  // configuration and status
  noApiKey: {
    en: 'Enter your Ginko API key on the Configuration screen.',
    fr: 'Saisissez votre clé d’API Ginko dans l’écran Configuration.',
    de: 'Gib deinen Ginko-API-Schlüssel im Konfigurationsbildschirm ein.',
    es: 'Introduce tu clave de API de Ginko en la pantalla Configuración.',
  },
  statusInvalidKey: {
    en: 'Ginko refuses the API key ({detail}). A temporary key only lasts 24 hours.',
    fr: 'Ginko refuse la clé d’API ({detail}). Une clé temporaire ne dure que 24 heures.',
    de: 'Ginko lehnt den API-Schlüssel ab ({detail}). Ein temporärer Schlüssel gilt nur 24 Stunden.',
    es: 'Ginko rechaza la clave de API ({detail}). Una clave temporal solo dura 24 horas.',
  },
  statusUnreachable: {
    en: 'The Ginko API does not answer ({detail}). Next try in {minutes} min.',
    fr: 'L’API Ginko ne répond pas ({detail}). Nouvel essai dans {minutes} min.',
    de: 'Die Ginko-API antwortet nicht ({detail}). Neuer Versuch in {minutes} Min.',
    es: 'La API de Ginko no responde ({detail}). Nuevo intento dentro de {minutes} min.',
  },
  statusConnected: {
    en: 'Connected to Ginko: {stops} stop(s), {lines} line(s), stops read every {interval} s.',
    fr: 'Connecté à Ginko : {stops} arrêt(s), {lines} ligne(s), arrêts lus toutes les {interval} s.',
    de: 'Mit Ginko verbunden: {stops} Haltestelle(n), {lines} Linie(n), Haltestellen alle {interval} s gelesen.',
    es: 'Conectado a Ginko: {stops} parada(s), {lines} línea(s), paradas leídas cada {interval} s.',
  },
  statusNotFound: {
    en: 'Unknown to Ginko: {names}.',
    fr: 'Inconnu de Ginko : {names}.',
    de: 'Bei Ginko unbekannt: {names}.',
    es: 'Desconocido para Ginko: {names}.',
  },
  statusNothing: {
    en: 'Connected to Ginko. Add a stop or a line on the Configuration screen.',
    fr: 'Connecté à Ginko. Ajoutez un arrêt ou une ligne dans l’écran Configuration.',
    de: 'Mit Ginko verbunden. Füge im Konfigurationsbildschirm eine Haltestelle oder Linie hinzu.',
    es: 'Conectado a Ginko. Añade una parada o una línea en la pantalla Configuración.',
  },
  testStop: {
    en: '{stop}: {count} passage(s), next {next}',
    fr: '{stop} : {count} passage(s), prochain {next}',
    de: '{stop}: {count} Abfahrt(en), nächste {next}',
    es: '{stop}: {count} paso(s), próximo {next}',
  },
  testStopError: {
    en: '{stop}: {error}',
    fr: '{stop} : {error}',
    de: '{stop}: {error}',
    es: '{stop}: {error}',
  },
  testLine: {
    en: 'Line {line}: {state}',
    fr: 'Ligne {line} : {state}',
    de: 'Linie {line}: {state}',
    es: 'Línea {line}: {state}',
  },
  testKeyOk: {
    en: 'API key accepted, {count} lines today',
    fr: 'Clé d’API acceptée, {count} lignes aujourd’hui',
    de: 'API-Schlüssel akzeptiert, {count} Linien heute',
    es: 'Clave de API aceptada, {count} líneas hoy',
  },
  testTrafficError: {
    en: 'Traffic: {error}',
    fr: 'Trafic : {error}',
    de: 'Verkehrslage: {error}',
    es: 'Tráfico: {error}',
  },
  unknownEntry: {
    en: 'unknown: {name}',
    fr: 'inconnu : {name}',
    de: 'unbekannt: {name}',
    es: 'desconocido: {name}',
  },
  errorUnreachable: {
    en: 'the Ginko API does not answer',
    fr: 'l’API Ginko ne répond pas',
    de: 'die Ginko-API antwortet nicht',
    es: 'la API de Ginko no responde',
  },
  errorInvalidKey: {
    en: 'API key refused',
    fr: 'clé d’API refusée',
    de: 'API-Schlüssel abgelehnt',
    es: 'clave de API rechazada',
  },
  errorNotFound: {
    en: 'unknown stop',
    fr: 'arrêt inconnu',
    de: 'unbekannte Haltestelle',
    es: 'parada desconocida',
  },
  searchTooShort: {
    en: 'Type at least two letters of the stop name.',
    fr: 'Saisissez au moins deux lettres du nom de l’arrêt.',
    de: 'Gib mindestens zwei Buchstaben des Haltestellennamens ein.',
    es: 'Escribe al menos dos letras del nombre de la parada.',
  },
  searchNone: {
    en: 'No Ginko stop matches "{query}".',
    fr: 'Aucun arrêt Ginko ne correspond à « {query} ».',
    de: 'Keine Ginko-Haltestelle passt zu „{query}“.',
    es: 'Ninguna parada de Ginko coincide con «{query}».',
  },
  searchFound: {
    en: 'Type the name for both sides of the street, or an id for one side only (its directions after the arrow):\n{list}',
    fr: 'Saisissez le nom pour les deux côtés de la rue, ou un identifiant pour un seul côté (ses directions après la flèche) :\n{list}',
    de: 'Gib den Namen für beide Straßenseiten ein oder eine Kennung für nur eine Seite (ihre Fahrtrichtungen nach dem Pfeil):\n{list}',
    es: 'Escribe el nombre para ambos lados de la calle, o un identificador para un solo lado (sus direcciones tras la flecha):\n{list}',
  },
  searchMore: {
    en: '… type more of the name to see the directions of the other stops.',
    fr: '… précisez le nom pour voir les directions des autres arrêts.',
    de: '… gib mehr vom Namen ein, um die Fahrtrichtungen der anderen Haltestellen zu sehen.',
    es: '… escribe más del nombre para ver las direcciones de las otras paradas.',
  },

  // stops added with the configuration buttons
  stopAdded: {
    en: 'Stop added: {name}. {count} stop(s) followed. Its device is offered in the Discover tab.',
    fr: 'Arrêt ajouté : {name}. {count} arrêt(s) suivi(s). Son appareil est proposé dans l’onglet Découvrir.',
    de: 'Haltestelle hinzugefügt: {name}. {count} Haltestelle(n) verfolgt. Ihr Gerät wird im Tab Entdecken angeboten.',
    es: 'Parada añadida: {name}. {count} parada(s) seguida(s). Su dispositivo se ofrece en la pestaña Descubrir.',
  },
  stopAlreadyFollowed: {
    en: '{name} is already followed.',
    fr: '{name} est déjà suivi.',
    de: '{name} wird bereits verfolgt.',
    es: '{name} ya se sigue.',
  },
  stopsFull: {
    en: 'Already {max} stops added: remove one first.',
    fr: 'Déjà {max} arrêts ajoutés : retirez-en un d’abord.',
    de: 'Bereits {max} Haltestellen hinzugefügt: entferne zuerst eine.',
    es: 'Ya hay {max} paradas añadidas: quita una primero.',
  },
  stopRemoved: {
    en: 'Stop removed: {name}. Delete its device in Gladys if you no longer want it.',
    fr: 'Arrêt retiré : {name}. Supprimez son appareil dans Gladys si vous n’en voulez plus.',
    de: 'Haltestelle entfernt: {name}. Lösche ihr Gerät in Gladys, wenn du es nicht mehr brauchst.',
    es: 'Parada quitada: {name}. Borra su dispositivo en Gladys si ya no lo quieres.',
  },
  stopRemoveUnknown: {
    en: 'No added stop matches "{query}": type its number given by "List the stops".',
    fr: 'Aucun arrêt ajouté ne correspond à « {query} » : saisissez son numéro donné par « Lister les arrêts ».',
    de: 'Keine hinzugefügte Haltestelle passt zu „{query}“: gib ihre Nummer aus „Haltestellen auflisten“ ein.',
    es: 'Ninguna parada añadida coincide con «{query}»: escribe su número dado por «Listar las paradas».',
  },
  stopRemoveAmbiguous: {
    en: 'Several added stops match "{query}": type the number given by "List the stops".',
    fr: 'Plusieurs arrêts ajoutés correspondent à « {query} » : saisissez le numéro donné par « Lister les arrêts ».',
    de: 'Mehrere hinzugefügte Haltestellen passen zu „{query}“: gib die Nummer aus „Haltestellen auflisten“ ein.',
    es: 'Varias paradas añadidas coinciden con «{query}»: escribe el número dado por «Listar las paradas».',
  },
  stopInForm: {
    en: '{name} is stop {slot} of the form: empty its field, then save the configuration.',
    fr: '{name} est l’arrêt {slot} du formulaire : videz son champ, puis enregistrez la configuration.',
    de: '{name} ist Haltestelle {slot} des Formulars: leere ihr Feld und speichere dann die Konfiguration.',
    es: '{name} es la parada {slot} del formulario: vacía su campo y guarda la configuración.',
  },
  stopsNone: {
    en: 'No stop followed yet: fill in a stop of the form or press "Add a stop".',
    fr: 'Aucun arrêt suivi pour l’instant : remplissez un arrêt du formulaire ou appuyez sur « Ajouter un arrêt ».',
    de: 'Noch keine Haltestelle verfolgt: fülle eine Haltestelle im Formular aus oder drücke „Haltestelle hinzufügen“.',
    es: 'Aún no se sigue ninguna parada: rellena una parada del formulario o pulsa «Añadir una parada».',
  },
  stopsList: {
    en: '{count} stop(s) followed:\n{list}',
    fr: '{count} arrêt(s) suivi(s) :\n{list}',
    de: '{count} Haltestelle(n) verfolgt:\n{list}',
    es: '{count} parada(s) seguida(s):\n{list}',
  },
  stopFromForm: {
    en: 'form, stop {slot}',
    fr: 'formulaire, arrêt {slot}',
    de: 'Formular, Haltestelle {slot}',
    es: 'formulario, parada {slot}',
  },
  stopUnknownMark: {
    en: 'unknown to Ginko',
    fr: 'inconnu de Ginko',
    de: 'Ginko unbekannt',
    es: 'desconocido para Ginko',
  },
  searchLines: {
    en: '{name} — lines: {list}',
    fr: '{name} — lignes : {list}',
    de: '{name} — Linien: {list}',
    es: '{name} — líneas: {list}',
  },
  refreshTooSoon: {
    en: 'Read {seconds} s ago: nothing new to fetch yet.',
    fr: 'Lu il y a {seconds} s : rien de neuf à récupérer pour l’instant.',
    de: 'Vor {seconds} s gelesen: noch nichts Neues abzurufen.',
    es: 'Leído hace {seconds} s: aún no hay nada nuevo.',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab ({count} line(s) starting with "Ginko diagnostic"). The API key is not in it.',
    fr: 'Diagnostic écrit dans l’onglet Journaux ({count} ligne(s) commençant par « Ginko diagnostic »). La clé d’API n’y figure pas.',
    de: 'Diagnose in den Tab Protokolle geschrieben ({count} Zeile(n), beginnend mit „Ginko diagnostic“). Der API-Schlüssel ist nicht enthalten.',
    es: 'Diagnóstico escrito en la pestaña Registros ({count} línea(s) que empiezan por «Ginko diagnostic»). La clave de API no aparece.',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('inMinutes', 'fr', { n: 3 }); // -> 'dans 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The label of a line state.
 * @param {string} state - A state name (traffic.js).
 * @param {string} language - The language.
 * @returns {string} The label.
 */
const lineStateText = (state, language) =>
  t(TEXTS[`state_${state}`] ? `state_${state}` : 'state_unknown', language);

/**
 * @description When a passage comes, in a sentence: "in 3 min", "at 23:32".
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The words.
 */
function passageWhen(passage, { language, now, timeZone }) {
  const minutes = minutesLeft(passage, now);
  if (minutes === null) {
    return passage.display;
  }
  if (passage.kind === 'time' || minutes >= 60) {
    return t('atTime', language, { time: formatTime(passage.at, timeZone) });
  }
  return minutes === 0
    ? t('approaching', language).toLowerCase()
    : t('inMinutes', language, { n: minutes });
}

/**
 * @description The short time of a passage, as on the screens of the stops:
 * "3 min", "23:32", "Approaching", or the word of a stop not served.
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The time.
 */
function passageShort(passage, { language, now, timeZone }) {
  if (!passage.served) {
    return passage.reason;
  }
  const minutes = minutesLeft(passage, now);
  if (minutes === null) {
    return passage.display;
  }
  if (passage.kind === 'time' || minutes >= 60) {
    return formatTime(passage.at, timeZone);
  }
  return minutes === 0 ? t('approaching', language) : t('minutesValue', language, { n: minutes });
}

/**
 * @description One line for a passage: "T1 → Chalezeule · 3 min".
 * @param {object|null} passage - The passage, null when none.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The text.
 */
function passageText(passage, options) {
  if (!passage) {
    return t('noPassage', options.language);
  }
  const notes = [
    passage.note,
    passage.served && !passage.reliable ? t('timetable', options.language) : '',
  ].filter(Boolean);
  const head = passage.destination ? `${passage.line} → ${passage.destination}` : passage.line;
  const time = passageShort(passage, options);
  return `${head} · ${time}${notes.length ? ` (${notes.join(', ')})` : ''}`;
}

export {
  LANGUAGES,
  TEXTS,
  isLanguage,
  t,
  all,
  lineStateText,
  passageWhen,
  passageShort,
  passageText,
};
