# 🎵 LyricSync

**Real-time Spotify lyrics synchronization with Discord custom status integration**

A powerful Node.js application that automatically fetches and displays synchronized lyrics for your currently playing Spotify tracks, while updating your Discord custom status in real-time with the current lyric line.

![GitHub License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

## ✨ Features

- 🎶 **Real-time Spotify Integration**: Connects via Lanyard WebSocket API to monitor your Spotify activity
- 🎤 **Synchronized Lyrics Display**: Fetches timed lyrics from multiple sources with millisecond precision
- 💬 **Discord Custom Status Integration**: Updates your Discord custom status with current lyrics using official Discord API
- 🌟 **Enhanced Lyrics Support**: Word-by-word highlighting and confidence scoring for supported tracks
- 🔄 **Multiple Lyrics Sources**: Primary enhanced lyrics API with LRCLib fallback for maximum coverage
- 🎨 **Beautiful Console Output**: Colorized terminal interface with timestamps and progress indicators
- ⚡ **Smart Rate Limiting**: Built-in rate limiting to prevent Discord API abuse with queue system
- 🛡️ **Robust Error Handling**: Comprehensive error handling with automatic reconnection and token validation
- 🧹 **Clean Shutdown**: Automatically clears Discord status when application is closed
- 🔒 **Security**: Direct Discord API integration without third-party selfbot libraries

## 🚀 Demo

```
┌─── Spotify Now Playing ───┐
│ Artist: The Weeknd
│ Title: Blinding Lights
│ Album: After Hours
└───────────────────────────┘

♪ [0:15] Yeah, I've been tryna call 🎤 (85%)
♪ [0:18] I've been on my own for long enough 🎤 (92%)
♪ [0:22] Maybe you can show me how to love, maybe 🎤 (88%)

[INFO] Discord status updated: I've been on my own for long enough
```

## 🛠️ Installation

### Prerequisites

- **Node.js** (v14.0.0 or higher)
- **Discord Account** with user token
- **Lanyard** Joined to the Discord server

### Step 1: Clone the Repository

```bash
git clone https://github.com/Krex381/LyricSync.git
cd LyricSync
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configuration

1. Create or edit `config.json`:
   ```json
   {
       "user_id": "your_discord_user_id",
       "discord_token": "your_discord_user_token"
   }
   ```

2. **Get your Discord User ID**:
   - Enable Developer Mode in Discord Settings
   - Right-click your profile → Copy User ID

3. **Get your Discord User Token**:
   - Open Discord in your browser
   - Press F12 to open Developer Tools
   - Go to Network tab
   - Make any request (send a message, etc.)
   - Look for requests with `Authorization` header
   - Copy the token (it starts with `mfa.` or similar)

4. **Set up Lanyard**:
   - Join the [Lanyard Discord server](https://discord.gg/lanyard)
   - The bot will automatically start tracking your Spotify activity

### Step 4: Update Configuration

Edit `config.json` with your actual values:

```json
{
    "user_id": "1361764408518381698",
    "discord_token": "mfa.your_actual_discord_token_here"
}
```

## 🎯 Usage

### Basic Usage

```bash
npm start
```

### What Happens on Startup

The application automatically:

1. **Validates Discord token** and shows your username
2. **Connects to Lanyard** to monitor your Spotify activity  
3. **Sets initial status** with the watermark: `🎵 LyricSync by Krex - 2025 🎵`
4. **Detects music changes** and fetches lyrics automatically
5. **Updates Discord status** with current lyrics in real-time
6. **Cleans up status** when you close the application (Ctrl+C)

### Status Modes

| Mode | Status Format | When |
|------|---------------|------|
| **Idle** | `🎵 LyricSync by Krex - 2025 🎵` | No music playing |
| **Song Info** | `🎵 Artist - Song \| LyricSync by Krex - 2025` | Music detected, fetching lyrics |
| **Live Lyrics** | `🎤 [Current Lyric] \| LyricSync by Krex - 2025` | Synchronized lyrics display |

### Clean Shutdown

- Press `Ctrl+C` to safely close the application
- Discord custom status will be automatically cleared
- All connections and intervals will be properly closed

## 🔧 Technical Features

### Rate Limiting & Performance

```javascript
const STATUS_UPDATE_COOLDOWN = 1000 // 1 second timeout;
```

- **Smart Queuing**: Updates are queued when rate limited
- **Character Limits**: Status text automatically truncated to 128 characters
- **Periodic Validation**: Discord token validated every 10 minutes
- **Error Recovery**: Automatic reconnection on WebSocket failures

### Lyrics Sources & Fallback

1. **Primary**: `api.vmohammad.dev/lyrics?track=` - Enhanced lyrics with confidence scoring
2. **Fallback**: `lrclib.net/api/get` - Community-sourced synchronized lyrics
3. **Processing**: Word-by-word highlighting for enhanced lyrics
4. **Timing**: Millisecond-precise synchronization with Spotify playback

## 📊 API Integration

| Service | Endpoint | Method | Purpose |
|---------|----------|--------|---------|
| **Lanyard** | `wss://api.lanyard.rest/socket` | WebSocket | Real-time Spotify monitoring |
| **Discord** | `https://discord.com/api/v9/users/@me/settings` | PATCH | Custom status updates |
| **Discord** | `https://discord.com/api/v9/users/@me` | GET | Token validation |
| **Enhanced Lyrics** | `https://api.vmohammad.dev/lyrics?track=` | GET | Primary lyrics source |
| **LRCLib** | `https://lrclib.net/api/get` | GET | Fallback lyrics source |

## 🎨 Console Output Features

- **Colored Logging**: Different colors for different log levels (INFO, SUCCESS, WARNING, ERROR)
- **Timestamps**: All logs include precise timestamps for debugging
- **Beautiful Spotify Display**: Formatted song information with album art URLs
- **Synchronized Lyrics**: Real-time lyrics with timing and confidence scores
- **Progress Tracking**: Song duration and elapsed time display
- **Detailed Error Messages**: Comprehensive error reporting with API responses

## 🚫 Troubleshooting

### Common Issues & Solutions

#### 🔴 Discord Status Not Updating

**Symptoms**: Lyrics show in console but Discord status doesn't change

**Causes & Solutions**:
- **Token Expired**: Get a fresh Discord token from browser Developer Tools
- **Rate Limited**: App automatically handles rate limiting with 1-second cooldowns
- **Status Too Long**: App automatically truncates to Discord's 128-character limit
- **API Error**: Check console for detailed error messages

**Debug Steps**:
```
Look for these console messages:
[INFO] Attempting to update Discord status: ...
[SUCCESS] Discord status updated: ...
[ERROR] Failed to update Discord status: 401 Unauthorized
[WARNING] Discord token appears to be invalid or expired
```

#### 🔴 "Discord token not valid"

**Solutions**:
- Ensure token is correct and includes proper prefix
- Get fresh token: F12 → Network → Find Authorization header
- Token format should be like: `mfa.xxxxx` or similar
- Avoid spaces or extra characters in config.json

#### 🔴 "No lyrics found"

**Causes**:
- Song not in lyrics databases
- Instrumental tracks
- Very new releases
- Non-English songs (limited support)

**The app tries**:
1. Enhanced lyrics API (with word timing)
2. LRCLib fallback (community lyrics)
3. Shows plain lyrics if only text available

#### 🔴 Lanyard Connection Issues

**Solutions**:
- Join [Lanyard Discord server](https://discord.gg/lanyard)
- Enable Spotify activity in Discord settings
- Verify correct Discord user ID in config.json
- Check if Spotify is actually playing music

### 🔍 Debug Information

#### Detailed Console Logging

The app provides comprehensive logging for troubleshooting:

```bash
# Startup
[SUCCESS] Discord token validated for user: YourUsername#1234
[INFO] Connecting to Lanyard WebSocket API...
[SUCCESS] Connected to Lanyard WebSocket API

# Music Detection
[SPOTIFY] Started listening to Spotify! 🎵
[INFO] Fetching lyrics for: Artist - Song Title

# Discord Status Updates
[INFO] Attempting to update Discord status: 🎤 Current lyric...
[SUCCESS] Discord status updated: Current lyric...
[INFO] Rate limited, queuing status update...

# Errors
[ERROR] Failed to update Discord status: 401 Unauthorized
[ERROR] Response body: {"message": "401: Unauthorized", "code": 0}
[WARNING] Discord token appears to be invalid or expired
```

#### Network Issues

- **WebSocket Reconnection**: Automatic reconnection every 5 seconds on failure
- **Token Validation**: Periodic validation every 10 minutes  
- **Graceful Degradation**: Continues working even if Discord API fails

### 🔧 Advanced Debugging

#### Check API Responses

If Discord status isn't updating, manually test your token:

```bash
curl -H "Authorization: YOUR_TOKEN" https://discord.com/api/v9/users/@me
```

Should return your user information if token is valid.

#### Console Error Patterns

| Error Pattern | Meaning | Solution |
|---------------|---------|----------|
| `401 Unauthorized` | Invalid/expired token | Get fresh Discord token |
| `403 Forbidden` | Token lacks permissions | Use your own user token |
| `429 Too Many Requests` | Rate limited | App handles automatically |
| `Connection refused` | Network/firewall issue | Check internet connection |
[17.6.2025, 22:03:09] [INFO] Connecting to Lanyard WebSocket API...
[17.6.2025, 22:03:09] [SUCCESS] Connected to Lanyard WebSocket API
[17.6.2025, 22:03:11] [INFO] Discord status updated (method 1): 🎵 LyricSync by Krex - 2025 🎵
```

## 🔒 Privacy & Security

- **Local Processing**: All lyrics processing happens locally
- **No Data Storage**: No personal data is stored permanently
- **API Compliance**: Respects all API rate limits and terms of service
- **Token Security**: Keep your Discord token private and secure

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Lanyard API** - For Discord presence monitoring
- **LRCLib** - For community-sourced lyrics
- **Enhanced Lyrics API** - For word-timed lyrics data
- **Discord.js Community** - For inspiration and guidance

## 👨‍💻 Author

[**Krex** - *Initial work* - 2025](https://discord.com/users/1361764408518381698)

---

⭐ **Star this repository if you found it helpful!**

📧 **Found a bug?** [Create an issue](https://github.com/Krex381/LyricSync/issues)

🔧 **Want to contribute?** [Check our contributing guidelines](CONTRIBUTING.md)
