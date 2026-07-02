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
// DB IMPORT
// ==========================================
const db = require('./db.js');

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
    else if (command.name && command.execute) {
      client.commands.set(command.name, command);
      log.success(`Prefix komut yüklendi: .${command.name}`);
    }

    // Invalid format
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
// BOT READY EVENT
// ==========================================
client.once('clientReady', () => {
  log.success(`Bot hazır ve giriş yaptı: ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: 'KERİŞHANEDE KERİŞİYOR',
        type: ActivityType.Playing
      }
    ],
    status: 'online'
  });

  // Ses Kanalı Otomatik Kurtarma Sistemi
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

  // Süreli Ban Kontrol Döngüsü
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
              try {
                const bans = await guild.bans.fetch().catch(() => null);
                const isBanned = bans?.has(banInfo.userId);
                if (isBanned) {
                  await guild.members.unban(banInfo.userId, 'Süreli yasaklama süresi doldu.');
                  log.success(`[SÜRELİ BAN] ${guild.name} sunucusunda ${banInfo.userId} ID'li kullanıcının süreli banı bitti, unban yapıldı.`);

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
            await db.updateSetting(guildId, 'guard_settings', settings);
          }
        }
      }
    } catch (loopErr) {
      log.error('[SÜRELİ BAN] Kontrol döngüsü hatası:', loopErr);
    }
  }, 60000);
});

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
// ⭐ MESAJ PUAN SİSTEMİ
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  // Kullanıcı bilgilerini güncelle
  await db.updateUserInfo(message.author, message.guild.id);

  // Mesaj puanı ekle
  const result = await db.addMessagePoint(message.author.id, message.guild.id);
  
  if (result.added) {
    // Level kontrolü
    const levelResult = await db.checkAndUpdateLevel(message.author.id, message.guild.id, result.total);
    
    if (levelResult.leveledUp) {
      // Level atlama mesajı gönder
      try {
        const levelUpMessage = await message.channel.send(
          `🎉 **${message.author.username}** seviye atladı! **${levelResult.oldLevel}** → **${levelResult.newLevel}** seviye! (${levelResult.points} puan)`
        );
        
        // 2 saniye sonra mesajı sil
        setTimeout(async () => {
          try {
            await levelUpMessage.delete();
          } catch (err) {
            // Mesaj zaten silinmiş olabilir
          }
        }, 2000);
      } catch (err) {
        log.error('Level atlama mesajı gönderilirken hata:', err);
      }
    }
  }
});

// ==========================================
// ⭐ SES PUAN SİSTEMİ
// ==========================================
// Ses kanalına giriş
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const userId = member.user.id;
  const guildId = member.guild.id;

  // Kullanıcı bilgilerini güncelle
  await db.updateUserInfo(member.user, guildId);

  // Ses kanalına girdi
  if (!oldState.channelId && newState.channelId) {
    // Başlangıç zamanını kaydet
    await db.updateUserPoints(userId, guildId, {
      voice_join_time: Date.now()
    });
  }

  // Ses kanalından çıktı veya kanal değiştirdi
  if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
    const points = await db.getUserPoints(userId, guildId);
    
    if (points && points.voice_join_time > 0) {
      const duration = Math.floor((Date.now() - points.voice_join_time) / 1000);
      
      if (duration >= 60) {
        const result = await db.addVoicePoints(userId, guildId, duration);
        
        if (result.added) {
          log.info(`🎤 ${member.user.username} ses kanalında ${Math.floor(duration/60)} dakika durdu, +${result.points} puan kazandı!`);
          
          // Level kontrolü
          const totalPoints = await db.getUserPoints(userId, guildId);
          if (totalPoints) {
            const levelResult = await db.checkAndUpdateLevel(userId, guildId, totalPoints.total_points);
            
            if (levelResult.leveledUp) {
              // Level atlama mesajını genel bir kanala gönder
              const generalChannel = member.guild.channels.cache
                .filter(ch => ch.isTextBased())
                .sort((a, b) => a.position - b.position)
                .first();
              
              if (generalChannel) {
                try {
                  const levelUpMessage = await generalChannel.send(
                    `🎉 **${member.user.username}** seviye atladı! **${levelResult.oldLevel}** → **${levelResult.newLevel}** seviye! (${levelResult.points} puan)`
                  );
                  
                  setTimeout(async () => {
                    try {
                      await levelUpMessage.delete();
                    } catch (err) {}
                  }, 2000);
                } catch (err) {
                  log.error('Level atlama mesajı gönderilirken hata:', err);
                }
              }
            }
          }
        }
      }

      // Ses zamanını sıfırla
      await db.updateUserPoints(userId, guildId, {
        voice_join_time: 0
      });
    }
  }
});

// Her 60 saniyede bir ses kanalındakilere puan ver (yedek mekanizma)
setInterval(async () => {
  try {
    for (const [guildId, guild] of client.guilds.cache) {
      for (const [channelId, channel] of guild.channels.cache) {
        if (channel.isVoiceBased()) {
          for (const [memberId, member] of channel.members) {
            if (member.user.bot) continue;

            const points = await db.getUserPoints(memberId, guildId);
            
            if (points && points.voice_join_time > 0) {
              const duration = Math.floor((Date.now() - points.voice_join_time) / 1000);
              
              if (duration >= 60) {
                const result = await db.addVoicePoints(memberId, guildId, duration);
                
                if (result.added) {
                  // Level kontrolü
                  const totalPoints = await db.getUserPoints(memberId, guildId);
                  if (totalPoints) {
                    const levelResult = await db.checkAndUpdateLevel(memberId, guildId, totalPoints.total_points);
                    
                    if (levelResult.leveledUp) {
                      const generalChannel = guild.channels.cache
                        .filter(ch => ch.isTextBased())
                        .sort((a, b) => a.position - b.position)
                        .first();
                      
                      if (generalChannel) {
                        try {
                          const levelUpMessage = await generalChannel.send(
                            `🎉 **${member.user.username}** seviye atladı! **${levelResult.oldLevel}** → **${levelResult.newLevel}** seviye! (${levelResult.points} puan)`
                          );
                          
                          setTimeout(async () => {
                            try {
                              await levelUpMessage.delete();
                            } catch (err) {}
                          }, 2000);
                        } catch (err) {
                          log.error('Level atlama mesajı gönderilirken hata:', err);
                        }
                      }
                    }
                  }
                  
                  // Ses zamanını sıfırla
                  await db.updateUserPoints(memberId, guildId, {
                    voice_join_time: Date.now()
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    log.error('Ses puanı periyodik kontrol hatası:', err);
  }
}, 60000);

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

      if (customId === 'dm_modal') {
        const command = client.commands.get('dm-gonder');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      if (customId === 'guncelleme_modal') {
        const command = client.commands.get('guncelleme-yayinla');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      if (customId === 'otorol_modal') {
        const command = client.commands.get('otorol');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      if (customId === 'ticket_modal' || customId === 'ticket_ekle_modal' || customId === 'ban_itiraz_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

      if (customId === 'ban_itiraz_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleBanItirazModal === 'function') {
          return await command.handleBanItirazModal(interaction);
        }
      }

      if (customId === 'ticket_ekle_modal') {
        const command = client.commands.get('ticket');
        if (command && typeof command.handleEkleModal === 'function') {
          return await command.handleEkleModal(interaction);
        }
      }

      if (customId === 'duyuru_modal') {
        const command = client.commands.get('duyuru');
        if (command && typeof command.handleModal === 'function') {
          return await command.handleModal(interaction);
        }
      }

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

      // Ticket button
      if (customId.startsWith('ticket_ac_') || customId === 'ticket_kapat' || customId === 'ticket_sahiplen' || customId === 'ticket_ekle') {
        const ticketCommand = client.commands.get('ticket');
        if (ticketCommand && typeof ticketCommand.handleButton === 'function') {
          return await ticketCommand.handleButton(interaction);
        }
      }

      // Voice join button
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
async function startBot() {
  try {
    await db.loadSettings();
    log.success('Veritabanı hafıza yüklemesi (Supabase -> Cache) başarıyla tamamlandı.');

    await client.login(process.env.DISCORD_TOKEN);
  } catch (e) {
    log.error('Bot başlatma hatası:', e);
  }
}

startBot();
