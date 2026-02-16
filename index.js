require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");

const ytdl = require("ytdl-core");
const OpenAI = require("openai");

// ===============================
// CLIENT
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===============================
// OPENAI
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

// ===============================
// DATABASE (MEMORY)
// ===============================
let xp = {};
let coins = {};

// ===============================
// READY
// ===============================
client.on("ready", () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
});

// ===============================
// MESSAGE HANDLER
// ===============================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;

  // ===============================
  // XP + COINS
  // ===============================
  if (!xp[userId]) xp[userId] = 0;
  if (!coins[userId]) coins[userId] = 0;

  xp[userId]++;
  coins[userId]++;

  // ===============================
  // AUTO CHAT
  // ===============================
  if (message.content.toLowerCase() === "hi") {
    message.reply("Hello 👋 How can I help?");
  }

  // ===============================
  // AI CHAT (MENTION BOT)
  // ===============================
  if (message.mentions.has(client.user)) {
    try {
      await message.channel.sendTyping();

      const prompt = message.content
        .replace(`<@${client.user.id}>`, "")
        .trim();

      if (!prompt) return;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful Discord assistant."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 250
      });

      const reply =
        response.choices[0].message.content;

      message.reply(reply);

    } catch (err) {
      console.error(err);
      message.reply("❌ AI error.");
    }
  }

  // ===============================
  // COMMAND SYSTEM
  // ===============================
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // ===============================
  // HELP
  // ===============================
  if (cmd === "help") {
    message.reply(`
📖 COMMANDS

AI
@BotName <question>

MODERATION
!kick @user
!ban @user
!mute @user

LEVELS
!level
!balance

GIVEAWAY
!giveaway <minutes> <prize>

MUSIC
!join
!play <youtube link>
!stop

SHOP
!shop
!buy vip / custom

OTHER
!ping
    `);
  }

  // ===============================
  // PING
  // ===============================
  if (cmd === "ping") {
    message.reply(`🏓 ${client.ws.ping}ms`);
  }

  // ===============================
  // LEVELS
  // ===============================
  if (cmd === "level") {
    message.reply(`⭐ XP: ${xp[userId]}`);
  }

  if (cmd === "balance") {
    message.reply(`💰 Coins: ${coins[userId]}`);
  }

  // ===============================
  // MODERATION
  // ===============================
  if (cmd === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ No permission");

    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag user");

    await member.kick();
    message.reply(`✅ Kicked ${member.user.tag}`);
  }

  if (cmd === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ No permission");

    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag user");

    await member.ban();
    message.reply(`✅ Banned ${member.user.tag}`);
  }

  if (cmd === "mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ No permission");

    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag user");

    await member.timeout(10 * 60 * 1000);
    message.reply(`🔇 Muted ${member.user.tag}`);
  }

  // ===============================
  // GIVEAWAY
  // ===============================
  if (cmd === "giveaway") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("❌ Admin only");

    const time = parseInt(args[0]);
    const prize = args.slice(1).join(" ");

    if (!time || !prize)
      return message.reply("!giveaway <minutes> <prize>");

    const msg = await message.channel.send(`
🎉 GIVEAWAY 🎉

Prize: ${prize}
React 🎉
Ends in ${time} min
    `);

    await msg.react("🎉");

    setTimeout(async () => {
      const fetched = await msg.fetch();
      const users = await fetched.reactions.cache
        .get("🎉")
        .users.fetch();

      const entries = users.filter(u => !u.bot);

      if (!entries.size)
        return message.channel.send("No entries");

      const winner = entries.random();

      message.channel.send(
        `🏆 ${winner} won **${prize}**`
      );
    }, time * 60000);
  }

  // ===============================
  // SHOP
  // ===============================
  if (cmd === "shop") {
    message.reply(`
🛒 SHOP

VIP - 100 coins
Custom - 200 coins

!buy vip / custom
    `);
  }

  if (cmd === "buy") {
    const item = args[0];

    if (!item) return;

    if (item === "vip") {
      if (coins[userId] < 100)
        return message.reply("❌ Not enough");

      coins[userId] -= 100;
      message.reply("✅ VIP bought");
    }

    if (item === "custom") {
      if (coins[userId] < 200)
        return message.reply("❌ Not enough");

      coins[userId] -= 200;
      message.reply("✅ Custom bought");
    }
  }

  // ===============================
  // MUSIC
  // ===============================
  if (cmd === "join") {
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC first");

    joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator
    });

    message.reply("🎵 Joined");
  }

  if (cmd === "play") {
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC");

    const url = args[0];
    if (!ytdl.validateURL(url))
      return message.reply("Invalid link");

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator
    });

    const stream = ytdl(url, {
      filter: "audioonly",
      highWaterMark: 1 << 25
    });

    const player = createAudioPlayer();
    const resource = createAudioResource(stream);

    player.play(resource);
    connection.subscribe(player);

    message.reply("▶️ Playing");

    player.on(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });
  }

  if (cmd === "stop") {
    if (!message.guild.members.me.voice.channel) return;

    message.guild.members.me.voice.disconnect();
    message.reply("⏹️ Stopped");
  }
});

// ===============================
// LOGIN
// ===============================
client.login(process.env.TOKEN);
