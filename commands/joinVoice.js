const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior
} = require('@discordjs/voice');

const { updateSetting } = require('../db.js');

// Ses bağlantılarını takip etmek için global map
global.voiceConnections = global.voiceConnections || new Map();
global.voiceKeepAlive = global.voiceKeepAlive || new Map();

/**
 * Botu ses kanalında tutmak için keep-alive mekanizması
 */
function startKeepAlive(guildId, channelId) {
  // Eski keep-alive'ı temizle
  if (global.voiceKeepAlive.has(guildId)) {
    clearInterval(global.voiceKeepAlive.get(guildId));
    global.voiceKeepAlive.delete(guildId);
  }

  // Her 30 saniyede bir kontrol et
  const interval = setInterval(async () => {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      // Bağlantı yoksa keep-alive'ı durdur
      clearInterval(interval);
      global.voiceKeepAlive.delete(guildId);
      return;
    }

    const state = connection.state;
    if (state.status === VoiceConnectionStatus.Ready) {
      // Bağlantı canlı, bir şey yapma
      return;
    }

    if (state.status === VoiceConnectionStatus.Destroyed || 
        state.status === VoiceConnectionStatus.Disconnected) {
      // Bağlantı koptu, yeniden bağlanmayı dene
      const settings = global.guardSettings.get(guildId) || {};
      const restoreChannelId = settings.voice_channel_restore_id || channelId;
      
      if (restoreChannelId) {
        try {
          const guild = global.client?.guilds.cache.get(guildId);
          if (!guild) return;

          const channel = guild.channels.cache.get(restoreChannelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return;

          const selfMute = settings.voice_self_mute ?? false;
          const selfDeaf = settings.voice_self_deaf ?? true;

          joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });

          console.log(`[SES KEEP-ALIVE] ${guild.name} sunucusunda yeniden bağlanıldı.`);
        } catch (err) {
          console.error('[SES KEEP-ALIVE] Yeniden bağlanma hatası:', err);
        }
      }
    }
  }, 30000); // Her 30 saniye

  global.voiceKeepAlive.set(guildId, interval);
}

/**
 * Premium voice status embed panel
 */
function buildVoicePanel(guild, channelId, selfMute, selfDeaf, statusMessage, client) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const connection = getVoiceConnection(guild.id);
  const isConnected = connection && connection.state.status === VoiceConnectionStatus.Ready;
  
  if (!channel || !isConnected) {
    const embed = new EmbedBuilder()
      .setTitle('🎙️ Ses Bağlantı Paneli')
      .setDescription(`🔴 **Herhangi bir ses kanalına bağlı değil.**\n\n**Durum:** ${statusMessage || 'Bağlantı yok'}`)
      .setColor('#ED4245')
      .setTimestamp()
      .setFooter({ text: 'TBS Ses Yönetim Paneli' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join_reconnect')
        .setLabel('🔄 Yeniden Bağlan')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('join_leave')
        .setLabel('🚪 Ayrıl')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    return { embeds: [embed], components: [row] };
  }

  const listenersCount = channel.members.filter(m => !m.user.bot).size;
  const limitText = channel.userLimit === 0 ? 'Sınırsız' : `${channel.userLimit}`;
  const bitrateText = `${channel.bitrate / 1000} kbps`;

  // Latency hesapla
  let ping = 'Bilinmiyor';
  if (connection && connection.ping) {
    const wsPing = connection.ping.ws;
    const udpPing = connection.ping.udp;
    if (udpPing !== undefined || wsPing !== undefined) {
      ping = `${udpPing ?? wsPing}ms`;
    }
  }
  if (ping === 'Bilinmiyor' && client) {
    ping = `${client.ws.ping}ms (API)`;
  }

  // Bağlantı süresi
  const uptime = connection?.state?.readyAt ? 
    Math.floor((Date.now() - connection.state.readyAt) / 1000) : 0;
  const uptimeText = uptime > 0 ? 
    `${Math.floor(uptime / 60)} dakika ${uptime % 60} saniye` : 
    'Yeni bağlandı';

  const embed = new EmbedBuilder()
    .setTitle('🎙️ Ses Bağlantı Paneli')
    .setDescription('Bot ses kanalına bağlandı. Aşağıdaki kontrollerle yönetebilirsiniz.')
    .setColor('#5865F2')
    .setThumbnail(guild.iconURL({ dynamic: true }) || client?.user.avatarURL())
    .addFields(
      { name: '🔊 Ses Kanalı', value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
      { name: '⚡ Bit Hızı', value: `\`${bitrateText}\``, inline: true },
      { name: '📶 Gecikme', value: `\`${ping}\``, inline: true },
      { name: '👥 Dinleyici', value: `\`${listenersCount} / ${limitText}\``, inline: true },
      { name: '⏱️ Bağlantı Süresi', value: `\`${uptimeText}\``, inline: true },
      { name: '🎙️ Susturma', value: selfMute ? '🔴 **Susturulmuş**' : '🟢 **Açık**', inline: true },
      { name: '🎧 Sağırlaştırma', value: selfDeaf ? '🔴 **Sağır**' : '🟢 **Açık**', inline: true },
      { name: '📊 Bağlantı Durumu', value: `\`${statusMessage || '✅ Aktif'}\``, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'TBS Ses Yönetim Paneli', iconURL: client?.user.avatarURL() });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('join_toggle_mute')
      .setLabel(selfMute ? '🎙️ Sesi Aç' : '🎙️ Sustur')
      .setStyle(selfMute ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('join_toggle_deafen')
      .setLabel(selfDeaf ? '🎧 Kulaklığı Aç' : '🎧 Sağırlaştır')
      .setStyle(selfDeaf ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('join_reconnect')
      .setLabel('🔄 Yeniden Bağlan')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('join_leave')
      .setLabel('🚪 Ayrıl')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Botu istediğin ses kanalına bağlar (otomatik yeniden bağlanma özelliği ile)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(option =>
      option
        .setName('kanal')
        .setDescription('Girmesini istediğin ses kanalı')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: '❌ Bu komutu kullanmak için "Kanalları Yönet" yetkisine sahip olmalısın!',
        ephemeral: true,
      });
    }

    const targetChannel =
      interaction.options.getChannel('kanal') ??
      interaction.member?.voice?.channel;

    if (!targetChannel) {
      return interaction.reply({
        content: '❌ Bir ses kanalında değilsin veya kanal belirtmedin!',
        ephemeral: true,
      });
    }

    if (targetChannel.type !== ChannelType.GuildVoice) {
      return interaction.reply({
        content: '❌ Lütfen geçerli bir ses kanalı seçin!',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const settings = global.guardSettings.get(guildId) || {};
    const selfMute = settings.voice_self_mute ?? false;
    const selfDeaf = settings.voice_self_deaf ?? true;

    try {
      // Mevcut bağlantıyı temizle
      const oldConnection = getVoiceConnection(guildId);
      if (oldConnection) {
        try {
          oldConnection.destroy();
        } catch (e) {}
      }

      // Yeni bağlantı oluştur
      const connection = joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: selfDeaf,
        selfMute: selfMute,
      });

      // Bağlantının hazır olmasını bekle
      await entersState(connection, VoiceConnectionStatus.Ready, 10000);

      // Ayarları kaydet
      settings.voice_channel_restore_id = targetChannel.id;
      settings.voice_self_mute = selfMute;
      settings.voice_self_deaf = selfDeaf;
      global.guardSettings.set(guildId, settings);
      await updateSetting(guildId, 'guard_settings', settings);

      // Keep-alive başlat
      startKeepAlive(guildId, targetChannel.id);

      // Client'ı global olarak kaydet (keep-alive için)
      global.client = interaction.client;

      const panel = buildVoicePanel(
        interaction.guild, 
        targetChannel.id, 
        selfMute, 
        selfDeaf, 
        '✅ Bağlantı başarılı - Otomatik yeniden bağlanma aktif',
        interaction.client
      );
      await interaction.editReply(panel);

    } catch (error) {
      console.error('Ses kanalına bağlanırken hata:', error);
      const connection = getVoiceConnection(guildId);
      if (connection) {
        try {
          connection.destroy();
        } catch (e) {}
      }

      settings.voice_channel_restore_id = null;
      global.guardSettings.set(guildId, settings);
      await updateSetting(guildId, 'guard_settings', settings);

      // Keep-alive'ı durdur
      if (global.voiceKeepAlive.has(guildId)) {
        clearInterval(global.voiceKeepAlive.get(guildId));
        global.voiceKeepAlive.delete(guildId);
      }

      await interaction.editReply({
        content: '❌ Ses kanalına bağlanırken hata oluştu. Botun izinlerini ve kanal limitlerini kontrol edin!',
      });
    }
  },

  async handleButton(interaction) {
    const guildId = interaction.guild.id;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: '❌ Bu paneli yönetmek için "Kanalları Yönet" yetkisine sahip olmalısın!',
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    const settings = global.guardSettings.get(guildId) || {};
    let selfMute = settings.voice_self_mute ?? false;
    let selfDeaf = settings.voice_self_deaf ?? true;
    let restoreChannelId = settings.voice_channel_restore_id;

    let connection = getVoiceConnection(guildId);
    const customId = interaction.customId;

    try {
      if (customId === 'join_toggle_mute') {
        selfMute = !selfMute;
        settings.voice_self_mute = selfMute;
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        if (connection && restoreChannelId) {
          // Bağlantıyı yeniden oluştur (mute durumunu güncellemek için)
          try {
            connection.destroy();
          } catch (e) {}
          
          connection = joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });
          await entersState(connection, VoiceConnectionStatus.Ready, 5000);
        }
      } 
      else if (customId === 'join_toggle_deafen') {
        selfDeaf = !selfDeaf;
        settings.voice_self_deaf = selfDeaf;
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        if (connection && restoreChannelId) {
          try {
            connection.destroy();
          } catch (e) {}
          
          connection = joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });
          await entersState(connection, VoiceConnectionStatus.Ready, 5000);
        }
      } 
      else if (customId === 'join_reconnect') {
        if (restoreChannelId) {
          // Eski bağlantıyı temizle
          if (connection) {
            try {
              connection.destroy();
            } catch (e) {}
          }

          // Yeniden bağlan
          connection = joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });

          await entersState(connection, VoiceConnectionStatus.Ready, 10000);
          
          // Keep-alive'ı yeniden başlat
          startKeepAlive(guildId, restoreChannelId);
        } else {
          // Kanal ID yoksa hata ver
          const panel = buildVoicePanel(
            interaction.guild, 
            null, 
            selfMute, 
            selfDeaf, 
            '❌ Kayıtlı kanal bulunamadı!',
            interaction.client
          );
          return await interaction.editReply(panel);
        }
      } 
      else if (customId === 'join_leave') {
        // Bağlantıyı kes
        if (connection) {
          try {
            connection.destroy();
          } catch (e) {}
        }
        
        // Ayarları temizle
        settings.voice_channel_restore_id = null;
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);
        restoreChannelId = null;
        connection = null;

        // Keep-alive'ı durdur
        if (global.voiceKeepAlive.has(guildId)) {
          clearInterval(global.voiceKeepAlive.get(guildId));
          global.voiceKeepAlive.delete(guildId);
        }
      }

      // Bağlantı durumunu kontrol et
      const isConnected = connection && connection.state.status === VoiceConnectionStatus.Ready;
      const statusMsg = isConnected ? 
        '✅ Bağlantı aktif - Otomatik yeniden bağlanma çalışıyor' : 
        '🔴 Bağlantı kesildi - Yeniden bağlanmak için "Yeniden Bağlan" butonuna tıkla';

      const panel = buildVoicePanel(
        interaction.guild, 
        restoreChannelId, 
        selfMute, 
        selfDeaf, 
        statusMsg, 
        interaction.client
      );
      await interaction.editReply(panel);

    } catch (err) {
      console.error('Ses paneli etkileşim hatası:', err);
      
      // Hata durumunda paneli güncelle
      const statusMsg = `❌ Hata: ${err.message}`;
      const panel = buildVoicePanel(
        interaction.guild, 
        restoreChannelId, 
        selfMute, 
        selfDeaf, 
        statusMsg, 
        interaction.client
      );
      await interaction.editReply(panel).catch(() => {});
    }
  },

  // Bot başlangıcında mevcut bağlantıları kurtar
  init(client) {
    global.client = client;
    
    // Her 30 saniyede bir tüm bağlantıları kontrol et
    setInterval(() => {
      for (const [guildId, settings] of global.guardSettings.entries()) {
        if (settings && settings.voice_channel_restore_id) {
          const connection = getVoiceConnection(guildId);
          
          // Bağlantı yoksa veya kopmuşsa yeniden bağlan
          if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(settings.voice_channel_restore_id);
            if (!channel || channel.type !== ChannelType.GuildVoice) continue;

            const selfMute = settings.voice_self_mute ?? false;
            const selfDeaf = settings.voice_self_deaf ?? true;

            try {
              joinVoiceChannel({
                channelId: channel.id,
                guildId: guildId,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: selfDeaf,
                selfMute: selfMute,
              });
              console.log(`[SES KURTARMA] ${guild.name} sunucusunda ses bağlantısı kurtarıldı.`);
              
              // Keep-alive başlat
              startKeepAlive(guildId, channel.id);
            } catch (err) {
              console.error(`[SES KURTARMA] ${guild.name} sunucusunda hata:`, err);
            }
          }
        }
      }
    }, 60000); // Her 60 saniye
  }
};
