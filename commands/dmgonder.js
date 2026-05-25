const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm-gonder')
    .setDescription('Sunucudaki herkese DM gönderir')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Modal oluştur (açılan form penceresi)
    const modal = new ModalBuilder()
      .setCustomId('dm_modal')
      .setTitle('DM Gönder');

    const mesajInput = new TextInputBuilder()
      .setCustomId('mesaj_input')
      .setLabel('Mesajını buraya yaz')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('📢 Turkey Bus Simulator\n\n• Gerçekçi sürüş deneyimi\n• Aktif oyuncu kitlesi\n\nhttps://discord.gg/örnek')
      .setRequired(true)
      .setMaxLength(2000);

    const ekBilgiInput = new TextInputBuilder()
      .setCustomId('ek_bilgi_input')
      .setLabel('Ek bilgi (opsiyonel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('örn: Bu mesaj sunucu yönetimi tarafından gönderilmiştir.')
      .setRequired(false)
      .setMaxLength(200);

    modal.addComponents(
      new ActionRowBuilder().addComponents(mesajInput),
      new ActionRowBuilder().addComponents(ekBilgiInput),
    );

    // Modalı göster
    await interaction.showModal(modal);
  },

  // Modal submit handler — index.js'de çağrılacak
  async handleModal(interaction) {
    const mesaj   = interaction.fields.getTextInputValue('mesaj_input');
    const ekBilgi = interaction.fields.getTextInputValue('ek_bilgi_input') || null;
    const guild   = interaction.guild;

    await interaction.reply({ content: '📨 Üyeler çekiliyor...', ephemeral: true });

    try {
      const members  = await guild.members.fetch();
      const insanlar = members.filter(m => !m.user.bot);

      await interaction.editReply({ content: `📨 ${insanlar.size} kişiye DM gönderiliyor...` });

      let basarili = 0;
      let basarisiz = 0;
      const etiketler = [];

      const memberArray = [...insanlar.values()];
      const grupBoyutu = 5;

      for (let i = 0; i < memberArray.length; i += grupBoyutu) {
        const grup = memberArray.slice(i, i + grupBoyutu);

        await Promise.all(
          grup.map(async member => {
            try {
              await member.send({
                content: `<@${member.user.id}>`,
                embeds: [
                  {
                    color: 0x2b2d31,
                    description: mesaj,
                    ...(ekBilgi ? { footer: { text: ekBilgi } } : {})
                  },
                ],
              });
              basarili++;
              etiketler.push(`<@${member.user.id}>`);
            } catch {
              basarisiz++;
            }
          })
        );

        if (i + grupBoyutu < memberArray.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      await interaction.editReply({
        content: [
          `✅ **DM Gönderimi Tamamlandı!**`,
          `📨 **Başarılı:** ${basarili} kişi`,
          `❌ **DM Kapalı:** ${basarisiz} kişi`,
          basarili > 0 ? `\n**📋 Gönderilen Kişiler:**\n${etiketler.join(' ')}` : '',
        ].join('\n'),
      });

    } catch (err) {
      console.error('DM gönderme hatası:', err);
      await interaction.editReply({ content: `❌ Hata: \`${err.message}\`` });
    }
  },
};
