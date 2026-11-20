# Squad Night

Web-App für Discord-Gaming-Abende: **Soundboard**, **Glücksrad**, **Voice Changer** und **Statistiken**.
Läuft komplett im Browser, alle Daten bleiben lokal (localStorage + IndexedDB).

## Starten

Voraussetzung: Node.js 18 oder neuer.

```bash
npm install
npm run dev       # Entwicklungsserver auf http://localhost:5173
npm run build     # Produktions-Build nach dist/
npm run preview   # Build lokal ansehen
```

Empfohlener Browser: **Chrome oder Edge**. Nur dort lässt sich das Ausgabegerät wählen (nötig für die Discord-Anbindung).

## Funktionen (Phase 1)

| Tab | Inhalt |
| --- | --- |
| Soundboard | Sounds per Drag & Drop (MP3/WAV/OGG/M4A, bis 20 MB), Tastenkürzel, Lautstärke je Sound, Kategorien, Suche, Backup. Link zu Myinstants zum Finden von Sounds. |
| Glücksrad | Text-, Listen- oder Zahlenmodus (2–100 Felder), feste bunte Palette, faire Auslosung über `crypto.getRandomValues`, Vorlagen, Verlauf, Teilen-Link. |
| Voice Changer | Echtzeit-Effekte (Höher, Tiefer, Roboter, Funkgerät, Echo, Telefon, Megafon, Unterwasser), eigene Presets, Pegel, Latenz-Schätzung, „Effekt halten“ mit `^`, Einrichtungs-Assistent. |
| Statistiken | Spieler und Matches manuell erfassen, frei definierbare Werte, Rangliste, Siegquote-Trend, Durchschnitts-Diagramm, CSV-Export (Excel-kompatibel). |
| Einstellungen | Hell/Dunkel, Akzentfarbe, Tastenkürzel, Audio-Routing, Komplett-Backup. |

## Stimme und Sounds in Discord

Der Browser kann nicht direkt in Discord senden. Der Weg führt über ein **virtuelles Audiokabel**:

1. [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) installieren.
2. In der App als **Ausgang** „CABLE Input“ wählen, als **Mithören** die eigenen Kopfhörer.
3. In Discord als **Eingabegerät** „CABLE Output“ wählen, Rauschunterdrückung und Echounterdrückung aus.
4. Im Tab Voice Changer das Mikrofon einschalten (Preset „Normal“ = unveränderte Stimme).

Stimme und Soundboard laufen über denselben Ausgang, deshalb hören die Freunde beides.

## Bekannte Grenzen

- **Tastenkürzel** wirken nur, solange das Browserfenster den Fokus hat. Globale Hotkeys während des Spiels sind im Browser nicht möglich.
- **Tonhöhen-Effekte** nutzen ein einfaches, latenzarmes Delay-Line-Verfahren. Bei starker Verschiebung flattert der Klang hörbar. Spezialisierte Programme wie Voicemod klingen besser.
- **Latenz-Anzeige** ist eine Schätzung (Ausgabe + Effekt). Die Eingangs-Latenz des Mikrofons kann der Browser nicht messen.
- **Sounds von Myinstants** sind oft Ausschnitte aus Filmen und Serien. Die Rechte liegen bei den jeweiligen Inhabern.

## Roadmap

- **Phase 2** (braucht ein Backend, API-Keys nur serverseitig): Steam Web API (Profil, Spielzeit, Erfolge), Riot API (LoL-Match-Verlauf).
- **Phase 3**: CS2 Game State Integration für Live-Daten (über ein lokales Hilfsprogramm). Xbox höchstens inoffiziell über Drittanbieter, ohne Live-Match-Daten.

Die Adapter-Schnittstelle dafür liegt in `src/features/stats/adapters/`.

## Struktur

```
src/
  lib/            Audio-Engine, Speicher, Einstellungen, Hilfsfunktionen
  components/     UI-Bausteine (Button, Toggle, Slider, Modal …)
  features/
    soundboard/   Soundboard + IndexedDB-Speicher
    wheel/        Glücksrad (Canvas-Rendering, Animation, Konfetti)
    voice/        Voice Changer (Effekte, Engine)
    stats/        Statistiken + Adapter-Schnittstelle
    settings/     Einstellungen
public/
  pitch-worklet.js  AudioWorklet für Tonhöhen-Effekte
```
