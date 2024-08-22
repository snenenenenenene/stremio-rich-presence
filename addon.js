const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { Client } = require('discord-rpc');

const clientId = process.env.DISCORD_CLIENT_ID;

const rpc = new Client({ transport: 'ipc' });

const dataset = {
    "tt0051744": { name: "House on Haunted Hill", type: "movie", infoHash: "9f86563ce2ed86bbfedd5d3e9f4e55aedd660960", poster: "house_on_haunted_hill" }, // Torrent
    "tt1254207": { name: "Big Buck Bunny", type: "movie", url: "http://clips.vorwaerts-gmbh.de/big_buck_bunny.mp4", poster: "big_buck_bunny" }, // HTTP stream
    "tt0031051": { name: "The Arizona Kid", type: "movie", ytId: "m3BKVSpP80s", poster: "arizona_kid" }, // YouTube stream
    "tt0137523": { name: "Fight Club", type: "movie", externalUrl: "https://www.netflix.com/watch/26004747", poster: "fight_club" }, // External URL
    "tt1748166:1:1": { name: "Pioneer One", type: "series", infoHash: "07a9de9750158471c3302e4e95edb1107f980fa6", poster: "pioneer_one" }, // Torrent for series
};

const manifest = {
    id: "org.stremio.discordpresence",
    version: "1.0.0",
    name: "Discord Rich Presence Addon",
    description: "Addon that updates Discord status with the current stream from Stremio.",
    resources: ["catalog", "stream"],
    types: ["movie", "series"],
    catalogs: [
        { type: 'movie', id: 'discordmovies' },
        { type: 'series', id: 'discordseries' }
    ],
    idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

// Connect to Discord
rpc.on('ready', () => {
    console.log('Connected to Discord!');

    // Set a default activity to show that Stremio is open
    rpc.setActivity({
        details: 'Stremio is open',
        state: 'Not watching anything',
        largeImageKey: 'https://user-images.githubusercontent.com/45118834/71491341-17200a00-2828-11ea-9c41-85a6c11203db.png', // Replace with the actual Stremio image key in your Discord app
        largeImageText: 'Stremio',
        instance: false,
    });
});

rpc.login({ clientId }).catch(console.error);

builder.defineStreamHandler(function(args) {
    if (dataset[args.id]) {
        const stream = dataset[args.id];

        rpc.setActivity({
            details: `Watching ${stream.name}`,
            state: `Type: ${stream.type.charAt(0).toUpperCase() + stream.type.slice(1)}`, // Capitalize first letter of type
            startTimestamp: Date.now(),
            largeImageKey: stream.poster,
            largeImageText: stream.name,
            smallImageKey: 'stremio_logo',
            instance: false,
        });

        console.log(`Discord Rich Presence updated: Watching ${stream.name} (${stream.type})`);

        return Promise.resolve({ streams: [stream] });
    } else {
        return Promise.resolve({ streams: [] });
    }
});

const METAHUB_URL = "https://images.metahub.space";

const generateMetaPreview = function(value, key) {
    const imdbId = key.split(":")[0];
    return {
        id: imdbId,
        type: value.type,
        name: value.name,
        poster: METAHUB_URL + "/poster/medium/" + imdbId + "/img",
    };
};

builder.defineCatalogHandler(function(args) {
    const metas = Object.entries(dataset)
        .filter(([_, value]) => value.type === args.type)
        .map(([key, value]) => generateMetaPreview(value, key));

    return Promise.resolve({ metas: metas });
});

module.exports = builder.getInterface();

serveHTTP(builder.getInterface(), { port: 4000 });

console.log(`Stremio Discord Presence Addon is running on port 4000`);
