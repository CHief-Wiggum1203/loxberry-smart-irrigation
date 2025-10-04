# 🌱 LoxBerry Smart Irrigation System

Moderne Web-basierte Bewässerungssteuerung für Loxone mit MQTT-Integration, Wettersteuerung und automatischen Zeitplänen.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![LoxBerry](https://img.shields.io/badge/LoxBerry-2.0%2B-green)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-brightgreen)

## Features

- 🎛️ **12+ Bewässerungszonen** individuell steuerbar
- 📱 **Moderne Web-App** mit iOS-inspiriertem Design (PWA-fähig)
- 🔌 **Loxone Integration** über REST API
- 🌦️ **Wetterbasierte Steuerung** mit Regenvorhersage
- 📊 **MQTT Support** für Feuchtigkeitssensoren
- ⏰ **Zeitplan-System** für automatische Bewässerung
- ❄️ **Wintersperre** zum Frostschutz
- 📈 **Live Logs** und Statistiken
- 🔒 **Multi-User** mit Rechteverwaltung

## Voraussetzungen

- LoxBerry 2.0+ (getestet auf 3.0.1.3)
- Loxone Miniserver (Gen1/Gen2/Go)
- Node.js 14+ (wird mit LoxBerry installiert)
- 500MB freier Speicherplatz

## Installation

### 1. Repository herunterladen
```bash
cd /opt/loxberry/data/plugins/
git clone https://github.com/Chief-Wiggum1203/loxberry-smart-irrigation.git smartirrigation
cd smartirrigation
