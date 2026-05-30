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
} = require('@discordjs/voice');

const { updateSetting } = require('../db.js');

/**
 * Creates the premium voice status embed panel and control buttons
 */
function buildVoicePanel(guild, channelId, selfMute, selfDeaf, statusMessage, client) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    const embed = new EmbedBuilder()
      .setTitle('🎙️ Ses Bağlantı Paneli')
      .setDescription(`🔴 **Herhangi bir ses kanalına bağlı değil.**\n\n**Açıklama:** ${statusMessage}`)
      .setColor('#ED4245')
      .setTimestamp()
      .setFooter({ text: 'TBS Ses Yönetim Paneli' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join_reconnect')
        .setLabel('🔄 Yeniden Bağlan')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
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

  // Latency calculation
  const connection = getVoiceConnection(guild.id);
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

  const embed = new EmbedBuilder()
    .setTitle('🎙️ Ses Bağlantı Paneli')
    .setDescription('Bot ses kanalına başarıyla bağlandı. Aşağıdaki panel kontrollerini kullanarak botun ses durumunu yönetebilirsiniz.')
    .setColor('#5865F2')
    .setThumbnail(guild.iconURL({ dynamic: true }) || client?.user.avatarURL())
    .addFields(
      { name: '🔊 Ses Kanalı', value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
      { name: '⚡ Bit Hızı (Bitrate)', value: `\`${bitrateText}\``, inline: true },
      { name: '📶 Gecikme (Ping)', value: `\`${ping}\``, inline: true },
      { name: '👥 Dinleyici Sayısı', value: `\`${listenersCount} Dinleyici / Kontenjan: ${limitText}\``, inline: true },
      { name: '🎙️ Susturma (Mute)', value: selfMute ? '🔴 **Susturulmuş**' : '🟢 **Konuşuyor**', inline: true },
      { name: '🎧 Sağırlaştırma (Deaf)', value: selfDeaf ? '🔴 **Sağırlaştırılmış**' : '🟢 **Duyuyor**', inline: true },
      { name: '🔌 Bağlantı Durumu', value: `\`${statusMessage}\``, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'TBS Ses Yönetim Paneli • Premium Ses Servisi', iconURL: client?.user.avatarURL() });

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
    .setDescription('Botu istediğin ses kanalına bağlar')
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
      const connection = joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: selfDeaf,
        selfMute: selfMute,
      });

      // Save connection config to settings
      settings.voice_channel_restore_id = targetChannel.id;
      settings.voice_self_mute = selfMute;
      settings.voice_self_deaf = selfDeaf;
      global.guardSettings.set(guildId, settings);
      await updateSetting(guildId, 'guard_settings', settings);

      await entersState(connection, VoiceConnectionStatus.Ready, 5000);

      const panel = buildVoicePanel(interaction.guild, targetChannel.id, selfMute, selfDeaf, 'Bağlantı Başarılı ✅', interaction.client);
      await interaction.editReply(panel);

    } catch (error) {
      console.error('Ses kanalına bağlanırken hata:', error);
      const connection = getVoiceConnection(guildId);
      if (connection) connection.destroy();

      settings.voice_channel_restore_id = null;
      global.guardSettings.set(guildId, settings);
      await updateSetting(guildId, 'guard_settings', settings);

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
          joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });
        }
      } else if (customId === 'join_toggle_deafen') {
        selfDeaf = !selfDeaf;
        settings.voice_self_deaf = selfDeaf;
        // Auto mute if deafened to match standard behavior, but here let's keep them independent or link them
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        if (connection && restoreChannelId) {
          joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });
        }
      } else if (customId === 'join_reconnect') {
        if (restoreChannelId) {
          if (connection) {
            try {
              connection.destroy();
            } catch (e) {}
          }

          connection = joinVoiceChannel({
            channelId: restoreChannelId,
            guildId: guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: selfDeaf,
            selfMute: selfMute,
          });

          await entersState(connection, VoiceConnectionStatus.Ready, 5000);
        }
      } else if (customId === 'join_leave') {
        if (connection) {
          try {
            connection.destroy();
          } catch (e) {}
        }
        
        settings.voice_channel_restore_id = null;
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);
        restoreChannelId = null;
        connection = null;
      }

      const statusMsg = connection ? 'İşlem Başarıyla Tamamlandı ✅' : 'Bot Kanaldan Ayrıldı 🚪';
      const panel = buildVoicePanel(interaction.guild, restoreChannelId, selfMute, selfDeaf, statusMsg, interaction.client);
      await interaction.editReply(panel);

    } catch (err) {
      console.error('Ses paneli etkileşim hatası:', err);
      // fallback in case of errors
      const statusMsg = `Hata Oluştu: ${err.message}`;
      const panel = buildVoicePanel(interaction.guild, restoreChannelId, selfMute, selfDeaf, statusMsg, interaction.client);
      await interaction.editReply(panel).catch(() => {});
    }
  }
};
