const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

module.exports = {

  data: new SlashCommandBuilder()

    .setName('join')

    .setDescription('Botu istediğin ses kanalına bağlar')

    // SADECE YETKİLİLER
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )

    .addChannelOption(option =>

      option
        .setName('kanal')
        .setDescription(
          'Girmesini istediğin ses kanalı'
        )
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
    ),

  async execute(interaction) {

    // EXTRA GÜVENLİK
    if (
      !interaction.member.permissions.has(
        PermissionFlagsBits.ManageChannels
      )
    ) {

      return interaction.reply({

        content:
          '❌ Bu komutu kullanamazsın!',

        ephemeral: true,
      });
    }

    // Kullanıcının seçtiği kanal
    // veya bulunduğu kanal
    const targetChannel =

      interaction.options.getChannel('kanal') ??

      interaction.member?.voice?.channel;

    // Ses kanalında değilse
    if (!targetChannel) {

      return interaction.reply({

        content:
          '❌ Bir ses kanalında değilsin veya kanal belirtmedin!',

        ephemeral: true,
      });
    }

    // Ses kanalı mı kontrol et
    if (
      targetChannel.type !==
      ChannelType.GuildVoice
    ) {

      return interaction.reply({

        content:
          '❌ Lütfen bir ses kanalı seç!',

        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {

      const connection = joinVoiceChannel({

        channelId: targetChannel.id,

        guildId: interaction.guild.id,

        adapterCreator:
          interaction.guild.voiceAdapterCreator,

        selfDeaf: true,

        selfMute: false,
      });

      // Bağlantı kontrolü
      await entersState(

        connection,

        VoiceConnectionStatus.Ready,

        5_000
      );

      await interaction.editReply({

        content:
          `✅ **${targetChannel.name}** kanalına başarıyla bağlandım!`,
      });

    } catch (error) {

      console.error(
        'Ses kanalına bağlanırken hata:',
        error
      );

      await interaction.editReply({

        content:
          '❌ Ses kanalına bağlanırken hata oluştu. Botun izinlerini kontrol et!',
      });
    }
  },
};
