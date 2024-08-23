require('dotenv').config();
const { addonBuilder, serveHTTP, publishToCentral } = require("stremio-addon-sdk");
const { Client } = require('discord-rpc');
const axios = require('axios');

const clientId = process.env.DISCORD_CLIENT_ID;
const tmdbApiKey = process.env.TMDB_API_KEY;
const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN;

const rpc = new Client({ transport: 'ipc' });
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
    resources: ["meta", "subtitles"], // Removed "catalog" and "stream", focusing on passive DCRP
    types: ["movie", "series", "channel"], // Added "channel" to handle YouTube and similar content
    logo: "/assets/discord-logo.png",
    catalogs: [], // Empty array to satisfy the requirement
    idPrefixes: ["tt", "yt"] // Added "yt" for YouTube and other online content
};

const builder = new addonBuilder(manifest);

// Connect to Discord
rpc.on('ready', () => {
    console.log('Connected to Discord!');
    setDefaultActivity(); // Set the default activity when the addon starts
});

rpc.login({ clientId }).catch(console.error);

// Function to fetch image from TMDB using IMDb ID or from other sources for YouTube
async function fetchImage(imdbId) {
    if (imdbId.startsWith('yt')) {
        return 'https://img.youtube.com/vi/' + imdbId.split(':')[1] + '/hqdefault.jpg'; // Use YouTube thumbnail
    } else {
        try {
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
                return null;
            }
        } catch (error) {
            console.error(`Error fetching image for ${imdbId}:`, error);
            return null;
        }
    }
}

// Function to fetch series episode image and name from TMDB
async function fetchSeriesData(imdbId, season, episode) {
    try {
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
        }
    } catch (error) {
        console.error(`Error fetching series data for ${imdbId}:`, error);
        return null;
    }
}

// Function to fetch YouTube video details
async function fetchYouTubeDetails(videoId) {
    try {
        const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        if (response.data.items.length > 0) {
            const video = response.data.items[0].snippet;
            return {
                title: video.title,
                creator: video.channelTitle,
                thumbnail: video.thumbnails.high.url
            };
        }
        return null;
    } catch (error) {
        console.error(`Error fetching YouTube video details for ${videoId}:`, error);
        return null;
    }
}

// Function to set the default activity
function setDefaultActivity() {
    const randomBrowsingPhrase = browsingPhrases[Math.floor(Math.random() * browsingPhrases.length)];
    
    rpc.setActivity({
        details: 'Stremio is open',
        state: randomBrowsingPhrase,
        largeImageKey: 'https://play-lh.googleusercontent.com/k3489BQdgNeGZKMV8HIOMVZlMyY2EXkiWB0MN6yTl5omfd3_MCSCU75UTXqwh-7j-Qs', // Stremio image provided
        largeImageText: 'Stremio',
        startTimestamp: startTimestamp, // Start time when Stremio was opened
        instance: false,
    });
    console.log(`Discord Rich Presence updated: ${randomBrowsingPhrase}`);
}

// Function to update Discord Rich Presence when playing content
async function updatePlayActivity(id, stream) {
    clearTimeout(resetActivityTimeout); // Clear any existing timeout when playing starts

    let largeImageKey = 'default_image_key'; // Default image key
    let name = stream.name;
    let stateText = '';

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
        largeImageKey = await fetchImage(id) || largeImageKey; // Fetch image for movies or channels
    }

    const randomWatchingPhrase = watchingPhrases[Math.floor(Math.random() * watchingPhrases.length)];

    rpc.setActivity({
        details: `${randomWatchingPhrase} ${name}`,
        state: stateText || (stream.type === 'series' ? `S${stream.season}:E${stream.episode}` : undefined), // Show season/episode for series or creator for YouTube
        startTimestamp: startTimestamp, // Show the total duration since Stremio was opened
        largeImageKey: largeImageKey,
        largeImageText: name,
        smallImageKey: 'stremio_logo',
        instance: false,
    });

    console.log(`Discord Rich Presence updated: ${randomWatchingPhrase} ${name} (${stream.type}) ${stateText || ''}`);

    // Set a timeout to reset the activity after 30 seconds of inactivity
    resetActivityTimeout = setTimeout(() => {
        setDefaultActivity();
        console.log(`No activity detected for 30 seconds, resetting DCRP to default.`);
    }, 30000); // 30 seconds timeout
}

// Subtitle handler to detect when a stream is actually being watched
builder.defineSubtitlesHandler(async function(args) {
    console.log(`Subtitle request received for: ${args.type} with id: ${args.id}`);

    const meta = await fetchMetadata(args.id);
    if (meta) {
        await updatePlayActivity(args.id, meta);
    }

    return Promise.resolve({ subtitles: [] });
});

// Meta handler to fetch metadata when the user starts watching something
builder.defineMetaHandler(async function(args) {
    console.log(`Meta request received for: ${args.type} with id: ${args.id}`);

    const meta = await fetchMetadata(args.id);
    if (meta) {
        await updatePlayActivity(args.id, meta);
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
                type: 'channel', // Treat it as a channel type
                creator: youtubeDetails.creator,
                thumbnail: youtubeDetails.thumbnail
            };
        }
    } else {
        const [imdbId, season, episode] = id.split(':');
        const tmdbUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${tmdbApiKey}`;

        try {
            const response = await axios.get(tmdbUrl, {
                headers: {
                    Authorization: `Bearer ${tmdbAccessToken}`,
                    accept: 'application/json'
                }
            });

            if (response.data.tv_results.length > 0 && season && episode) {
                // Handle TV series episodes
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
                // Handle movies
                const movie = response.data.movie_results[0];
                return {
                    id: id,
                    name: movie.title,
                    type: "movie",
                    poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
                };
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

// publishToCentral('https://4daa2bdba2f6-stremio-rich-presence.baby-beamup.club/manifest.json')
