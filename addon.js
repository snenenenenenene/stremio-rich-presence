require('dotenv').config();
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const https = require('https');

const clientId = process.env.DISCORD_CLIENT_ID;
const tmdbApiKey = process.env.TMDB_API_KEY;
const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN;
const isRunningOnBeamUp = process.env.BEAMUP || os.hostname().includes('beamup');

let rpc;
if (!isRunningOnBeamUp) {
    const { Client } = require('discord-rpc');
    rpc = new Client({ transport: 'ipc' });

    const certOptions = {
        key: fs.readFileSync('./certs/server.key'),
        cert: fs.readFileSync('./certs/server.pem'),
        ca: fs.readFileSync('./certs/chain.pem')
    };

    const httpsServer = https.createServer(certOptions, (req, res) => {
        res.writeHead(200);
        res.end('Running Reverse Proxy for Discord RPC\n');
    }).listen(8443, '0.0.0.0', () => {
        console.log('HTTPS Server running at https://127-0-0-1.my.local-ip.co:8443');
    });

    rpc.on('ready', () => {
        console.log('Connected to Discord!');
        setDefaultActivity(); // Set the default activity when the addon starts
    });

    rpc.login({ clientId }).catch((error) => {
        console.error('Error connecting to Discord:', error);
    });
} else {
    console.log('Running on BeamUp, Discord RPC not initialized.');
}

const startTimestamp = Math.floor(Date.now() / 1000); // Store the start time when Stremio was opened
let resetActivityTimeout;

// Fun randomized phrases for browsing
const browsingPhrases = [
    'Exploring the vast world of cinema...',
    'Hunting for the next big binge...',
    'Diving into the archives...',
    'On the quest for entertainment...',
    'Scrolling through endless possibilities...'
];

// Fun randomized phrases for watching details
const watchingPhrases = [
    'Captivated by',
    'Engrossed in',
    'Immersed in',
    'Glued to the screen with',
    'Watching the masterpiece:'
];

const manifest = {
    id: "org.stremio.discordpresence",
    version: "1.0.0",
    name: "Discord Rich Presence Addon",
    description: "Addon that updates Discord status with the current stream from Stremio.",
    resources: ["meta", "subtitles"],
    types: ["movie", "series", "channel"],
    logo: "/assets/discord-logo.png",
    catalogs: [],
    idPrefixes: ["tt", "yt"]
};

const builder = new addonBuilder(manifest);

// Function to set the default activity
function setDefaultActivity() {
    const randomBrowsingPhrase = browsingPhrases[Math.floor(Math.random() * browsingPhrases.length)];

    if (!isRunningOnBeamUp && rpc) {
        rpc.setActivity({
            details: 'Stremio is open',
            state: randomBrowsingPhrase,
            largeImageKey: 'https://play-lh.googleusercontent.com/k3489BQdgNeGZKMV8HIOMVZlMyY2EXkiWB0MN6yTl5omfd3_MCSCU75UTXqwh-7j-Qs',
            largeImageText: 'Stremio',
            startTimestamp: startTimestamp,
            instance: false,
        });
        console.log(`Discord Rich Presence updated: ${randomBrowsingPhrase}`);
    } else {
        console.log('Default activity not set: either running on BeamUp or RPC not initialized.');
    }
}

// Function to update Discord Rich Presence when playing content
async function updatePlayActivity(id, stream) {
    clearTimeout(resetActivityTimeout);

    let largeImageKey = 'default_image_key';
    let name = stream.name;
    let stateText = '';

    console.log(`Updating play activity for: ${id}, type: ${stream.type}`);

    if (stream.type === 'series') {
        const seriesData = await fetchSeriesData(id.split(':')[0], stream.season, stream.episode);
        if (seriesData) {
            largeImageKey = seriesData.poster || largeImageKey;
            name = seriesData.name;
        }
    } else if (stream.type === 'channel' && id.startsWith('yt')) {
        const videoId = id.split(':')[1];
        const youtubeDetails = await fetchYouTubeDetails(videoId);
        if (youtubeDetails) {
            largeImageKey = youtubeDetails.thumbnail;
            name = youtubeDetails.title;
            stateText = `by ${youtubeDetails.creator}`;
        }
    } else {
        largeImageKey = await fetchImage(id) || largeImageKey;
    }

    const randomWatchingPhrase = watchingPhrases[Math.floor(Math.random() * watchingPhrases.length)];

    if (!isRunningOnBeamUp && rpc) {
        rpc.setActivity({
            details: `${randomWatchingPhrase} ${name}`,
            state: stateText || (stream.type === 'series' ? `S${stream.season}:E${stream.episode}` : undefined),
            startTimestamp: startTimestamp,
            largeImageKey: largeImageKey,
            largeImageText: name,
            smallImageKey: 'stremio_logo',
            instance: false,
        });

        console.log(`Discord Rich Presence updated: ${randomWatchingPhrase} ${name} (${stream.type}) ${stateText || ''}`);
        
        resetActivityTimeout = setTimeout(() => {
            setDefaultActivity();
            console.log(`No activity detected for 30 seconds, resetting DCRP to default.`);
        }, 30000); // 30 seconds timeout
    } else {
        console.log('Play activity not updated: either running on BeamUp or RPC not initialized.');
    }
}

// Function to fetch series episode image and name from TMDB
async function fetchSeriesData(imdbId, season, episode) {
    try {
        console.log(`Fetching series data for IMDb ID: ${imdbId}, Season: ${season}, Episode: ${episode}`);
        const tmdbUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${tmdbApiKey}`;
        const response = await axios.get(tmdbUrl, {
            headers: {
                Authorization: `Bearer ${tmdbAccessToken}`,
                accept: 'application/json'
            }
        });

        if (response.data.tv_results.length > 0) {
            const series = response.data.tv_results[0];
            const episodeUrl = `https://api.themoviedb.org/3/tv/${series.id}/season/${season}/episode/${episode}?api_key=${tmdbApiKey}`;
            const episodeResponse = await axios.get(episodeUrl, {
                headers: {
                    Authorization: `Bearer ${tmdbAccessToken}`,
                    accept: 'application/json'
                }
            });

            const episodeData = episodeResponse.data;

            return {
                name: `${series.name} - ${episodeData.name}`,
                poster: episodeData.still_path ? `https://image.tmdb.org/t/p/w500${episodeData.still_path}` : `https://image.tmdb.org/t/p/w500${series.poster_path}`,
            };
        } else {
            console.log(`No series found for IMDb ID: ${imdbId}`);
        }
    } catch (error) {
        console.error(`Error fetching series data for ${imdbId}:`, error);
        return null;
    }
}

// Function to fetch image from TMDB using IMDb ID or from other sources for YouTube
async function fetchImage(imdbId) {
    if (imdbId.startsWith('yt')) {
        return 'https://img.youtube.com/vi/' + imdbId.split(':')[1] + '/hqdefault.jpg'; // Use YouTube thumbnail
    } else {
        try {
            console.log(`Fetching image for IMDb ID: ${imdbId}`);
            const tmdbUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${tmdbApiKey}`;
            const response = await axios.get(tmdbUrl, {
                headers: {
                    Authorization: `Bearer ${tmdbAccessToken}`,
                    accept: 'application/json'
                }
            });

            const movie = response.data.movie_results[0];
            if (movie) {
                const posterPath = movie.poster_path;
                return `https://image.tmdb.org/t/p/w500${posterPath}`;
            } else {
                console.log(`No movie found for IMDb ID: ${imdbId}`);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching image for ${imdbId}:`, error);
            return null;
        }
    }
}

// Function to fetch YouTube video details
async function fetchYouTubeDetails(videoId) {
    try {
        console.log(`Fetching YouTube details for Video ID: ${videoId}`);
        const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        if (response.data.items.length > 0) {
            const video = response.data.items[0].snippet;
            return {
                title: video.title,
                creator: video.channelTitle,
                thumbnail: video.thumbnails.high.url
            };
        } else {
            console.log(`No YouTube video found for Video ID: ${videoId}`);
        }
        return null;
    } catch (error) {
        console.error(`Error fetching YouTube video details for ${videoId}:`, error);
        return null;
    }
}

// Subtitle handler to detect when a stream is actually being watched
builder.defineSubtitlesHandler(async function(args) {
    console.log(`Subtitle request received for: ${args.type} with id: ${args.id}`);

    const meta = await fetchMetadata(args.id);
    if (meta) {
        console.log(`Updating Discord presence for: ${meta.name}`);
        await updatePlayActivity(args.id, meta);
    } else {
        console.log(`No metadata found for: ${args.id}`);
    }

    return Promise.resolve({ subtitles: [] });
});

// Meta handler to fetch metadata when the user starts watching something
builder.defineMetaHandler(async function(args) {
    console.log(`Meta request received for: ${args.type} with id: ${args.id}`);

    const meta = await fetchMetadata(args.id);
    if (meta) {
        console.log(`Updating Discord presence for: ${meta.name}`);
        await updatePlayActivity(args.id, meta);
    } else {
        console.log(`No metadata found for: ${args.id}`);
    }

    return Promise.resolve({ meta });
});

// Function to fetch metadata
async function fetchMetadata(id) {
    if (id.startsWith('yt')) {
        const videoId = id.split(':')[1];
        const youtubeDetails = await fetchYouTubeDetails(videoId);
        if (youtubeDetails) {
            return {
                id: id,
                name: youtubeDetails.title,
                type: 'channel',
                creator: youtubeDetails.creator,
                thumbnail: youtubeDetails.thumbnail
            };
        }
    } else {
        const [imdbId, season, episode] = id.split(':');
        const tmdbUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${tmdbApiKey}`;

        try {
            console.log(`Fetching metadata for ID: ${id}`);
            const response = await axios.get(tmdbUrl, {
                headers: {
                    Authorization: `Bearer ${tmdbAccessToken}`,
                    accept: 'application/json'
                }
            });

            if (response.data.tv_results.length > 0 && season && episode) {
                const series = response.data.tv_results[0];
                return {
                    id: id,
                    name: series.name,
                    type: "series",
                    season: season,
                    episode: episode,
                    poster: series.poster_path ? `https://image.tmdb.org/t/p/w500${series.poster_path}` : null
                };
            } else if (response.data.movie_results.length > 0) {
                const movie = response.data.movie_results[0];
                return {
                    id: id,
                    name: movie.title,
                    type: "movie",
                    poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
                };
            } else {
                console.log(`No matching movie or series found for IMDb ID: ${imdbId}`);
            }
        } catch (error) {
            console.error(`Error fetching metadata for ${id}:`, error);
            return null;
        }
    }
    return null;
}

module.exports = builder.getInterface();

serveHTTP(builder.getInterface(), { port: process.env.PORT || 4000 });

console.log(`Stremio Discord Presence Addon is running on port ${process.env.PORT || 4000}`);
