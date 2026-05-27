require('dotenv').config();

const express = require('express');
const app = express();

const {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// =========================
// EXPRESS WEB SERVER
// =========================

app.get('/status', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.send('Bot aktif ✅');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Web server aktif: ${PORT}`);
});

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// =========================
// GLOBAL DEĞİŞKENLER
// =========================

global.autoRoles = new Map();
global.guardDurums = new Map();
global.guvenliListes = new Map();
global.spamMap = new Map();
global.ticketKategoris = new Map();
global.ticketYetkiliRols = new Map();
global.ticketLogKanals = new Map();

// =========================
// KOMUTLAR
// =========================

const commandsPath =
  path.join(__dirname, 'commands');

const commandFiles =
  fs.readdirSync(commandsPath)
    .filter(f => f.endsWith('.js'));

for (const file of commandFiles) {

  try {

    const command =
      require(path.join(commandsPath, file));

    // SLASH KOMUT

    if (command.data && command.execute) {

      client.commands.set(
        command.data.name,
        command
      );

      console.log(
        `✅ Slash yüklendi: ${command.data.name}`
      );
    }

    // PREFIX KOMUT

    else if (command.name && command.execute) {

      client.commands.set(
        command.name,
        command
      );

      console.log(
        `✅ Prefix yüklendi: ${command.name}`
      );
    }

    else {

      console.log(
        `❌ Hatalı komut dosyası: ${file}`
      );
    }

    // =========================
    // GUARD INIT
    // =========================

    if (command.init) {

      command.init(client);

      console.log(
        `🛡️ Guard eventleri yüklendi: ${file}`
      );
    }

  } catch (err) {

    console.log(`❌ ${file} yüklenemedi:`);

    console.error(err);
  }
}

// =========================
// BOT HAZIR
// =========================

client.once('ready', () => {

  console.log(
    `✅ Bot hazır: ${client.user.tag}`
  );

  client.user.setPresence({

    activities: [
      {
        name:
          'Slesy ile Sohbet Ediyor ✅',

        type: ActivityType.Watching,
      }
    ],

    status: 'online',
  });
});

// =========================
// OTO ROL
// =========================

client.on('guildMemberAdd', async member => {

  const autoRoleId = global.autoRoles.get(member.guild.id);
  if (!autoRoleId) return;

  const role =
    member.guild.roles.cache.get(
      autoRoleId
    );

  if (!role) return;

  try {

    await member.roles.add(role);

    console.log(
      `✅ ${member.user.tag} kullanıcısına oto rol verildi.`
    );

  } catch (err) {

    console.log(err);
  }
});

// =========================
// SA AS
// =========================

client.on('messageCreate', async message => {

  if (message.author.bot) return;

  const msg =
    message.content.trim();

  const saVariantlari = [
    'sa',
    'saa',
    'Sa',
    'sA',
    'SA',
    'Saa',
    'SAa',
    'SAA'
  ];

  if (
    saVariantlari.includes(msg)
  ) {

    await message.reply(
      'As Kardeşim! 👋'
    );
  }
});

// =========================
// PREFIX KOMUT SİSTEMİ
// =========================

client.on('messageCreate', async message => {

  if (message.author.bot) return;

  const prefix = ".";

  if (
    !message.content.startsWith(prefix)
  ) return;

  const args =
    message.content
      .slice(prefix.length)
      .trim()
      .split(/ +/);

  const commandName =
    args.shift()?.toLowerCase();

  if (!commandName) return;

  const command =
    client.commands.get(commandName);

  if (!command) return;

  if (!command.execute) return;

  try {

    await command.execute(
      message,
      args,
      client
    );

  } catch (err) {

    console.error(err);
  }
});

// =========================
// INTERACTION
// =========================

client.on('interactionCreate', async interaction => {

  // =========================
  // SLASH KOMUT
  // =========================

  if (
    interaction.isChatInputCommand()
  ) {

    const command =
      client.commands.get(
        interaction.commandName
      );

    if (!command) return;

    try {

      await command.execute(
        interaction,
        client
      );

    } catch (error) {

      console.error(error);

      const msg = {
        content: '❌ Hata oluştu!',
        ephemeral: true
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction.followUp(msg);

      } else {

        await interaction.reply(msg);
      }
    }
  }

  // =========================
  // MODAL
  // =========================

  if (
    interaction.isModalSubmit()
  ) {

    try {

      // DM MODAL

      if (
        interaction.customId ===
        'dm_modal'
      ) {

        const command =
          client.commands.get(
            'dm-gonder'
          );

        if (
          command?.handleModal
        ) {

          return await command.handleModal(
            interaction
          );
        }
      }

      // TICKET MODAL

      if (
        interaction.customId ===
        'ticket_modal'
      ) {

        const command =
          client.commands.get(
            'ticket-kur'
          );

        if (
          command?.handleModal
        ) {

          return await command.handleModal(
            interaction
          );
        }
      }

      // BAN İTİRAZ

      if (
        interaction.customId ===
        'ban_itiraz_modal'
      ) {

        const command =
          client.commands.get(
            'ticket-kur'
          );

        if (
          command?.handleBanItirazModal
        ) {

          return await command.handleBanItirazModal(
            interaction
          );
        }
      }

      // TICKET EKLE

      if (
        interaction.customId ===
        'ticket_ekle_modal'
      ) {

        const command =
          client.commands.get(
            'ticket-kur'
          );

        if (
          command?.handleEkleModal
        ) {

          return await command.handleEkleModal(
            interaction
          );
        }
      }

      // DUYURU

      if (
        interaction.customId ===
        'duyuru_modal'
      ) {

        const command =
          client.commands.get(
            'duyuru'
          );

        if (
          command?.handleModal
        ) {

          return await command.handleModal(
            interaction
          );
        }
      }

    } catch (e) {

      console.error(e);
    }
  }

  // =========================
  // BUTTON
  // =========================

  if (
    interaction.isButton()
  ) {

    const ticket =
      client.commands.get(
        'ticket-kur'
      );

    try {

      // TICKET AÇ

      if (
        interaction.customId.startsWith(
          'ticket_ac_'
        )
      ) {

        return await ticket?.handleButton(
          interaction
        );
      }

      // KAPAT

      if (
        interaction.customId ===
        'ticket_kapat'
      ) {

        return await ticket?.handleKapat(
          interaction
        );
      }

      // SAHİPLEN

      if (
        interaction.customId ===
        'ticket_sahiplen'
      ) {

        return await ticket?.handleSahiplen(
          interaction
        );
      }

      // EKLE

      if (
        interaction.customId ===
        'ticket_ekle'
      ) {

        return await ticket?.handleEkle(
          interaction
        );
      }

    } catch (e) {

      console.error(e);
    }
  }
});

// =========================
// LOGIN
// =========================

const { loadSettings } = require('./db.js');

async function startBot() {
  await loadSettings();
  client.login(process.env.DISCORD_TOKEN);
}

startBot();
