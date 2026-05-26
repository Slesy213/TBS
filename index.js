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

global.autoRoleId = null;
global.guardDurum = false;

// =========================
// KOMUTLAR
// =========================

const commandsPath =
  path.join(__dirname, 'commands');

const commandFiles =
  fs.readdirSync(commandsPath)
    .filter(f => f.endsWith('.js'));

for (const file of commandFiles) {

  const command =
    require(path.join(commandsPath, file));

  client.commands.set(
    command.name || command.data?.name,
    command
  );
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
// OTO ROL SİSTEMİ
// =========================

client.on('guildMemberAdd', async member => {

  if (!global.autoRoleId) return;

  const role =
    member.guild.roles.cache.get(
      global.autoRoleId
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

  const msg = message.content.trim();

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

  if (saVariantlari.includes(msg)) {

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

  if (!message.content.startsWith(prefix)) return;

  const args = message.content
    .slice(prefix.length)
    .trim()
    .split(/ +/);

  const commandName =
    args.shift().toLowerCase();

  const command =
    client.commands.get(commandName);

  if (!command) return;

  if (!command.execute) return;

  try {

    command.execute(
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

  if (interaction.isChatInputCommand()) {

    const command =
      client.commands.get(
        interaction.commandName
      );

    if (!command) return;

    try {

      await command.execute(interaction);

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

  if (interaction.isModalSubmit()) {

    if (interaction.customId === 'dm_modal') {

      const command =
        client.commands.get('dm-gonder');

      if (command?.handleModal) {

        try {

          await command.handleModal(
            interaction
          );

        } catch (e) {

          console.error(e);
        }
      }
    }

    if (
      interaction.customId ===
      'ticket_modal'
    ) {

      const command =
        client.commands.get(
          'ticket-kur'
        );

      if (command?.handleModal) {

        try {

          await command.handleModal(
            interaction
          );

        } catch (e) {

          console.error(e);
        }
      }
    }

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

        try {

          await command.handleBanItirazModal(
            interaction
          );

        } catch (e) {

          console.error(e);
        }
      }
    }

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

        try {

          await command.handleEkleModal(
            interaction
          );

        } catch (e) {

          console.error(e);
        }
      }
    }

    if (
      interaction.customId ===
      'duyuru_modal'
    ) {

      const command =
        client.commands.get(
          'duyuru'
        );

      if (command?.handleModal) {

        try {

          await command.handleModal(
            interaction
          );

        } catch (e) {

          console.error(e);
        }
      }
    }
  }

  // =========================
  // BUTTON
  // =========================

  if (interaction.isButton()) {

    const ticket =
      client.commands.get(
        'ticket-kur'
      );

    if (
      interaction.customId.startsWith(
        'ticket_ac_'
      )
    ) {

      try {

        await ticket?.handleButton(
          interaction
        );

      } catch (e) {

        console.error(e);
      }
    }

    if (
      interaction.customId ===
      'ticket_kapat'
    ) {

      try {

        await ticket?.handleKapat(
          interaction
        );

      } catch (e) {

        console.error(e);
      }
    }

    if (
      interaction.customId ===
      'ticket_sahiplen'
    ) {

      try {

        await ticket?.handleSahiplen(
          interaction
        );

      } catch (e) {

        console.error(e);
      }
    }

    if (
      interaction.customId ===
      'ticket_ekle'
    ) {

      try {

        await ticket?.handleEkle(
          interaction
        );

      } catch (e) {

        console.error(e);
      }
    }
  }
});

// =========================
// LOGIN
// =========================

client.login(
  process.env.DISCORD_TOKEN
);
