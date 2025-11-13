#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/irrigation.db');
const dataDir = path.dirname(dbPath);

// Erstelle data Verzeichnis falls nicht vorhanden
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Data-Verzeichnis erstellt');
}

const db = new sqlite3.Database(dbPath);

console.log('📦 Initialisiere Datenbank...');

db.serialize(() => {
    // Zones Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        valve TEXT NOT NULL,
        loxone_input TEXT,
        enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 5,
        default_duration INTEGER DEFAULT 10,
        moisture INTEGER,
        moisture_threshold INTEGER DEFAULT 30,
        moisture_optimal INTEGER DEFAULT 60,
        auto_water_enabled INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0,
        last_watered DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Sequences Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        zones TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // History Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id INTEGER,
        zone_name TEXT,
        action TEXT,
        trigger_type TEXT,
        trigger_source TEXT,
        duration INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Schedules Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id INTEGER,
        days_of_week TEXT,
        time TEXT,
        duration INTEGER,
        enabled INTEGER DEFAULT 1,
        smart_mode INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ Alle Tabellen erstellt/geprüft');
});

db.close(() => {
    console.log('✅ Datenbank-Initialisierung abgeschlossen');
});
