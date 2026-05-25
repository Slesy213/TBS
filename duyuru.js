const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Bot aracılığıyla duyuru kanalına mesaj gönderir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmanız gerekiyor.",
        ephemeral: true,
      });
    }

    // Modal aç (fotoğraftaki gibi form)
    const modal = new ModalBuilder()
      .setCustomId("duyuru_modal")
      .setTitle("Duyuru Gönder");

    const mesajInput = new TextInputBuilder()
      .setCustomId("duyuru_mesaj")
      .setLabel("Mesajını buraya yaz")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Duyuru mesajınızı buraya yazın...")
      .setRequired(true)
      .setMaxLength(2000);

    const ekBilgiInput = new TextInputBuilder()
      .setCustomId("duyuru_ekbilgi")
      .setLabel("Ek bilgi (opsiyonel)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("örn: Bu mesaj sunucu yönetimi tarafından gönderilmiştir.")
      .setRequired(false)
      .setMaxLength(300);

    modal.addComponents(
      new ActionRowBuilder().addComponents(mesajInput),
      new ActionRowBuilder().addComponents(ekBilgiInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (interaction.customId !== "duyuru_modal") return;

    await interaction.deferReply({ ephemeral: true });

    const mesaj = interaction.fields.getTextInputValue("duyuru_mesaj");
    const ekBilgi = interaction.fields.getTextInputValue("duyuru_ekbilgi");
    const guild = interaction.guild;

    // Komutu hangi kanalda kullandıysa oraya gönder
    const hedefKanal = interaction.channel;

    // Embed duyuru mesajı oluştur
    const duyuruEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ dynamic: true }),
      })
      .setTitle("📢 Duyuru")
      .setDescription(mesaj)
      .setTimestamp();

    if (ekBilgi) {
      duyuruEmbed.setFooter({ text: ekBilgi });
    }

    try {
      await hedefKanal.send({ content: "@everyone", embeds: [duyuruEmbed] });

      await interaction.editReply({
        content: `✅ Duyuru başarıyla **#${hedefKanal.name}** kanalına gönderildi!`,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: `❌ Duyuru gönderilemedi. Botun **#${hedefKanal.name}** kanalına mesaj gönderme yetkisi var mı?`,
      });
    }
  },
};