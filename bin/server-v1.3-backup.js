#!/usr/bin/env node
// ============================================
// LoxBerry Smart Irrigation Server
// Version 1.3 - mit Ort + 48h Forecast + Backup
// ============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cron = require('node-cron');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const webfrontendPath = path.join(__dirname, '..', 'webfrontend', 'html');
app.use(express.static(webfrontendPath));

const dbPath = path.join(__dirname, '..', 'data', 'irrigation.db');
const configPath = path.join(__dirname, '..', 'config', 'config.json');

let db;
let config = {};
const activeTimers = new Map();
const activeCrons = new Map();
let weatherCache = null;
let weatherCacheTime = null;

function initDatabase() {
    console.log('📦 Initialisiere Datenbank...');
    
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Fehler beim Öffnen der Datenbank:', err);
            process.exit(1);
        }
        console.log('✅ Datenbank verbunden');
    });

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            position INTEGER,
            loxone_output TEXT,
            loxone_input TEXT,
            moisture INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 0,
            last_watered DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sequences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            zones TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            sequence_id INTEGER NOT NULL,
            days TEXT NOT NULL,
            time TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS weather_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            humidity INTEGER,
            rain_probability INTEGER,
            wind_speed REAL,
            description TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.get('SELECT COUNT(*) as count FROM zones', [], (err, row) => {
            if (err) {
                console.error('Fehler beim Zählen der Zonen:', err);
                return;
            }

            if (row.count === 0) {
                console.log('📝 Erstelle Standard-Zonen...');
                const stmt = db.prepare('INSERT INTO zones (name, loxone_output, loxone_input) VALUES (?, ?, ?)');
                
                for (let i = 1; i <= 12; i++) {
                    stmt.run(`Zone ${i}`, `IrrigationValve${i}`, `IrrigationMoisture${i}`);
                }
                
                stmt.finalize(() => {
                    console.log('✅ 12 Standard-Zonen erstellt');
                });
            }
        });
    });

    loadConfig();
}

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
            console.log('✅ Konfiguration geladen');
        } else {
            config = {
                initialized: false,
                loxone: { host: '', username: '', password: '' },
                weather: {
                    provider: 'open-meteo',
                    apiKey: '',
                    lat: 48.2082,
                    lon: 16.3738,
                    enabled: true,
                    rainThreshold: 70
                }
            };
            saveConfig();
        }
    } catch (error) {
        console.error('Fehler beim Laden der Config:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Konfiguration gespeichert');
    } catch (error) {
        console.error('Fehler beim Speichern der Config:', error);
    }
}

async function fetchWeatherData() {
    if (!config.weather || !config.weather.enabled) {
        console.log('⚠️ Wetter-API deaktiviert');
        return null;
    }

    const now = Date.now();
    if (weatherCache && weatherCacheTime && (now - weatherCacheTime < 15 * 60 * 1000)) {
        console.log('📦 Wetterdaten aus Cache');
        return weatherCache;
    }

    const provider = config.weather.provider || 'open-meteo';
    
    try {
        let weatherData;
        
        if (provider === 'open-meteo') {
            weatherData = await fetchOpenMeteoWeather();
        } else if (provider === 'openweathermap') {
            weatherData = await fetchOpenWeatherMapWeather();
        } else {
            console.error('❌ Unbekannter Wetter-Provider:', provider);
            return null;
        }
        
        if (!weatherData) return null;
        
        db.run(
            'INSERT INTO weather_log (temperature, humidity, rain_probability, wind_speed, description) VALUES (?, ?, ?, ?, ?)',
            [weatherData.current.temperature, weatherData.current.humidity, weatherData.forecast.rainProbability, weatherData.current.windSpeed, weatherData.current.description]
        );

        weatherCache = weatherData;
        weatherCacheTime = now;

        console.log(`🌤️ Wetter aktualisiert (${provider}): ${weatherData.current.temperature}°C, Regen: ${weatherData.forecast.rainProbability}%`);
        
        return weatherData;

    } catch (error) {
        console.error('❌ Fehler beim Abrufen der Wetterdaten:', error.message);
        return null;
    }
}

async function fetchOpenMeteoWeather() {
    const { lat, lon } = config.weather;
    
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability,weather_code&timezone=auto&forecast_days=3`;
    
    try {
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;
        
        let rainToday = 0;
        let rainTomorrow = 0;
        let rainDay3 = 0;
        
        if (data.hourly && data.hourly.precipitation_probability) {
            const probs = data.hourly.precipitation_probability;
            
            const today = probs.slice(0, 24).filter(p => p !== null);
            rainToday = today.length > 0 ? Math.max(...today) : 0;
            
            const tomorrow = probs.slice(24, 48).filter(p => p !== null);
            rainTomorrow = tomorrow.length > 0 ? Math.max(...tomorrow) : 0;
            
            const day3 = probs.slice(48, 72).filter(p => p !== null);
            rainDay3 = day3.length > 0 ? Math.max(...day3) : 0;
        }
        
        const weatherCode = data.current.weather_code;
        const weatherInfo = getWeatherInfoFromCode(weatherCode);
        
        let locationName = 'Standort';
        try {
            const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=de`;
            const geoResponse = await axios.get(geoUrl, { 
                timeout: 5000,
                headers: { 'User-Agent': 'LoxBerry-Irrigation/1.3' }
            });
            
            if (geoResponse.data && geoResponse.data.address) {
                const addr = geoResponse.data.address;
                locationName = addr.city || addr.town || addr.village || addr.suburb || 'Standort';
            }
        } catch (geoError) {
            console.log('⚠️ Reverse Geocoding fehlgeschlagen, verwende Standard');
        }
        
        return {
            current: {
                temperature: Math.round(data.current.temperature_2m),
                humidity: data.current.relative_humidity_2m,
                description: weatherInfo.description,
                icon: weatherInfo.icon,
                windSpeed: Math.round(data.current.wind_speed_10m)
            },
            forecast: {
                rainProbability: Math.round(rainToday),
                willRain: rainToday >= 50,
                daily: [
                    Math.round(rainToday),
                    Math.round(rainTomorrow),
                    Math.round(rainDay3)
                ]
            },
            location: locationName,
            timestamp: Date.now(),
            provider: 'open-meteo'
        };
        
    } catch (error) {
        console.error('❌ Open-Meteo API Fehler:', error.message);
        throw error;
    }
}

async function fetchOpenWeatherMapWeather() {
    const { apiKey, lat, lon } = config.weather;
    
    if (!apiKey) {
        console.error('❌ OpenWeatherMap API Key fehlt');
        return null;
    }
    
    try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=de`;
        const currentResponse = await axios.get(currentUrl, { timeout: 10000 });
        
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=de&cnt=24`;
        const forecastResponse = await axios.get(forecastUrl, { timeout: 10000 });

        let maxRainProb = 0;
        let willRain = false;
        
        if (forecastResponse.data.list) {
            forecastResponse.data.list.forEach(item => {
                if (item.pop) {
                    maxRainProb = Math.max(maxRainProb, item.pop * 100);
                }
                if (item.weather && item.weather[0] && item.weather[0].main === 'Rain') {
                    willRain = true;
                }
            });
        }

        return {
            current: {
                temperature: Math.round(currentResponse.data.main.temp),
                humidity: currentResponse.data.main.humidity,
                description: currentResponse.data.weather[0].description,
                icon: getWeatherIcon(currentResponse.data.weather[0].main),
                windSpeed: Math.round(currentResponse.data.wind.speed * 3.6)
            },
            forecast: {
                rainProbability: Math.round(maxRainProb),
                willRain: willRain,
                daily: [Math.round(maxRainProb), 0, 0]
            },
            location: currentResponse.data.name || 'Standort',
            timestamp: Date.now(),
            provider: 'openweathermap'
        };

    } catch (error) {
        console.error('❌ OpenWeatherMap API Fehler:', error.message);
        throw error;
    }
}

function getWeatherInfoFromCode(code) {
    const weatherCodes = {
        0: { description: 'Klar', icon: '☀️' },
        1: { description: 'Überwiegend klar', icon: '🌤️' },
        2: { description: 'Teilweise bewölkt', icon: '⛅' },
        3: { description: 'Bedeckt', icon: '☁️' },
        45: { description: 'Nebelig', icon: '🌫️' },
        48: { description: 'Nebel mit Reifablagerung', icon: '🌫️' },
        51: { description: 'Leichter Nieselregen', icon: '🌦️' },
        53: { description: 'Nieselregen', icon: '🌦️' },
        55: { description: 'Starker Nieselregen', icon: '🌧️' },
        61: { description: 'Leichter Regen', icon: '🌧️' },
        63: { description: 'Regen', icon: '🌧️' },
        65: { description: 'Starker Regen', icon: '🌧️' },
        71: { description: 'Leichter Schneefall', icon: '🌨️' },
        73: { description: 'Schneefall', icon: '🌨️' },
        75: { description: 'Starker Schneefall', icon: '🌨️' },
        80: { description: 'Leichte Regenschauer', icon: '🌦️' },
        81: { description: 'Regenschauer', icon: '🌧️' },
        82: { description: 'Starke Regenschauer', icon: '⛈️' },
        95: { description: 'Gewitter', icon: '⛈️' },
        96: { description: 'Gewitter mit Hagel', icon: '⛈️' },
        99: { description: 'Gewitter mit Hagel', icon: '⛈️' }
    };
    
    return weatherCodes[code] || { description: 'Unbekannt', icon: '🌤️' };
}

function getWeatherIcon(condition) {
    const icons = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '🌨️',
        'Mist': '🌫️',
        'Fog': '🌫️'
    };
    return icons[condition] || '🌤️';
}

async function shouldSkipWateringDueToWeather() {
    const weather = await fetchWeatherData();
    
    if (!weather) {
        return false;
    }

    const rainThreshold = config.weather.rainThreshold || 70;
    
    if (weather.forecast.rainProbability >= rainThreshold) {
        console.log(`⏸️ Bewässerung pausiert: Regenwahrscheinlichkeit ${weather.forecast.rainProbability}% (Schwellwert: ${rainThreshold}%)`);
        return true;
    }

    if (weather.forecast.willRain) {
        console.log('⏸️ Bewässerung pausiert: Regen vorhergesagt');
        return true;
    }

    return false;
}

async function controlZone(zoneId, state) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM zones WHERE id = ?', [zoneId], async (err, zone) => {
            if (err || !zone) {
                reject(new Error('Zone nicht gefunden'));
                return;
            }

            try {
                if (state) {
                    const activeZone = await new Promise((res) => {
                        db.get('SELECT id, name FROM zones WHERE is_active = 1 AND id != ?', [zoneId], (err, row) => {
                            res(row);
                        });
                    });

                    if (activeZone) {
                        reject(new Error(`Zone "${activeZone.name}" läuft bereits. Bitte zuerst stoppen.`));
                        return;
                    }
                }

                if (config.loxone && config.loxone.host && config.loxone.username) {
                    const loxoneUrl = `http://${config.loxone.host}/dev/sps/io/${zone.loxone_output}/${state ? 1 : 0}`;
                    
                    try {
                        await axios.get(loxoneUrl, {
                            auth: {
                                username: config.loxone.username,
                                password: config.loxone.password
                            },
                            timeout: 5000
                        });
                        console.log(`✅ Loxone: ${zone.name} -> ${state ? 'AN' : 'AUS'}`);
                    } catch (loxoneError) {
                        console.error('⚠️ Loxone-Verbindungsfehler:', loxoneError.message);
                    }
                }

                const sql = state
                    ? 'UPDATE zones SET is_active = 1, last_watered = CURRENT_TIMESTAMP WHERE id = ?'
                    : 'UPDATE zones SET is_active = 0 WHERE id = ?';

                db.run(sql, [zoneId], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`${state ? '▶️' : '⏸️'} Zone ${zone.name} ${state ? 'gestartet' : 'gestoppt'}`);
                    resolve({ success: true, zone: zone.name, state });
                });

            } catch (error) {
                reject(error);
            }
        });
    });
}

async function runSequence(zones, sequenceId = null) {
    console.log('🔄 Starte Sequenz mit Zonen:', zones);
    
    for (const zoneConfig of zones) {
        const zoneId = zoneConfig.zone_id;
        const duration = zoneConfig.duration;
        
        try {
            await controlZone(zoneId, true);
            console.log(`⏱️ Zone ${zoneId} läuft für ${duration} Minuten`);
            
            await new Promise((resolve) => {
                setTimeout(async () => {
                    await controlZone(zoneId, false);
                    console.log(`✅ Zone ${zoneId} beendet`);
                    resolve();
                }, duration * 60 * 1000);
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Fehler bei Zone ${zoneId}:`, error.message);
        }
    }
    
    console.log('✅ Sequenz abgeschlossen');
}

async function loadScheduleCrons() {
    console.log('🕐 Lade Zeitpläne...');
    
    db.all('SELECT * FROM schedules WHERE enabled = 1', [], (err, schedules) => {
        if (err) {
            console.error('Fehler beim Laden der Zeitpläne:', err);
            return;
        }
        
        schedules.forEach(schedule => {
            registerScheduleCron(schedule);
        });
        
        console.log(`✅ ${schedules.length} aktive Zeitpläne geladen`);
    });
}

function registerScheduleCron(schedule) {
    const cronKey = `schedule_${schedule.id}`;
    
    if (activeCrons.has(cronKey)) {
        activeCrons.get(cronKey).stop();
        activeCrons.delete(cronKey);
    }
    
    const [hours, minutes] = schedule.time.split(':');
    const days = JSON.parse(schedule.days).join(',');
    const cronPattern = `${minutes} ${hours} * * ${days}`;
    
    console.log(`📅 Registriere Zeitplan #${schedule.id}: ${cronPattern}`);
    
    const job = cron.schedule(cronPattern, async () => {
        console.log(`⏰ Zeitplan #${schedule.id} ausgelöst um ${new Date().toLocaleString('de-DE')}`);
        
        const skipDueToWeather = await shouldSkipWateringDueToWeather();
        if (skipDueToWeather) {
            console.log(`⏸️ Zeitplan #${schedule.id} übersprungen wegen Wetter`);
            return;
        }
        
        db.get('SELECT * FROM sequences WHERE id = ?', [schedule.sequence_id], async (err, sequence) => {
            if (err || !sequence) {
                console.error('Sequenz nicht gefunden:', schedule.sequence_id);
                return;
            }
            
            console.log(`🔄 Starte Sequenz "${sequence.name}"`);
            const zones = JSON.parse(sequence.zones);
            await runSequence(zones, sequence.id);
        });
    }, {
        timezone: 'Europe/Vienna'
    });
    
    activeCrons.set(cronKey, job);
}

function reloadAllCrons() {
    console.log('🔄 Lade alle Cron-Jobs neu...');
    
    activeCrons.forEach(job => job.stop());
    activeCrons.clear();
    
    loadScheduleCrons();
}

cron.schedule('*/15 * * * *', async () => {
    if (config.weather && config.weather.enabled) {
        console.log('🔄 Automatische Wetter-Aktualisierung...');
        await fetchWeatherData();
    }
}, {
    timezone: 'Europe/Vienna'
});

app.get('/api/weather/current', async (req, res) => {
    try {
        const weather = await fetchWeatherData();
        
        if (!weather) {
            return res.status(503).json({
                error: 'Wetterdaten nicht verfügbar',
                configured: config.weather && config.weather.enabled
            });
        }
        
        res.json(weather);
    } catch (error) {
        console.error('Fehler beim Abrufen der Wetterdaten:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/weather/refresh', async (req, res) => {
    try {
        weatherCache = null;
        weatherCacheTime = null;
        
        const weather = await fetchWeatherData();
        
        if (!weather) {
            return res.status(503).json({
                success: false,
                error: 'Wetterdaten konnten nicht abgerufen werden'
            });
        }
        
        res.json({
            success: true,
            message: 'Wetterdaten aktualisiert',
            data: weather
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/zones', (req, res) => {
    db.all('SELECT * FROM zones ORDER BY id ASC', [], (err, zones) => {
        if (err) {
            console.error('Fehler beim Abrufen der Zonen:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(zones);
    });
});

app.post('/api/zones/:id/start', async (req, res) => {
    const { id } = req.params;
    const { duration = 10 } = req.body;

    try {
        await controlZone(id, true);

        const timer = setTimeout(async () => {
            await controlZone(id, false);
            activeTimers.delete(parseInt(id));
        }, duration * 60 * 1000);

        activeTimers.set(parseInt(id), timer);

        res.json({
            success: true,
            message: `Zone ${id} gestartet für ${duration} Minuten`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/zones/:id/stop', async (req, res) => {
    const { id } = req.params;

    try {
        if (activeTimers.has(parseInt(id))) {
            clearTimeout(activeTimers.get(parseInt(id)));
            activeTimers.delete(parseInt(id));
        }

        await controlZone(id, false);

        res.json({
            success: true,
            message: `Zone ${id} gestoppt`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/zones/stopall', async (req, res) => {
    try {
        activeTimers.forEach(timer => clearTimeout(timer));
        activeTimers.clear();

        const zones = await new Promise((resolve, reject) => {
            db.all('SELECT id FROM zones WHERE is_active = 1', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        for (const zone of zones) {
            await controlZone(zone.id, false);
        }

        res.json({
            success: true,
            message: `${zones.length} Zonen gestoppt`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/zones/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name erforderlich' });
    }

    db.run('UPDATE zones SET name = ? WHERE id = ?', [name, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Zone nicht gefunden' });
        }

        res.json({
            success: true,
            message: 'Zone aktualisiert'
        });
    });
});

app.get('/api/sequences', (req, res) => {
    db.all('SELECT * FROM sequences ORDER BY created_at DESC', [], (err, sequences) => {
        if (err) {
            console.error('Fehler beim Abrufen der Sequenzen:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const parsedSequences = sequences.map(seq => ({
            ...seq,
            zones: JSON.parse(seq.zones)
        }));
        
        res.json(parsedSequences);
    });
});

app.post('/api/sequences', (req, res) => {
    const { name, zones } = req.body;

    if (!name || !zones || zones.length === 0) {
        return res.status(400).json({ error: 'Name und Zonen erforderlich' });
    }

    const zonesJson = JSON.stringify(zones);

    db.run(
        'INSERT INTO sequences (name, zones) VALUES (?, ?)',
        [name, zonesJson],
        function(err) {
            if (err) {
                console.error('Fehler beim Erstellen der Sequenz:', err);
                return res.status(500).json({ error: err.message });
            }

            console.log(`✅ Sequenz erstellt: ${name} (ID: ${this.lastID})`);
            
            res.json({
                success: true,
                id: this.lastID,
                message: 'Sequenz erstellt'
            });
        }
    );
});

app.delete('/api/sequences/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM sequences WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen der Sequenz:', err);
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Sequenz nicht gefunden' });
        }

        console.log(`✅ Sequenz gelöscht: #${id}`);
        
        res.json({
            success: true,
            message: 'Sequenz gelöscht'
        });
    });
});

app.post('/api/sequences/:id/start', async (req, res) => {
    const { id } = req.params;

    try {
        const sequence = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM sequences WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else if (!row) reject(new Error('Sequenz nicht gefunden'));
                else resolve(row);
            });
        });

        const zones = JSON.parse(sequence.zones);

        runSequence(zones, sequence.id).catch(err => {
            console.error('Fehler beim Ausführen der Sequenz:', err);
        });

        res.json({
            success: true,
            message: `Sequenz "${sequence.name}" gestartet`,
            zones: zones.length
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/schedules', (req, res) => {
    db.all('SELECT * FROM schedules ORDER BY time ASC', [], (err, schedules) => {
        if (err) {
            console.error('Fehler beim Abrufen der Zeitpläne:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(schedules);
    });
});

app.post('/api/schedules', (req, res) => {
    const { name, sequence_id, days, time, enabled } = req.body;
    
    if (!sequence_id || !days || !time) {
        return res.status(400).json({ error: 'Fehlende Daten' });
    }
    
    const sql = `INSERT INTO schedules (name, sequence_id, days, time, enabled) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sql, [name, sequence_id, days, time, enabled ?? 1], function(err) {
        if (err) {
            console.error('Fehler beim Erstellen des Zeitplans:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Zeitplan erstellt: #${this.lastID}`);
        
        reloadAllCrons();
        
        res.json({ 
            success: true, 
            id: this.lastID,
            message: 'Zeitplan erstellt'
        });
    });
});

app.put('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const { name, sequence_id, days, time, enabled } = req.body;
    
    const updates = [];
    const values = [];
    
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (sequence_id !== undefined) { updates.push('sequence_id = ?'); values.push(sequence_id); }
    if (days !== undefined) { updates.push('days = ?'); values.push(days); }
    if (time !== undefined) { updates.push('time = ?'); values.push(time); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled); }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'Keine Daten zum Aktualisieren' });
    }
    
    values.push(id);
    const sql = `UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(sql, values, function(err) {
        if (err) {
            console.error('Fehler beim Aktualisieren des Zeitplans:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
        }
        
        console.log(`✅ Zeitplan aktualisiert: #${id}`);
        
        reloadAllCrons();
        
        res.json({ 
            success: true,
            message: 'Zeitplan aktualisiert'
        });
    });
});

app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM schedules WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen des Zeitplans:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Zeitplan nicht gefunden' });
        }
        
        console.log(`✅ Zeitplan gelöscht: #${id}`);
        
        reloadAllCrons();
        
        res.json({ 
            success: true,
            message: 'Zeitplan gelöscht'
        });
    });
});

app.get('/api/setup/config', (req, res) => {
    res.json(config);
});

app.post('/api/setup/save', (req, res) => {
    try {
        const { loxone, weather, zones } = req.body;

        if (loxone) {
            config.loxone = loxone;
        }

        if (weather) {
            config.weather = weather;
            weatherCache = null;
            weatherCacheTime = null;
        }

        if (zones && Array.isArray(zones)) {
            const stmt = db.prepare('UPDATE zones SET name = ? WHERE id = ?');
            zones.forEach(zone => {
                stmt.run(zone.name, zone.id);
            });
            stmt.finalize();
        }

        config.initialized = true;
        saveConfig();

        res.json({
            success: true,
            message: 'Konfiguration gespeichert'
        });
    } catch (error) {
        console.error('Fehler beim Speichern der Setup-Daten:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/setup/test-connection', async (req, res) => {
    try {
        const { host, username, password } = req.body;

        if (!host || !username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Alle Felder sind erforderlich'
            });
        }

        const testUrl = `http://${host}/dev/sps/status`;

        const response = await axios.get(testUrl, {
            auth: { username, password },
            timeout: 5000
        });

        res.json({
            success: true,
            message: 'Verbindung erfolgreich',
            data: response.data
        });

    } catch (error) {
        console.error('Verbindungstest fehlgeschlagen:', error);

        let errorMessage = 'Verbindung fehlgeschlagen';
        if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Miniserver nicht erreichbar';
        } else if (error.response?.status === 401) {
            errorMessage = 'Benutzername oder Passwort falsch';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Timeout - Miniserver antwortet nicht';
        }

        res.status(400).json({
            success: false,
            error: errorMessage
        });
    }
});

app.post('/api/backup/create', async (req, res) => {
    try {
        const backupScript = path.join(__dirname, '..', 'backup.sh');
        
        if (!fs.existsSync(backupScript)) {
            return res.status(404).json({
                success: false,
                error: 'Backup-Script nicht gefunden'
            });
        }
        
        console.log('🔄 Starte Backup...');
        
        const { stdout, stderr } = await execPromise(`bash ${backupScript}`);
        
        console.log('✅ Backup erfolgreich erstellt');
        
        res.json({
            success: true,
            message: 'Backup erfolgreich erstellt',
            output: stdout
        });
        
    } catch (error) {
        console.error('❌ Backup-Fehler:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.stderr || error.stdout
        });
    }
});

app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  🌱 LoxBerry Smart Irrigation v1.3  ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`✅ Server läuft auf Port ${PORT}`);
    console.log(`🌐 Web-UI: http://localhost:${PORT}`);
    console.log('');
    
    initDatabase();
    
    setTimeout(async () => {
        loadScheduleCrons();
        
        if (config.weather && config.weather.enabled) {
            console.log('🌤️ Lade initiale Wetterdaten...');
            await fetchWeatherData();
        }
    }, 1000);
});

process.on('SIGINT', () => {
    console.log('\n⏹️ Server wird beendet...');
    
    activeTimers.forEach(timer => clearTimeout(timer));
    activeTimers.clear();
    
    activeCrons.forEach(job => job.stop());
    activeCrons.clear();
    
    db.close((err) => {
        if (err) {
            console.error('Fehler beim Schließen der Datenbank:', err);
        } else {
            console.log('✅ Datenbank geschlossen');
        }
        process.exit(0);
    });
});
