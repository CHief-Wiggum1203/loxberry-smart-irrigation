# 🌱 LoxBerry Smart Irrigation System

Moderne Web-basierte Bewässerungssteuerung für Loxone mit MQTT-Integration, Wettersteuerung und automatischen Zeitplänen.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![LoxBerry](https://img.shields.io/badge/LoxBerry-2.0%2B-green)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-brightgreen)

## Features

- 🎛️ **12+ Bewässerungszonen** individuell steuerbar
- 📱 **Moderne Web-App** mit iOS-inspiriertem Design (PWA-fähig)
- 🔌 **Loxone Integration** über REST API
- 🌦️ **Wetterbasierte Steuerung** mit Regenvorhersage (Open-Meteo/OpenWeatherMap)
- 📊 **MQTT Support** für Feuchtigkeitssensoren
- ⏰ **Zeitplan-System** für automatische Bewässerung
- ❄️ **Wintersperre** zum Frostschutz
- 📈 **Live Logs** und Statistiken
- 🔒 **Sichere Konfiguration** mit Beispiel-Templates

## Voraussetzungen

- LoxBerry 2.0+ (getestet auf 3.0.1.3)
- Loxone Miniserver (Gen1/Gen2/Go)
- Node.js 14+ (wird mit LoxBerry installiert)
- 500MB freier Speicherplatz
- Netzwerkzugriff zum Miniserver

## Schnell-Installation

### 1. Repository klonen

```bash
cd /opt/loxberry/data/plugins/
git clone https://github.com/CHief-Wiggum1203/loxberry-smart-irrigation.git smartirrigation
cd smartirrigation
```

### 2. Dependencies installieren

```bash
npm install
```

### 3. Konfiguration erstellen

```bash
cp config/config.example.json config/config.json
nano config/config.json
```

Passe an:
- Loxone Miniserver IP-Adresse
- Loxone Username und Passwort
- Optional: Wetter-API Einstellungen
- Optional: MQTT-Broker Details

### 4. Datenbank initialisieren

Die Datenbank wird beim ersten Start automatisch erstellt. Alternativ manuell:

```bash
node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('data/irrigation.db');
db.serialize(() => {
  db.run(\`CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY,
    name TEXT,
    loxone_output TEXT,
    loxone_input TEXT,
    is_active INTEGER DEFAULT 0,
    last_watered DATETIME,
    moisture INTEGER DEFAULT 0,
    default_duration INTEGER DEFAULT 10,
    moisture_threshold INTEGER DEFAULT 30,
    moisture_optimal INTEGER DEFAULT 60,
    auto_water_enabled INTEGER DEFAULT 0
  )\`);
});
db.close();
"
```

### 5. Service einrichten (Autostart)

```bash
sudo nano /etc/systemd/system/irrigation.service
```

Inhalt:

```ini
[Unit]
Description=Smart Irrigation Server
After=network.target

[Service]
Type=simple
User=loxberry
WorkingDirectory=/opt/loxberry/data/plugins/smartirrigation
ExecStart=/usr/local/bin/node /opt/loxberry/data/plugins/smartirrigation/bin/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Service aktivieren:

```bash
sudo systemctl enable irrigation
sudo systemctl start irrigation
sudo systemctl status irrigation
```

### 6. Setup-Wizard ausführen

Öffne im Browser:

```
http://[LOXBERRY-IP]:3000/setup.html
```

Konfiguriere:
- Loxone-Verbindung testen
- Zonen benennen und Ventile zuordnen
- Standard-Bewässerungsdauer pro Zone festlegen
- Optional: Wetter-API aktivieren
- Optional: MQTT-Broker konfigurieren

## Loxone Konfiguration

### Virtueller Benutzer anlegen

1. Loxone Config öffnen
2. **Benutzer → Neuer Benutzer**
3. Name: `irrigation_app`
4. Rechte: **Visualisierung, Web, Werte ändern**
5. Passwort festlegen
6. **In Miniserver laden (F6)**

### Virtuelle Ausgänge (Ventile)

Erstelle in Loxone Config virtuelle Ausgänge:

- `IrrigationValve1` bis `IrrigationValve12`
- Typ: **Virtueller Ausgang**
- Verwendung: Bewässerungsventil Zone X

### Virtuelle Eingänge (Sensoren, optional)

Für Bodenfeuchtigkeit-Sensoren:

- `IrrigationMoisture1` bis `IrrigationMoisture12`
- Typ: **Virtueller Eingang (Analog)**
- Einheit: **%**
- Bereich: **0-100**

## Verwendung

Nach der Installation ist das System erreichbar:

```
http://[LOXBERRY-IP]:3000
```

### Hauptseiten

- **Startseite:** `/` - Übersicht aller Zonen
- **Setup:** `/setup.html` - Konfiguration & Zonen-Verwaltung
- **MQTT:** `/mqtt-config.html` - MQTT-Broker Einstellungen
- **Zeitpläne:** `/schedules.html` - Automatische Bewässerung
- **Logs:** `/logs.html` - Live System-Logs
- **Hilfe:** `/help.html` - API-Dokumentation

### Hauptfunktionen

**Zone manuell steuern:**
- Toggle-Switch in der Web-App nutzen
- Standard-Dauer wird aus DB geladen
- Oder eigene Dauer eingeben

**Zeitpläne erstellen:**
- Automatische Bewässerung zu bestimmten Zeiten
- Wochentage auswählen
- Mehrere Zeitfenster möglich

**Wintersperre aktivieren:**
- In Setup → Wintersperre
- Blockiert alle Bewässerungen
- Schutz vor Frostschäden

## API Dokumentation

### REST Endpoints

**Zonen steuern:**

```bash
# Zone starten (mit Standard-Dauer)
curl -X POST http://[LOXBERRY-IP]:3000/api/zones/1/start

# Zone mit eigener Dauer starten
curl -X POST http://[LOXBERRY-IP]:3000/api/zones/1/start \
  -H "Content-Type: application/json" \
  -d '{"duration": 15}'

# Zone stoppen
curl -X POST http://[LOXBERRY-IP]:3000/api/zones/1/stop

# Alle Zonen abrufen
curl http://[LOXBERRY-IP]:3000/api/zones

# Zone-Details
curl http://[LOXBERRY-IP]:3000/api/zones/1
```

**Wetter:**

```bash
# Aktuelle Wetterdaten
curl http://[LOXBERRY-IP]:3000/api/weather

# Wetter manuell aktualisieren
curl -X POST http://[LOXBERRY-IP]:3000/api/weather/update
```

**Wintersperre:**

```bash
# Status abrufen
curl http://[LOXBERRY-IP]:3000/api/winter-mode

# Aktivieren
curl -X POST http://[LOXBERRY-IP]:3000/api/winter-mode/enable

# Deaktivieren
curl -X POST http://[LOXBERRY-IP]:3000/api/winter-mode/disable
```

## MQTT Integration

### Konfiguration

Konfiguriere MQTT-Broker unter:

```
http://[LOXBERRY-IP]:3000/mqtt-config.html
```

### Topics

**Status-Updates (automatisch gesendet):**

```
irrigation/zone/1/state         # on/off
irrigation/zone/1/moisture      # 0-100
irrigation/system/wintermode    # true/false
```

**Sensor-Eingänge (empfangen):**

```
irrigation/sensor/moisture1     # 0-100
irrigation/sensor/moisture2     # 0-100
```

### ESP32 Sensor-Beispiel

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "DEIN_WIFI";
const char* password = "DEIN_PASSWORT";
const char* mqtt_server = "LOXBERRY-IP";

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  client.setServer(mqtt_server, 1883);
}

void loop() {
  int moisture = analogRead(34); // 0-4095
  int percent = map(moisture, 0, 4095, 0, 100);
  
  char msg[10];
  sprintf(msg, "%d", percent);
  client.publish("irrigation/sensor/moisture1", msg);
  
  delay(60000); // Jede Minute
}
```

## Troubleshooting

### Server startet nicht

```bash
# Status prüfen
sudo systemctl status irrigation

# Logs ansehen
sudo journalctl -u irrigation -f

# Manuell starten (zum Debuggen)
cd /opt/loxberry/data/plugins/smartirrigation
node bin/server.js
```

### Loxone-Verbindung fehlgeschlagen

1. Benutzer in Loxone Config prüfen
2. Rechte kontrollieren (Visualisierung, Web, Werte ändern)
3. **In Miniserver laden (F6)**
4. 30 Sekunden warten
5. Credentials im Setup erneut eingeben
6. Verbindung testen

### MQTT funktioniert nicht

1. Broker-Adresse prüfen (Format: `mqtt://IP:1883`)
2. Username/Passwort kontrollieren
3. Firewall-Regeln prüfen
4. Broker-Logs ansehen

### Zonen werden nicht aktualisiert

1. Browser-Cache leeren (Strg+F5)
2. Service neu starten: `sudo systemctl restart irrigation`
3. Loxone-Ausgänge in Config prüfen

## Backup & Updates

### Backup erstellen

```bash
cd /opt/loxberry/data/plugins/smartirrigation
./backup.sh
```

Backups werden gespeichert in: `backups/irrigation_backup_DATUM.tar.gz`

### Update durchführen

```bash
cd /opt/loxberry/data/plugins/smartirrigation
git pull
npm install
sudo systemctl restart irrigation
```

## Sicherheitshinweise

- Ändere das Standard-Admin-Passwort
- Verwende sichere Loxone-Credentials
- Aktiviere HTTPS für Remote-Zugriff
- Regelmäßige Backups empfohlen
- VPN für externen Zugriff empfohlen

## Entwicklung & Contribution

### Repository-Struktur

```
smartirrigation/
├── bin/
│   └── server.js           # Haupt-Server
├── config/
│   ├── config.json         # Deine Konfiguration (nicht in Git)
│   └── config.example.json # Beispiel-Konfiguration
├── data/
│   └── irrigation.db       # SQLite Datenbank (nicht in Git)
├── webfrontend/html/
│   ├── index.html          # Haupt-App
│   ├── setup.html          # Setup-Wizard
│   ├── logs.html           # Log-Viewer
│   └── help.html           # Dokumentation
├── backups/                # Backup-Verzeichnis
├── package.json
└── README.md
```

### Contribution

1. Repository forken
2. Feature-Branch erstellen
3. Änderungen testen
4. Pull Request erstellen

## Support

- **GitHub Issues:** https://github.com/CHief-Wiggum1203/loxberry-smart-irrigation/issues
- **Dokumentation:** Siehe `/help.html` in der Web-App
- **LoxForum:** [Coming soon]

## Changelog

### v1.0.0 (2025-10-04)

- Initial Release
- 12+ Zonen Support
- Loxone Integration
- MQTT Support
- Wetterbasierte Steuerung
- Zeitpläne
- Wintersperre
- Live Logs
- Web-Interface

### v1.1.0 (2025-10-05)

- Tägliche automatische Bewässerungsprüfung
- Konfigurierbare Prüfzeit (Standard: 04:00 Uhr)
- Berücksichtigt Wetter, Wintersperre und Bodenfeuchtigkeit
- 2 Minuten Pause zwischen Zonen


### v1.5.0 (05.10.2025)
- ✅ History-Tracking mit vollständigem Logging aller Aktionen
- ✅ MQTT Detail-Topics mit Kontext-Informationen
- ✅ Tägliche Prüfung: Modus-Auswahl (Einzelzonen/Sequenz)
- ✅ Zonenspezifische Einstellungen und Prioritäten
- ✅ Automatische Bewässerung basierend auf Bodenfeuchtigkeit
- ✅ Verbesserte MQTT-Konfigurationsseite
- 🔧 Bugfixes und Performance-Verbesserungen


-----

## Version 1.5.0 - Neue Features (05.10.2025)

### History-Tracking System
- Vollständiges Logging aller Bewässerungsaktionen in SQLite-Datenbank
- Trigger-Typen: `manual`, `mqtt`, `daily_check`, `sequence`, `auto_water`, `schedule`
- Quellen-Tracking: Unterscheidung zwischen web_ui, mqtt_command, automatic, etc.
- API-Endpoint: `GET /api/history?limit=100&zone_id=1`

### Erweiterte MQTT-Integration
- Status-Topic: `irrigation/zone/{id}/status` (on/off mit retained flag)
- Detail-Topic: `irrigation/zone/{id}/detail` (JSON mit Trigger, Dauer, Quelle, Zeitstempel)
- Daily-Check-Results via MQTT für externe Monitoring-Systeme

### Tägliche Bewässerungsprüfung - Erweitert
- **Modus-Auswahl**: Einzelzonen (feuchtigkeitsbasiert) oder Sequenz-Ausführung
- Wetterbasierte Steuerung mit konfigurierbarem Regenschwellwert
- Wintersperre-Integration
- Konfigurierbar über Setup-UI (Zeit, Modus, Sequenz)

### Zonenspezifische Einstellungen
- Standard-Bewässerungsdauer pro Zone
- Prioritäts-System für Wassermangel-Situationen
- Feuchtigkeitsschwellwerte (Minimum & Optimal)
- Automatische Bewässerung basierend auf Sensordaten

-----

## Lizenz

MIT License

Copyright (c) 2025 LB Community

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Credits

Entwickelt von der LB Community

**Verwendete Bibliotheken:**
- Express.js (MIT)
- SQLite3 (Public Domain)
- node-cron (MIT)
- ws (MIT)
- axios (MIT)

**Special Thanks:**
- LoxBerry Team
- Loxone Community
- Open-Meteo API
- Alle Beta-Tester

---

**Happy Gardening! 🌱💧**
