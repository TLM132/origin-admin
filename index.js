const express = require("express");
const fs = require("fs");
const path = require("path");
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Routes,
    REST
} = require("discord.js");
const { token } = require("./token");
let config = require("./config.json");

// ----------------------
// DISCORD BOT
// ----------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Simple global /config command deploy (run once or on startup)
const rest = new REST({ version: "10" }).setToken(token);
(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(client.application?.id || "1560857564433096766"),
            {
                body: [
                    {
                        name: "config",
                        description: "Open the Origin Admin dashboard"
                    }
                ]
            }
        );
        console.log("Slash command /config deployed.");
    } catch (e) {
        console.log("Could not deploy commands yet (bot not ready), ignore if already deployed.");
    }
})();

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "config") return;

    const embed = new EmbedBuilder()
        .setTitle("Origin Admin")
        .setDescription("Click below to open the web panel.")
        .setColor(0x2b2d31);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Open Dashboard")
            .setStyle(ButtonStyle.Link)
            .setURL(config.dashboard.url)
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
});

client.login(token);

// ----------------------
// DASHBOARD + API
// ----------------------
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// reload config from disk each time to avoid stale data
function loadConfig() {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
    return config;
}

function saveConfig(newConfig) {
    config = newConfig;
    fs.writeFileSync(
        path.join(__dirname, "config.json"),
        JSON.stringify(config, null, 4),
        "utf8"
    );
}

// serve dashboard
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// get config
app.get("/api/config", (req, res) => {
    const cfg = loadConfig();
    res.json(cfg);
});

// save config
app.post("/api/save", (req, res) => {
    saveConfig(req.body);
    res.json({ status: "ok" });
});

// resolve guild members (for username → ID)
app.get("/api/members", async (req, res) => {
    try {
        const cfg = loadConfig();
        const guild = await client.guilds.fetch(cfg.guildId);
        await guild.members.fetch(); // cache

        const members = guild.members.cache.map(m => ({
            id: m.id,
            username: m.user.username,
            tag: m.user.tag
        }));

        res.json(members);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

// resolve roles
app.get("/api/roles", async (req, res) => {
    try {
        const cfg = loadConfig();
        const guild = await client.guilds.fetch(cfg.guildId);
        const roles = guild.roles.cache.map(r => ({
            id: r.id,
            name: r.name
        }));
        res.json(roles);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

// resolve channels (for ticket category / panel channel)
app.get("/api/channels", async (req, res) => {
    try {
        const cfg = loadConfig();
        const guild = await client.guilds.fetch(cfg.guildId);
        const channels = guild.channels.cache
            .filter(c => c.isTextBased())
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type
            }));
        res.json(channels);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

// deploy ticket panel
app.post("/api/deployTicketPanel", async (req, res) => {
    try {
        const cfg = loadConfig();
        const guild = await client.guilds.fetch(cfg.guildId);
        const channel = await guild.channels.fetch(cfg.tickets.panelChannelId);

        const embed = new EmbedBuilder()
            .setTitle(cfg.tickets.panelName || "Tickets")
            .setDescription(cfg.tickets.panelDescription || "Open a ticket for support.")
            .setColor(0x2b2d31);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("open_ticket")
                .setLabel("Open Ticket")
                .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });

        res.json({ status: "deployed" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ status: "error", error: e.message });
    }
});

// staff points: add points
app.post("/api/addStaffPoints", async (req, res) => {
    const { userId, points } = req.body;
    const cfg = loadConfig();

    if (!cfg.staffPoints.members[userId]) {
        cfg.staffPoints.members[userId] = 0;
    }
    cfg.staffPoints.members[userId] += Number(points) || 0;

    saveConfig(cfg);
    res.json({ status: "ok", total: cfg.staffPoints.members[userId] });
});

// staff points: set requirement mode
app.post("/api/setRequirementMode", (req, res) => {
    const { mode } = req.body; // "day" | "week" | "month"
    const cfg = loadConfig();
    cfg.staffPoints.requirementMode = mode;
    saveConfig(cfg);
    res.json({ status: "ok" });
});

// staff points: set required points
app.post("/api/setRequiredPoints", (req, res) => {
    const { requiredPoints } = req.body;
    const cfg = loadConfig();
    cfg.staffPoints.requiredPoints = Number(requiredPoints) || 0;
    saveConfig(cfg);
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Dashboard + API running on port ${PORT}`);
});
