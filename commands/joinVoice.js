const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Botу istediğin ses kanalına bağlar')
    .addChannelOption(option =>
      option
        .setName('kanal')
        .setDescription('Girmesini istediğin ses kanalı')
        .setRequired(false) // false = belirtilmezse senin kanalına girer
    ),

  async execute(interaction) {
    // Kullanıcının belirttiği kanalı al, yoksa kullanıcının bulunduğu kanalı al
    const targetChannel =
      interaction.options.getChannel('kanal') ??
      interaction.member?.voice?.channel;

    // Kullanıcı ses kanalında değilse ve kanal belirtilmediyse hata ver
    if (!targetChannel) {
      return interaction.reply({
        content: '❌ Bir ses kanalında değilsin veya kanal belirtmedin!',
        ephemeral: true,
      });
    }

    // Kanal bir ses kanalı mı kontrol et
    if (targetChannel.type !== 2) { // 2 = GuildVoice
      return interaction.reply({
        content: '❌ Lütfen bir **ses kanalı** seç!',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const connection = joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true,  // Bot sağır olsun (isteğe göre false yapabilirsin)
        selfMute: false, // Bot sessiz olmasın
      });

      // Bağlantı hazır olana kadar bekle (5 saniye timeout)
      await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

      await interaction.editReply({
        content: `✅ **${targetChannel.name}** kanalına başarıyla bağlandım!`,
      });
    } catch (error) {
      console.error('Ses kanalına bağlanırken hata:', error);
      await interaction.editReply({
        content: '❌ Ses kanalına bağlanırken bir hata oluştu. Botun gerekli izinleri var mı?',
      });
    }
  },
};
