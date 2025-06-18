const WebSocket = require('ws');
const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

let config;
try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (error) {
    console.error(`${colors.red}[ERROR]${colors.reset} Failed to load config.json:`, error.message);
    process.exit(1);
}

let isDiscordTokenValid = false;
let pendingStatusUpdate = null;

if (config.discord_token && config.discord_token !== "<your_discord_token>") {
    validateDiscordToken();
} else {
    log('warning', 'Discord token not configured. Status updates will be disabled.');
}

async function validateDiscordToken() {
    try {
        const response = await fetch('https://discord.com/api/v9/users/@me', {
            headers: {
                'Authorization': config.discord_token,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            log('success', `Discord token validated for user: ${user.username}#${user.discriminator}`);
            isDiscordTokenValid = true;
            
            setTimeout(() => {
                updateDiscordStatus("🎵 LyricSync by Krex - 2025 🎵");
            }, 1000);
        } else {
            log('error', `Discord token validation failed: ${response.status}`);
        }
    } catch (error) {
        log('error', `Discord token validation error: ${error.message}`);
    }
}

function getTimestamp() {
    return new Date().toLocaleString();
}

function log(level, message, data = null) {
    const timestamp = `${colors.dim}[${getTimestamp()}]${colors.reset}`;
    let levelColor;
    
    switch (level.toLowerCase()) {
        case 'info':
            levelColor = `${colors.blue}[INFO]${colors.reset}`;
            break;
        case 'success':
            levelColor = `${colors.green}[SUCCESS]${colors.reset}`;
            break;
        case 'warning':
            levelColor = `${colors.yellow}[WARNING]${colors.reset}`;
            break;
        case 'error':
            levelColor = `${colors.red}[ERROR]${colors.reset}`;
            break;
        case 'spotify':
            levelColor = `${colors.magenta}[SPOTIFY]${colors.reset}`;
            break;
        default:
            levelColor = `${colors.white}[${level.toUpperCase()}]${colors.reset}`;
    }
    
    if (data) {
        console.log(`${timestamp} ${levelColor} ${message}`);
        console.log(data);
    } else {
        console.log(`${timestamp} ${levelColor} ${message}`);
    }
}

// Rate limiting for Discord API
let lastStatusUpdate = 0;
const STATUS_UPDATE_COOLDOWN = 450;
let statusQueue = null;

async function updateDiscordStatus(status) {
    if (!isDiscordTokenValid) {
        log('warning', 'Discord token not valid, queuing status update...');
        pendingStatusUpdate = status;
        return;
    }

    const now = Date.now();
    if (now - lastStatusUpdate < STATUS_UPDATE_COOLDOWN) {
        log('info', 'Rate limited, queuing status update...');
        statusQueue = status;
        return;
    }
    
    lastStatusUpdate = now;
    
    try {
        const limitedStatus = status.length > 128 ? status.substring(0, 125) + '...' : status;
        
        const data = {
            custom_status: {
                text: limitedStatus,
                emoji_id: null,
                emoji_name: null,
                expires_at: null
            }
        };
        
        log('info', `Attempting to update Discord status: ${limitedStatus.substring(0, 30)}...`);
        
        const response = await fetch('https://discord.com/api/v9/users/@me/settings', {
            method: 'PATCH',
            headers: {
                'Authorization': config.discord_token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            log('success', `Discord status updated: ${limitedStatus.substring(0, 50)}...`);

            if (statusQueue) {
                setTimeout(() => {
                    const queuedStatus = statusQueue;
                    statusQueue = null;
                    updateDiscordStatus(queuedStatus);
                }, STATUS_UPDATE_COOLDOWN);
            }
        } else {
            const errorText = await response.text();
            log('error', `Failed to update Discord status: ${response.status} ${response.statusText}`);
            log('error', `Response body: ${errorText}`);
            
            if (response.status === 401 || response.status === 403) {
                isDiscordTokenValid = false;
                log('error', 'Discord token appears to be invalid or expired');
            }
        }
        
    } catch (error) {        
        log('error', `Discord status update error: ${error.message}`);
    }
}

setInterval(async () => {
    if (isDiscordTokenValid) {
        try {
            const response = await fetch('https://discord.com/api/v9/users/@me', {
                headers: {
                    'Authorization': config.discord_token,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                log('warning', 'Discord token validation failed during periodic check');
                isDiscordTokenValid = false;
            }
        } catch (error) {
            log('warning', `Periodic token validation error: ${error.message}`);
        }
    }
}, 10 * 60 * 1000);

let previousListeningToSpotify = false;
let currentSpotifyData = null;
let currentLyrics = null;
let lyricsInterval = null;

let ws;
let heartbeatInterval;

function connect() {
    log('info', 'Connecting to Lanyard WebSocket API...');
    
    ws = new WebSocket('wss://api.lanyard.rest/socket');
    
    ws.on('open', () => {
        log('success', 'Connected to Lanyard WebSocket API');

        const subscribeMessage = {
            op: 2,
            d: {
                subscribe_to_id: config.user_id
            }
        };
        
        ws.send(JSON.stringify(subscribeMessage));
        log('info', `Subscribed to user ID: ${config.user_id}`);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(message);
        } catch (error) {
            log('error', 'Failed to parse WebSocket message:', error.message);
        }
    });
    
    ws.on('close', (code, reason) => {
        log('warning', `WebSocket connection closed (Code: ${code}, Reason: ${reason})`);
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        if (lyricsInterval) {
            clearInterval(lyricsInterval);
        }

        setTimeout(() => {
            connect();
        }, 5000);
    });
    
    ws.on('error', (error) => {
        log('error', 'WebSocket error:', error.message);
    });
}

function handleMessage(message) {
    switch (message.op) {
        case 1:
            startHeartbeat(message.d.heartbeat_interval);
            break;
            
        case 0:
            if (message.d) {
                handlePresenceUpdate(message.d);
            }
            break;
            
        default:
            break;
    }
}

function startHeartbeat(interval) {
    heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 3 }));
        }
    }, interval);
}

function handlePresenceUpdate(data) {
    const isListeningToSpotify = data.listening_to_spotify || false;

    if (!previousListeningToSpotify && isListeningToSpotify) {
        log('spotify', 'Started listening to Spotify! 🎵');
        
        if (data.spotify) {
            displaySpotifyInfo(data.spotify);
            fetchAndDisplayLyrics(data.spotify);

            const artist = data.spotify.artist || 'Unknown Artist';
            const song = data.spotify.song || 'Unknown Song';
            const statusText = `🎵 ${artist} - ${song}`;

            if (statusText.length > 128) {
                const shortStatus = `🎵 ${song}`;
                updateDiscordStatus(shortStatus.length > 128 ? shortStatus.substring(0, 125) + '...' : shortStatus);
            } else {
                updateDiscordStatus(statusText);
            }
        }
    } else if (previousListeningToSpotify && !isListeningToSpotify) {
        log('spotify', 'Stopped listening to Spotify');
        stopLyricsDisplay();
        
        // Watermark status'a geri dön
        updateDiscordStatus("🎵 LyricSync by Krex - 2025 🎵");
    } else if (isListeningToSpotify && data.spotify) {
        const newTrackId = data.spotify.track_id;
        if (!currentSpotifyData || currentSpotifyData.track_id !== newTrackId) {
            log('spotify', 'Song changed! 🎶');
            displaySpotifyInfo(data.spotify);
            fetchAndDisplayLyrics(data.spotify);

            const artist = data.spotify.artist || 'Unknown Artist';
            const song = data.spotify.song || 'Unknown Song';
            const statusText = `🎵 ${artist} - ${song}`;
            
            if (statusText.length > 128) {
                const shortStatus = `🎵 ${song}`;
                updateDiscordStatus(shortStatus.length > 128 ? shortStatus.substring(0, 125) + '...' : shortStatus);
            } else {
                updateDiscordStatus(statusText);
            }
        }
    }
    
    previousListeningToSpotify = isListeningToSpotify;
    currentSpotifyData = data.spotify;
}

function displaySpotifyInfo(spotify) {
    if (!spotify) return;
    
    const artist = spotify.artist || 'Unknown Artist';
    const song = spotify.song || 'Unknown Song';
    const album = spotify.album || 'Unknown Album';
    
    const spotifyInfo = `
${colors.cyan}┌─── Spotify Now Playing ───┐${colors.reset}
${colors.cyan}│${colors.reset} ${colors.bright}Artist:${colors.reset} ${colors.green}${artist}${colors.reset}
${colors.cyan}│${colors.reset} ${colors.bright}Title:${colors.reset} ${colors.yellow}${song}${colors.reset}
${colors.cyan}│${colors.reset} ${colors.bright}Album:${colors.reset} ${colors.magenta}${album}${colors.reset}
${colors.cyan}└───────────────────────────┘${colors.reset}`;
    
    log('spotify', `Artist: ${artist}, Title: ${song}, Album: ${album}`);
    console.log(spotifyInfo);
    
    if (spotify.timestamps) {
        const start = new Date(spotify.timestamps.start);
        const end = new Date(spotify.timestamps.end);
        const duration = Math.floor((end - start) / 1000);
        const elapsed = Math.floor((Date.now() - start) / 1000);
        
        log('info', `Song duration: ${formatTime(duration)}, Elapsed: ${formatTime(elapsed)}`);
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function fetchEnhancedLyrics(songTitle, artist, album) {
    return new Promise((resolve, reject) => {

        const encodedTitle = encodeURIComponent(songTitle);
        const enhancedUrl = `https://api.vmohammad.dev/lyrics?track=${encodedTitle}`;

        log('info', `Trying enhanced lyrics API with track: ${songTitle}`);
        
        tryFetchFromUrl(enhancedUrl)
            .then(resolve)
            .catch((error) => {
                log('warning', `Enhanced lyrics API failed: ${error.message}`);
                log('warning', 'Trying LRCLib as fallback...');

                fetchLRCLibLyrics(artist, songTitle, album)
                    .then(lrcLibResponse => {
                        const convertedResponse = {
                            lyrics: lrcLibResponse.syncedLyrics || lrcLibResponse.plainLyrics,
                            lrcLibData: lrcLibResponse
                        };
                        resolve(convertedResponse);
                    })
                    .catch((fallbackError) => {
                        log('error', `Both enhanced lyrics API and LRCLib failed. Enhanced API: ${error.message}, LRCLib: ${fallbackError.message}`);
                        reject(new Error('No lyrics found from any source'));
                    });
            });
    });
}

function tryFetchFromUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

function parseEnhancedLyrics(lyricsData) {
    if (!lyricsData) return [];

    if (lyricsData.lrcLibData) {
        log('info', 'Processing LRCLib lyrics data');
        return parseLRCLibLyrics(lyricsData.lrcLibData);
    }
    
    if (lyricsData.enhancedLyrics && Array.isArray(lyricsData.enhancedLyrics)) {
        log('success', 'Found enhanced lyrics format');
        return lyricsData.enhancedLyrics.map(line => ({
            time: line.time * 1000,
            text: line.text,
            words: line.words || [],
            confidence: line.confidence || 0,
            enhanced: true
        }));
    }
    
    if (lyricsData.lyrics) {
        log('info', 'Using simple lyrics format');
        return parseTimedLyrics(lyricsData.lyrics);
    }
    
    return [];
}

function parseTimedLyrics(lyricsText) {
    if (!lyricsText) return [];
    
    const lines = lyricsText.split('\n');
    const timedLyrics = [];
    
    for (const line of lines) {
        const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)$/);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const centiseconds = parseInt(match[3], 10);
            const text = match[4].trim();
            
            const timeInMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
            
            if (text) {
                timedLyrics.push({
                    time: timeInMs,
                    text: text,
                    enhanced: false
                });
            }
        }
    }
    
    return timedLyrics.sort((a, b) => a.time - b.time);
}

async function fetchAndDisplayLyrics(spotify) {
    if (!spotify || !spotify.song) return;

    stopLyricsDisplay();
    
    try {
        const artist = spotify.artist || 'Unknown Artist';
        const song = spotify.song;
        const album = spotify.album || 'Unknown Album';
        
        log('info', `Fetching lyrics for: ${artist} - ${song}`);
        const lyricsResponse = await fetchEnhancedLyrics(song, artist, album);
        
        if (lyricsResponse) {
            currentLyrics = parseEnhancedLyrics(lyricsResponse);
            
            if (currentLyrics.length > 0) {
                if (currentLyrics.length === 1 && currentLyrics[0].plain) {
                    log('info', 'Displaying plain lyrics (no timing information):');
                    console.log(`${colors.cyan}${currentLyrics[0].text}${colors.reset}`);
                } else {
                    const enhancedCount = currentLyrics.filter(l => l.enhanced).length;
                    log('success', `Found ${currentLyrics.length} lyrics lines (${enhancedCount} enhanced)`);
                    startLyricsDisplay(spotify);
                }
            } else {
                log('warning', 'No timed lyrics found for this song');
                if (lyricsResponse.lyrics) {
                    log('info', 'Displaying plain lyrics:');
                    console.log(`${colors.cyan}${lyricsResponse.lyrics}${colors.reset}`);
                }
            }
        } else {
            log('warning', 'No lyrics found for this song');
        }
    } catch (error) {
        log('error', `Failed to fetch lyrics: ${error.message}`);
    }
}

function startLyricsDisplay(spotify) {
    if (!currentLyrics || !spotify.timestamps) return;
    
    const startTime = spotify.timestamps.start;
    let currentLineIndex = 0;
    
    log('spotify', 'Starting synchronized lyrics display 🎤');
    
    lyricsInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedMs = currentTime - startTime;

        while (currentLineIndex < currentLyrics.length - 1 && 
               currentLyrics[currentLineIndex + 1].time <= elapsedMs) {
            currentLineIndex++;
        }

        if (currentLineIndex < currentLyrics.length && 
            currentLyrics[currentLineIndex].time <= elapsedMs) {
            
            const currentLine = currentLyrics[currentLineIndex];

            if (!currentLine.displayed) {
                if (currentLine.enhanced) {
                    displayEnhancedLyricsLine(currentLine, elapsedMs);
                } else {
                    displayLyricsLine(currentLine.text, elapsedMs);
                }
                currentLine.displayed = true;
            }

            if (spotify.timestamps.end && currentTime >= spotify.timestamps.end) {
                log('spotify', 'Song finished');
                stopLyricsDisplay();
            }
        }
    }, 50);
}

function displayEnhancedLyricsLine(lyricsLine, elapsedMs) {
    const timestamp = formatTime(Math.floor(elapsedMs / 1000));
    const confidence = lyricsLine.confidence ? ` (${Math.round(lyricsLine.confidence * 100)}%)` : '';
    
    let displayText = lyricsLine.text;

    if (lyricsLine.words && lyricsLine.words.length > 0) {
        const relativeTime = elapsedMs - lyricsLine.time;

        let highlightedText = '';
        
        for (let i = 0; i < lyricsLine.words.length; i++) {
            const word = lyricsLine.words[i];
            const wordTime = (word.time - lyricsLine.time / 1000) * 1000;
            const wordEndTime = (word.endTime - lyricsLine.time / 1000) * 1000;
            
            if (relativeTime >= wordTime && relativeTime <= wordEndTime) {
                highlightedText += `${colors.bright}${colors.yellow}${word.word}${colors.reset} `;
            } else if (relativeTime > wordEndTime) {
                highlightedText += `${colors.cyan}${word.word}${colors.reset} `;
            } else {
                highlightedText += `${colors.dim}${word.word}${colors.reset} `;
            }
        }
        
        displayText = highlightedText.trim();
    }
    
    const lyricsDisplay = `
${colors.green}♪ [${timestamp}]${colors.reset} ${displayText}${colors.dim}${confidence}${colors.reset}`;
    
    console.log(lyricsDisplay);

    const cleanText = lyricsLine.text.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (cleanText.length > 5 && cleanText.length < 80 && !cleanText.includes('[') && !cleanText.includes('(')) {
        updateDiscordStatus(`${cleanText}`);
    }
}

function displayLyricsLine(text, elapsedMs) {
    const timestamp = formatTime(Math.floor(elapsedMs / 1000));
    
    const lyricsDisplay = `
${colors.yellow}♪ [${timestamp}] ${colors.cyan}${text}${colors.reset}`;
    
    console.log(lyricsDisplay);

    if (text.length > 5 && text.length < 80 && !text.includes('[') && !text.includes('(')) {
        updateDiscordStatus(`🎤 ${text}`);
    }
}

function stopLyricsDisplay() {
    if (lyricsInterval) {
        clearInterval(lyricsInterval);
        lyricsInterval = null;
    }
    currentLyrics = null;
}

function fetchLRCLibLyrics(artist, song, album) {
    return new Promise((resolve, reject) => {
        const encodedArtist = encodeURIComponent(artist);
        const encodedSong = encodeURIComponent(song);
        const encodedAlbum = encodeURIComponent(album);
        
        const lrcLibUrl = `https://lrclib.net/api/get?artist_name=${encodedArtist}&track_name=${encodedSong}&album_name=${encodedAlbum}`;
        
        log('info', `Trying LRCLib API for: ${artist} - ${song} (Album: ${album})`);
        
        tryFetchFromUrl(lrcLibUrl)
            .then(response => {
                if (response && (response.syncedLyrics || response.plainLyrics)) {
                    log('success', 'Found lyrics from LRCLib API');
                    resolve(response);
                } else {
                    log('warning', 'LRCLib API returned no lyrics');
                    reject(new Error('No lyrics found in LRCLib response'));
                }
            })
            .catch(error => {
                log('warning', `LRCLib API request failed: ${error.message}`);
                reject(error);
            });
    });
}

function parseLRCLibLyrics(lyricsData) {
    if (!lyricsData) return [];

    if (lyricsData.syncedLyrics) {
        log('success', 'Using synced lyrics from LRCLib');
        return parseTimedLyrics(lyricsData.syncedLyrics);
    }

    if (lyricsData.plainLyrics) {
        log('info', 'Using plain lyrics from LRCLib (no timing info)');
        return [{
            time: 0,
            text: lyricsData.plainLyrics,
            enhanced: false,
            plain: true
        }];
    }
    
    return [];
}

async function clearDiscordStatus() {
    if (!isDiscordTokenValid) {
        return;
    }
    
    try {
        const data = {
            custom_status: null
        };
        
        const response = await fetch('https://discord.com/api/v9/users/@me/settings', {
            method: 'PATCH',
            headers: {
                'Authorization': config.discord_token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            log('success', 'Discord status cleared');
        } else {
            log('warning', `Failed to clear Discord status: ${response.status}`);
        }
        
    } catch (error) {
        log('error', `Error clearing Discord status: ${error.message}`);
    }
}

log('info', 'Starting Enhanced Auto Lyrics...');
log('info', `Monitoring user ID: ${config.user_id}`);
connect();

process.on('SIGINT', async () => {
    log('info', 'Shutting down...');
    
    await clearDiscordStatus();
    
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    if (lyricsInterval) {
        clearInterval(lyricsInterval);
    }
    if (ws) {
        ws.close();
    }
    
    log('info', 'Shutdown complete');
    process.exit(0);
});