#!/bin/bash
# Datenbank-Tabellen für Sequenzen und Zeitpläne korrigieren

cd /opt/loxberry/data/plugins/smartirrigation

echo "🔧 Korrigiere Datenbank-Struktur..."

# Backup erstellen
echo "📦 Erstelle Backup..."
cp data/irrigation.db data/irrigation.db.backup_$(date +%Y%m%d_%H%M%S)
echo "✅ Backup erstellt"

# Alte Tabellen löschen und neu erstellen
echo "🗑️ Lösche alte Tabellen..."
sqlite3 data/irrigation.db << 'EOF'

-- Alte Tabellen löschen
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS sequences;

-- Sequences Tabelle neu erstellen
CREATE TABLE sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    zones TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Schedules Tabelle neu erstellen
CREATE TABLE schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    sequence_id INTEGER NOT NULL,
    days TEXT NOT NULL,
    time TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
);

EOF

echo "✅ Tabellen neu erstellt"

# Schema anzeigen
echo ""
echo "📋 Neue Tabellenstruktur:"
echo "========================"
sqlite3 data/irrigation.db ".schema sequences"
echo ""
sqlite3 data/irrigation.db ".schema schedules"

echo ""
echo "✅ Datenbank korrigiert!"
echo "🔄 Server wird neu gestartet..."

# Server neu starten
sudo systemctl restart irrigation

sleep 2

echo ""
echo "📊 Server-Status:"
sudo systemctl status irrigation --no-pager -l

echo ""
echo "✅ Fertig! Teste jetzt:"
echo "   http://192.168.1.119:3000/sequences.html"
