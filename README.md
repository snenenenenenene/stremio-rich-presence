# Stremio Discord Presence

A Stremio addon that updates Discord status with the current stream, showing what you're watching in real-time on your Discord profile.

## Features

- Automatically updates your Discord status with what you're watching on Stremio.
- Supports movies, TV series, (and upcomming support for YouTube videos).
- Fun, randomized phrases for browsing and watching.
- Runs locally and connects to your Discord client.

## Installation

### 1. Install the Package Globally

To install the package globally on your system, use the following command:

```bash
npm install -g stremio-discord-presence
```
2. Set Up Environment Variables
Create a .env file in your home directory or the directory where you'll run the script. This file should contain the following environment variables:

```
DISCORD_CLIENT_ID=your_discord_client_id
TMDB_API_KEY=your_tmdb_api_key
TMDB_ACCESS_TOKEN=your_tmdb_access_token
YOUTUBE_API_KEY=your_youtube_api_key
RUNNING_LOCALLY=true
```

Replace the values with your actual API keys and tokens.

3. Running the Script
You can manually start the script by running:

```
stremio-discord-presence
```
4. Set Up Auto-Execution on Startup
On Linux/MacOS
Add the following line to your .bashrc, .zshrc, or .bash_profile to run the script automatically on startup:


```
stremio-discord-presence &
```


## Contributing
Feel free to fork this project, submit issues, or create pull requests. Contributions are always welcome!