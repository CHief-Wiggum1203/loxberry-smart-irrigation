#!/bin/bash
# ============================================
# Smart Irrigation - Backup Script
# Erstellt vollständiges Backup aller Daten
# ============================================

BACKUP_DIR="/opt/loxberry/data/plugins/smartirrigation/backups"
PROJECT_DIR="/opt/loxberry/data/plugins/smartirrigation"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="irrigation_backup_${TIMESTAMP}"

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🌱 Smart Irrigation Backup Tool   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# Backup-Verzeichnis erstellen
echo -e "${YELLOW}📁 Erstelle Backup-Verzeichnis...${NC}"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# 1. Datenbank sichern
echo -e "${YELLOW}💾 Sichere Datenbank...${NC}"
cp "$PROJECT_DIR/data/irrigation.db" "$BACKUP_DIR/$BACKUP_NAME/"
echo -e "${GREEN}   ✅ irrigation.db gesichert${NC}"

# 2. Config sichern
echo -e "${YELLOW}⚙️  Sichere Konfiguration...${NC}"
if [ -f "$PROJECT_DIR/config/config.json" ]; then
    cp "$PROJECT_DIR/config/config.json" "$BACKUP_DIR/$BACKUP_NAME/"
    echo -e "${GREEN}   ✅ config.json gesichert${NC}"
fi

# 3. Server.js sichern
echo -e "${YELLOW}🔧 Sichere Server-Dateien...${NC}"
cp "$PROJECT_DIR/bin/server.js" "$BACKUP_DIR/$BACKUP_NAME/"
echo -e "${GREEN}   ✅ server.js gesichert${NC}"

# 4. Webfrontend sichern
echo -e "${YELLOW}🌐 Sichere Webfrontend...${NC}"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME/webfrontend/html"
cp "$PROJECT_DIR/webfrontend/html/"*.html "$BACKUP_DIR/$BACKUP_NAME/webfrontend/html/" 2>/dev/null
echo -e "${GREEN}   ✅ HTML-Dateien gesichert${NC}"

# 5. package.json sichern
echo -e "${YELLOW}📦 Sichere NPM-Konfiguration...${NC}"
if [ -f "$PROJECT_DIR/package.json" ]; then
    cp "$PROJECT_DIR/package.json" "$BACKUP_DIR/$BACKUP_NAME/"
    echo -e "${GREEN}   ✅ package.json gesichert${NC}"
fi

# 6. Systemd Service sichern
echo -e "${YELLOW}🔄 Sichere Service-Konfiguration...${NC}"
if [ -f "/etc/systemd/system/irrigation.service" ]; then
    sudo cp /etc/systemd/system/irrigation.service "$BACKUP_DIR/$BACKUP_NAME/"
    echo -e "${GREEN}   ✅ irrigation.service gesichert${NC}"
fi

# 7. Datenbank-Info exportieren
echo -e "${YELLOW}📊 Exportiere Datenbank-Info...${NC}"
sqlite3 "$PROJECT_DIR/data/irrigation.db" << 'EOF' > "$BACKUP_DIR/$BACKUP_NAME/database_info.txt"
.headers on
.mode column

SELECT '=== ZONES ===' as info;
SELECT * FROM zones;

SELECT '=== SEQUENCES ===' as info;
SELECT * FROM sequences;

SELECT '=== SCHEDULES ===' as info;
SELECT * FROM schedules;

SELECT '=== CONFIG ===' as info;
SELECT * FROM config;
EOF
echo -e "${GREEN}   ✅ Database-Info exportiert${NC}"

# 8. System-Info sammeln
echo -e "${YELLOW}ℹ️  Sammle System-Informationen...${NC}"
cat > "$BACKUP_DIR/$BACKUP_NAME/system_info.txt" << EOF
=== System Info ===
Backup erstellt: $(date)
Hostname: $(hostname)
LoxBerry Version: $(cat /etc/loxberry_version 2>/dev/null || echo "unbekannt")
Node Version: $(node --version)
NPM Version: $(npm --version)

=== Installierte NPM-Pakete ===
$(cd "$PROJECT_DIR" && npm list --depth=0 2>/dev/null)

=== Service Status ===
$(systemctl status irrigation --no-pager 2>/dev/null || echo "Service nicht aktiv")

=== Letzte 20 Log-Einträge ===
$(journalctl -u irrigation -n 20 --no-pager 2>/dev/null || echo "Keine Logs verfügbar")
EOF
echo -e "${GREEN}   ✅ System-Info gespeichert${NC}"

# 9. README erstellen
cat > "$BACKUP_DIR/$BACKUP_NAME/README.txt" << 'EOF'
============================================
Smart Irrigation System - Backup
============================================

Dieses Backup enthält:
- irrigation.db          (Datenbank mit allen Zonen, Sequenzen, Zeitplänen)
- config.json            (Loxone & Wetter-Konfiguration)
- server.js              (Backend-Server)
- webfrontend/html/      (Alle Web-Seiten)
- package.json           (NPM Dependencies)
- irrigation.service     (Systemd Service)
- database_info.txt      (Lesbare Datenbank-Übersicht)
- system_info.txt        (System-Informationen)

RESTORE (Wiederherstellen):
---------------------------
1. Server stoppen:
   sudo systemctl stop irrigation

2. Dateien zurückkopieren:
   cp irrigation.db /opt/loxberry/data/plugins/smartirrigation/data/
   cp config.json /opt/loxberry/data/plugins/smartirrigation/config/
   cp server.js /opt/loxberry/data/plugins/smartirrigation/bin/
   cp -r webfrontend/html/* /opt/loxberry/data/plugins/smartirrigation/webfrontend/html/

3. Berechtigungen setzen:
   sudo chown -R loxberry:loxberry /opt/loxberry/data/plugins/smartirrigation

4. Server starten:
   sudo systemctl start irrigation

5. Prüfen:
   sudo systemctl status irrigation
EOF

# 10. Komprimieren
echo -e "${YELLOW}📦 Komprimiere Backup...${NC}"
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"
echo -e "${GREEN}   ✅ Backup komprimiert${NC}"

# Größe anzeigen
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        ✅ BACKUP ERFOLGREICH!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📦 Backup-Datei:${NC} ${BACKUP_NAME}.tar.gz"
echo -e "${BLUE}📁 Speicherort:${NC}  $BACKUP_DIR"
echo -e "${BLUE}💾 Größe:${NC}        $BACKUP_SIZE"
echo ""

# Alte Backups auflisten
echo -e "${YELLOW}📋 Vorhandene Backups:${NC}"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
echo ""

# Anzahl Backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
echo -e "${BLUE}📊 Gesamt:${NC} $BACKUP_COUNT Backup(s) vorhanden"
echo ""

# Backup-Bereinigung anbieten
if [ $BACKUP_COUNT -gt 5 ]; then
    echo -e "${YELLOW}⚠️  Hinweis: Mehr als 5 Backups vorhanden.${NC}"
    echo -e "${YELLOW}   Überlege alte Backups zu löschen um Speicherplatz zu sparen.${NC}"
    echo ""
fi

echo -e "${GREEN}✅ Fertig!${NC}"
echo ""
echo -e "Backup kann wiederhergestellt werden mit:"
echo -e "  ${BLUE}cd $BACKUP_DIR${NC}"
echo -e "  ${BLUE}tar -xzf ${BACKUP_NAME}.tar.gz${NC}"
echo -e "  ${BLUE}cat ${BACKUP_NAME}/README.txt${NC}"
echo ""
