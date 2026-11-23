# GymTracker

Einfacher Gym-Tracker fürs iPhone als Web-App (PWA). Handy liegt neben dem Gerät, große Zahlen, ein Tipp pro Satz.

**App:** https://armreu-web.github.io/GymTracker-AR/

## Aufs iPhone holen
1. Link in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Ab jetzt vom Home-Bildschirm starten. Funktioniert danach auch ohne Netz.

## Was das MVP kann
- Zwei feste Pläne im Wechsel (A Kreuzheben, B Beinpresse, aus der Strava-Historie vorbefüllt), weitere Pläne archivierbar
- Startscreen schlägt den Plan vor, der am längsten her ist
- Satz mit einem Tipp bestätigen, Vorgabe = Ziel-Wdh. + Gewicht vom letzten Mal
- Stepper für Gewicht (Schritt pro Übung, Standard 2,5 kg) und Wdh., gedrückt halten = schnell
- Zeit-Übungen (Seitstütz, Cardio) mit Stoppuhr
- Pause startet automatisch (Standard 1:00, pro Übung einstellbar), Ton am Ende, +30 s / −15 s / Weiter
- Kreuzheben-Obergrenze (Start 50 kg): App schlägt nie mehr vor und lässt nicht höher stellen
- Überspringen, Satz anhängen, Übung tauschen oder hinzufügen, Rückgängig für 5 s
- Beim letzten Satz einer Übung steht unten schon die nächste Übung mit Gewicht
- Bildschirm bleibt an (Wake Lock), Stand übersteht Sperren und Neuladen
- Sicherung als Datei

## Workout-Generator (ab 0.5)
- Startscreen schlägt ein Training vor: der Schwerpunkt, der am längsten her ist (Rücken, Beine & Hüfte, Stabilität & Rumpf, Ganzkörper; feste Pläne zählen als Ganzkörper)
- 7 Übungen à 3 Sätze plus 10 min Cardio, dann 2 Rumpfübungen und 3 Dehnübungen passend zum Schwerpunkt (je 2 × 30 s, gehen nur als Text nach Strava); Rücken- und Beintag haben je einen Drück-Slot
- Bis zu 3 neue Übungen pro Workout mit kurzer Anleitung, Startgewicht bewusst leicht
- Annehmen, einzelne Übung tauschen oder weglassen, neu würfeln oder anderen Schwerpunkt wählen
- Gewicht: wie letztes Mal, +1 Schritt wenn alle Ziel-Wdh. geschafft; Kreuzheben max. +2,5 kg und nie über die Obergrenze
- Nie Übungen mit hoher Last auf dem unteren Rücken (Kreuzheben ist die bewusste Ausnahme)
- Geräte lassen sich unter ⚙︎ ausschließen; dort lässt sich der Generator auch abschalten (dann wie bisher Plan-Rotation)
- Regeln und Übungskatalog: `generator.js`

## Noch nicht drin
Puls (siehe Spezifikation).

## Technik
Statisches HTML/CSS/JS ohne Build-Schritt (`generator.js` = Katalog + Regeln), Daten im `localStorage` des Geräts, Service Worker für Offline. Neue Version ausrollen: `VERSION` in `app.js` und `CACHE` in `sw.js` hochzählen.
