# Ginko

## Überblick

Diese Integration bringt **Ginko**, das Bus- und Tramnetz von Grand Besançon, in Gladys: die **nächsten Abfahrten in Echtzeit** an Haltestellen deiner Wahl (drei im Formular, bis zu 20 weitere per Schaltfläche), gefiltert nach Linie und Richtung, und die **Verkehrslage** von bis zu sechs Linien (normal, gestört, unterbrochen, mit den Meldungen von Ginko). Jede Haltestelle und jede Linie wird zu einem Gerät, das du auf einem Dashboard anzeigen und in Szenen verwenden kannst.

Die Daten stammen aus der **Open-Data-API von Ginko** (Keolis Besançon Mobilités, für Grand Besançon Métropole) unter der ODbL-Lizenz. Die Haltestellen werden standardmäßig jede Minute gelesen (alle 10 Minuten, solange eine Haltestelle nichts ankündigt, nachts), die Verkehrslage alle 5 Minuten. Linien und Haltestellen des Netzes behält die Integration und liest sie einmal täglich bzw. wöchentlich neu.

Es ist eine **Cloud**-Integration: Sie kontaktiert `api.ginko.voyage` mit deinem Schlüssel. Sonst verlässt nichts dein Netzwerk.

## Voraussetzungen

- Gladys Assistant 5.1.1 oder neuer.
- Ein **Ginko-API-Schlüssel**, kostenlos: Fordere ihn per E-Mail bei ginko.support-ssi@keolis.com an. Zum Ausprobieren gibt die Website [api.ginko.voyage](https://api.ginko.voyage/) einen temporären Schlüssel, der 24 Stunden gilt (Abschnitt „Clé temporaire“).

## Konfiguration

| Feld                     | Was eintragen                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| API-Schlüssel            | Der von Ginko gesendete Schlüssel oder der temporäre Schlüssel des Tages.                                                 |
| Haltestelle 1, 2, 3      | Der Name der Haltestelle („Chamars“, „Gare Viotte“) für beide Straßenseiten oder eine Kennung („t_cham1“) für eine Seite. |
| Linie                    | Nur diese Linie: „T1“, „L3“, „3“, „Plan B“, „51“. Leer: alle Linien der Haltestelle.                                      |
| Richtung                 | Nur Ziele mit diesen Wörtern: „Chalezeule“, „Temis \| Gare Viotte“. Leer: beide Richtungen.                               |
| Verfolgte Linien         | Die Linien, deren Verkehrslage du verfolgst, bis zu sechs: „T1, L3, 7“.                                                   |
| Abfrage der Haltestellen | Alle 30 Sekunden, jede Minute, alle 2 oder 5 Minuten.                                                                     |
| Sprache der Texte        | Gerätenamen, Zusammenfassungen und Ausgaben der Szenen. Haltestellennamen und Meldungen von Ginko bleiben französisch.    |

Die Schaltfläche **Haltestelle suchen** liefert die genauen Namen der Haltestellen mit einigen Wörtern und die Kennung jeder Straßenseite mit den dort bedienten Fahrtrichtungen („BQTSO01 → Prés de Vaux (12), Trey (D4)“): Kopiere die Kennung der Seite, an der du einsteigst. Ein Name, den Ginko anders schreibt, wird trotzdem gefunden („Pôle Temis“ ergibt „Temis“). **Verbindung testen** prüft den Schlüssel und liest sofort jede Haltestelle und Linie.

Mehr Haltestellen als die drei des Formulars (Zuhause, Arbeit…): **Haltestelle hinzufügen** nimmt dieselben drei Felder — Haltestelle, Linie, Richtung — und verfolgt bis zu 20 weitere Haltestellen. **Haltestellen auflisten** zeigt alle verfolgten Haltestellen nummeriert; **Haltestelle entfernen** nimmt diese Nummer (oder den Namen). Die hinzugefügten Haltestellen liegen in der Gladys-Konfiguration und sind damit in ihren Sicherungen enthalten.

## Verwendung

### Geräte

Erstelle im Tab **Entdecken** die gewünschten Geräte:

- **Ginko \<Haltestelle\>**: die nächste Abfahrt als Text („T2 → Hauts du Chazal · 3 Min.“), die Wartezeit der nächsten und der folgenden Abfahrt (Minuten) und die Zahl der angekündigten Fahrten, die nicht an der Haltestelle halten („Non desservi“, „Déviation“);
- **Ginko Linie \<Linie\>**: die Verkehrslage als Text („Störung im Gange: Manifestation“) und die Zahl der aktuellen Störungen.

Ist das Fahrzeug nicht geortet, liefert Ginko die Fahrplanzeit: Die Integration weist darauf hin („Fahrplanzeit“). Nachts, ohne Abfahrt, behalten die Wartezeiten ihren letzten Wert.

### Dashboard-Widgets

![Das Widget Ginko-Abfahrten an der Gare Viotte und das Widget Ginko-Verkehrslage für fünf Linien (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-ginko/main/docs/assets/widgets.de.png)

- **Ginko-Abfahrten**: die nächsten Abfahrten einer Haltestelle, kompakt: eine Zeile pro Linie und Ziel mit ihren nächsten Abfahrten hintereinander („1 · 9 · 27 Min.“, „23:32“, „Non desservi“), Fahrplanzeiten in Grau. Die Einstellung **Angezeigte Fahrten** legt die Zahl der Zeilen fest. Wähle eine verfolgte Haltestelle oder gib eine beliebige Haltestelle (und eine Linie) in den Widget-Einstellungen ein. Mit **Mehrere Haltestellen** zeigt ein einziges Widget mehrere Haltestellen-Geräte: Die Geräte derselben Haltestelle (zum Beispiel eines pro Linie) werden unter ihrem Namen zusammengefasst, ihre Fahrten nach Abfahrtszeit sortiert; bei verschiedenen Haltestellen beginnt jede Zeile mit ihrer Haltestelle. Die Einstellung **Angezeigte Fahrten** gilt dann pro Haltestelle, insgesamt höchstens 10 Zeilen.
- **Ginko-Verkehrslage**: der Zustand jeder Linie, dann die Meldungen von Ginko; tippe auf eine Karte für den vollständigen Text und den Link zu ginko.voyage. Die verfolgten Linien oder die in den Einstellungen eingegebenen.

### Szenen

Auslöser, einmal pro Änderung (die erste Abfrage einer Haltestelle oder Linie dient nur als Referenz):

- **Ginko: Bus oder Tram in Kürze**: Eine Fahrt, die an einer verfolgten Haltestelle hält, kommt in 2, 3, 5, 10, 15 oder 20 Minuten.
- **Ginko: Haltestelle ohne Halt**: Die nächste Fahrt einer Linie hält nicht mehr an einer verfolgten Haltestelle (Umleitung, Bauarbeiten).
- **Ginko: Linie gestört**: Eine verfolgte Linie wird gestört oder unterbrochen.
- **Ginko: Linie wieder normal**: Sie fährt wieder.
- **Ginko: neue Verkehrsmeldung**: Ginko veröffentlicht eine Meldung zu einer verfolgten Linie (Information, geplante oder aktuelle Störung).

Jeder liefert einen fertigen Satz, `{{triggerEvent.data.summary}}`, und seine Werte (Linie, Ziel, Uhrzeit, Titel, Meldung…). Die Aktionen **Ginko: nächste Abfahrten** und **Ginko: Verkehrslage einer Linie** liefern dieselbe Art von Werten für eine Nachricht oder eine Bedingung.

Beispiele:

- Wenn die T2 Richtung Hauts du Chazal in 5 Minuten an der Gare Viotte ankommt → die Lampe im Flur grün einschalten.
- Wenn die Linie L4 unterbrochen ist → Zusammenfassung und Link aufs Handy senden.
- Jeden Werktag um 7:30 → die nächsten Abfahrten deiner Haltestelle lesen und vom Lautsprecher in der Küche ansagen lassen.

### Transport

Nur Cloud: Die Daten kommen aus dem Internet. Nur dein Schlüssel und die Namen der verfolgten Haltestellen und Linien werden an Ginko gesendet.

## Fehlerbehebung

- **„Ginko lehnt den API-Schlüssel ab“**: Ein temporärer Schlüssel gilt nur 24 Stunden; fordere bei Ginko einen dauerhaften an.
- **„Bei Ginko unbekannt“**: Nutze **Haltestelle suchen** und kopiere den genauen Namen oder eine Kennung; bei einer Linie ihre Nummer wie auf den Fahrzeugen („L3“, „Plan B“).
- **Nachts keine Abfahrt**: Das Netz schläft; die Haltestelle wird alle 10 Minuten gelesen, bis die erste Abfahrt angekündigt ist.
- **Überall „Non desservi“**: eine Demonstration oder Bauarbeiten: Die Fahrzeuge halten dort nicht, siehe Verkehrsmeldungen.
- **„Die Ginko-API antwortet nicht“**: Die Integration versucht es bei jeder Abfrage erneut; die letzten Abfahrten bleiben auf den Widgets.
- **Ein Problem melden**: Drücke **Diagnose** und kopiere die Zeilen, die mit „Ginko diagnostic“ beginnen, aus dem Tab Protokolle (der Schlüssel steht nie darin) in ein Issue auf GitHub oder eine Antwort im Forum, mit den Versionen von Gladys und der Integration.
