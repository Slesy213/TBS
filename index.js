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

// ==========================================
// PREMIUM LOGGER UTILITY
// ==========================================
const log = {
  info: (msg) => console.log(`\x1b[36m[BİLGİ] [${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[BAŞARILI] [${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[UYARI] [${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`),
  error: (msg, err) => console.error(`\x1b[31m[HATA] [${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`, err || '')
};

// ==========================================
// GLOBAL UNHANDLED ERROR HANDLERS (ANTI-CRASH)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err, origin) => {
  log.error('Uncaught Exception:', err);
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
  log.error('Uncaught Exception Monitor:', err);
});

// ==========================================
// EXPRESS WEB SERVER
// ==========================================
app.get('/status', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.send('Bot aktif ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log.success(`Web server aktif: ${PORT}`);
});

// ==========================================
// DISCORD CLIENT
// ==========================================
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

// ==========================================
// GLOBAL MAPS & VARIABLES
// ==========================================
global.autoRoles = new Map();
global.guardDurums = new Map();
global.guvenliListes = new Map();
global.spamMap = new Map();
global.ticketKategoris = new Map();
global.ticketYetkiliRols = new Map();
global.ticketLogKanals = new Map();
global.guardSettings = new Map();

// ==========================================
// DYNAMIC COMMAND LOADERS
// ==========================================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));

    // Slash command mapping
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      log.success(`Slash komut yüklendi: /${command.data.name}`);
    }
    // Prefix command mapping
    if (command.name && command.execute) {
      client.commands.set(command.name, command);
      log.success(`Prefix komut yüklendi: .${command.name}`);
    }
    else {
      log.warn(`Hatalı komut formatı atlandı: ${file}`);
    }

    // Initialize command events / listeners if exported
    if (command.init) {
      command.init(client);
      log.info(`Modül entegrasyonu yüklendi: ${file}`);
    }

  } catch (err) {
    log.error(`${file} komut dosyası yüklenemedi!`, err);
  }
}

// ==========================================
// BOT READY EVENT (PREMIUM STATUS ROTATION)
// ==========================================
client.once('ready', () => {
  log.success(`Bot hazır ve giriş yaptı: ${client.user.tag}`);

  // Dynamic Presence rotation
  const statuses = [
    () => ({ name: 'Slesy ile Sohbet Ediyor 💬', type: ActivityType.Watching }),
    () => ({ name: `${client.guilds.cache.size} Sunucuyu Koruyor 🛡️`, type: ActivityType.Watching }),
    () => ({ name: `${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} Üyeye Hizmet Veriyor 👥`, type: ActivityType.Watching }),
    () => ({ name: 'Premium Sistemler | /yardım 💎', type: ActivityType.Listening })
  ];

  let statusIdx = 0;
  setInterval(() => {
    try {
      const current = statuses[statusIdx]();
      client.user.setPresence({
        activities: [current],
        status: 'online'
      });
      statusIdx = (statusIdx + 1) % statuses.length;
    } catch (e) {
      log.error('Status rotation error:', e);
    }
  }, 15000);

  // Ses Kanalı Otomatik Kurtarma Sistemi (Restore Voice Connections)
  try {
    const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
    const { ChannelType } = require('discord.js');

    for (const [guildId, settings] of global.guardSettings.entries()) {
      if (settings && settings.voice_channel_restore_id) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(settings.voice_channel_restore_id);
        if (channel && channel.type === ChannelType.GuildVoice) {
          const selfMute = settings.voice_self_mute ?? false;
          const selfDeaf = settings.voice_self_deaf ?? true;

          log.info(`[SES RECOVERY] ${guild.name} sunucusunda ${channel.name} kanalına otomatik bağlanılıyor...`);
          
          try {
            const connection = joinVoiceChannel({
              channelId: channel.id,
              guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: selfDeaf,
              selfMute: selfMute,
            });

            entersState(connection, VoiceConnectionStatus.Ready, 5000)
              .then(() => {
                log.success(`[SES RECOVERY] ${guild.name} sunucusunda ses kanalı kurtarıldı: ${channel.name}`);
              })
              .catch(err => {
                log.error(`[SES RECOVERY] ${guild.name} ses kanalına bağlanırken zaman aşımı:`, err);
              });
          } catch (connErr) {
            log.error(`[SES RECOVERY] ${guild.name} ses kanalı bağlantı hatası:`, connErr);
          }
        }
      }
    }
  } catch (restoreErr) {
    log.error('[SES RECOVERY] Ses kanalı kurtarma döngüsünde hata:', restoreErr);
  }

  // Süreli Ban Kontrol Döngüsü (Temp-ban check scheduler - Every 60s)
  setInterval(async () => {
    try {
      const now = Date.now();
      for (const [guildId, settings] of global.guardSettings.entries()) {
        if (settings && settings.temp_bans && settings.temp_bans.length > 0) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;

          const activeBans = [];
          let updated = false;

          for (const banInfo of settings.temp_bans) {
            if (now >= banInfo.unbanAt) {
              // Unban time reached
              try {
                const bans = await guild.bans.fetch().catch(() => null);
                const isBanned = bans?.has(banInfo.userId);
                if (isBanned) {
                  await guild.members.unban(banInfo.userId, 'Süreli yasaklama süresi doldu.');
                  log.success(`[SÜRELİ BAN] ${guild.name} sunucusunda ${banInfo.userId} ID'li kullanıcının süreli banı bitti, unban yapıldı.`);

                  // Log to log channel
                  const logChannelId = global.ticketLogKanals.get(guildId);
                  const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
                  if (logChannel) {
                    const { EmbedBuilder } = require('discord.js');
                    const autoUnbanEmbed = new EmbedBuilder()
                      .setTitle('🔓 Süreli Yasaklama Sona Erdi')
                      .setColor('#2ECC71')
                      .setDescription(`<@${banInfo.userId}> kullanıcısının süreli yasaklama süresi dolduğu için yasağı otomatik olarak kaldırıldı.`)
                      .addFields(
                        { name: '👤 Kullanıcı ID', value: `\`${banInfo.userId}\``, inline: true },
                        { name: '📝 Orijinal Sebep', value: `\`${banInfo.reason || 'Belirtilmedi'}\``, inline: true }
                      )
                      .setTimestamp()
                      .setFooter({ text: 'TBS Otomatik Moderasyon Sistemi' });
                    await logChannel.send({ embeds: [autoUnbanEmbed] }).catch(() => {});
                  }
                }
              } catch (err) {
                log.error(`[SÜRELİ BAN] Unban hatası (User: ${banInfo.userId}, Sunucu: ${guild.name}):`, err);
              }
              updated = true;
            } else {
              activeBans.push(banInfo);
            }
          }

          if (updated) {
            settings.temp_bans = activeBans;
            global.guardSettings.set(guildId, settings);
            const { updateSetting } = require('./db.js');
            await updateSetting(guildId, 'guard_settings', settings);
          }
        }
      }
    } catch (loopErr) {
      log.error('[SÜRELİ BAN] Kontrol döngüsü hatası:', loopErr);
    }
  }, 60000);
});

// ==========================================
// AUTO ROLE EVENT (PASSED TO MODULAR COMMAND LISTENER)
// ==========================================
// Disabled in favor of commands/otorol.js modular init() handler

// ==========================================
// SA - AS RESPONDER
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const msg = message.content.trim();
  const saVariants = ['sa', 'saa', 'Sa', 'sA', 'SA', 'Saa', 'SAa', 'SAA'];

  if (saVariants.includes(msg)) {
    await message.reply('As Kardeşim! 👋').catch(() => {});
  }
});

// ==========================================
// PREFIX COMMAND PARSER
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const prefix = ".";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command || !command.execute) return;

  try {
    await command.execute(message, args, client);
  } catch (err) {
    log.error(`Prefix komut hatası (${commandName}):`, err);
  }
});

// ==========================================
// INTERACTION ROUTING & HANDLERS
// ==========================================
client.on('interactionCreate', async interaction => {
  try {
    // 1. SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (error) {
        log.error(`Slash komut hatası (/${interaction.commandName}):`, error);

        const errorMsg = {
          content: '❌ Komut yürütülürken sistemsel bir hata oluştu!',
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg).catch(() => {});
        } else {
          await interaction.reply(errorMsg).catch(() => {});
        }
      }
    }

    // 2. MODAL SUBMISSIONS
    else if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // DM GÖNDER Modal
      if (customId === 'dm_modal') {
        const command = client.commands.get('dm-gonder');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      // GÜNCELLEME YAYINLA Modal
      if (customId === 'guncelleme_modal') {
        const command = client.commands.get('guncelleme-yayinla');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      // OTOROL Modal
      if (customId === 'otorol_modal') {
        const command = client.commands.get('otorol');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      // TICKET Modals
      if (customId === 'ticket_modal' || customId === 'ticket_ekle_modal' || customId === 'ban_itiraz_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      // BAN İTİRAZ Modal
      if (customId === 'ban_itiraz_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleBanItirazModal === 'function') {
          return await command.handleBanItirazModal(interaction);
        }
      }

      // TICKET EKLE Modal
      if (customId === 'ticket_ekle_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleEkleModal === 'function') {
          return await command.handleEkleModal(interaction);
        }
      }

      // DUYURU Modal
      if (customId === 'duyuru_modal') {
        const command = client.commands.get('duyuru');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      // LIMIT GUARDS Modal
      if (customId.startsWith('modal_limit_')) {
        const command = client.commands.get('guard');
        if (command && typeof command.handleLimitModal === 'function') {
          return await command.handleLimitModal(interaction);
        }
      }
    }

    // 3. BUTTON CLICKS
    else if (interaction.isButton()) {
      const customId = interaction.customId;

      // Routing ticket welcome panel action buttons
      if (customId.startsWith('ticket_ac_') || customId === 'ticket_kapat' || customId === 'ticket_sahiplen' || customId === 'ticket_ekle') {
        const ticketCommand = client.commands.get('ticket');
        if (ticketCommand && typeof ticketCommand.handleButton === 'function') {
          return await ticketCommand.handleButton(interaction);
        }
      }

      // Routing voice connection control panel buttons
      if (customId.startsWith('join_')) {
        const voiceCommand = client.commands.get('join');
        if (voiceCommand && typeof voiceCommand.handleButton === 'function') {
          return await voiceCommand.handleButton(interaction);
        }
      }
    }

  } catch (err) {
    log.error('Etkileşim yönlendirme hatası:', err);
  }
});

// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
const { loadSettings } = require('./db.js');
const ticketManager = require('./ticketManager.js');
const pollManager = require('./pollManager.js');
const giveawayManager = require('./giveawayManager.js');

async function startBot() {
  try {
    await loadSettings();

    // Populate managers from global.guardSettings loaded from Supabase
    await ticketManager.loadFromSettings();
    await pollManager.loadFromSettings();
    await giveawayManager.loadFromSettings();
    log.success('Veritabanı hafıza yüklemesi (Supabase -> Cache) başarıyla tamamlandı.');

    await client.login(process.env.DISCORD_TOKEN);
  } catch (e) {
    log.error('Bot başlatma hatası:', e);
  }
}

startBot();
