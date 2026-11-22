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
- Bildschirm bleibt an (Wake Lock), Stand übersteht Sperren und Neuladen
- Sicherung als Datei

## Noch nicht drin
Strava-Upload, Puls, Workout-Generator (siehe Spezifikation).

## Technik
Statisches HTML/CSS/JS ohne Build-Schritt, Daten im `localStorage` des Geräts, Service Worker für Offline. Neue Version ausrollen: `VERSION` in `app.js` und `CACHE` in `sw.js` hochzählen.
