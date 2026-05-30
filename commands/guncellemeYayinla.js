const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

// Bot geliştirici ID'leri (Application Owner dışında ekstra izin verilecek geliştiriciler)
const DEV_IDS = ['640056735700221953', '1458487664725725194'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guncelleme-yayinla')
    .setDescription('Yeni bot güncellemesini tüm sunuculara duyurur (Yalnızca Geliştiriciler)'),

  async execute(interaction) {
    try {
      // Yetki kontrolü (Uygulama Sahibi veya Geliştirici Listesi)
      let isDev = DEV_IDS.includes(interaction.user.id);
      
      if (!isDev) {
        const app = await interaction.client.application.fetch().catch(() => null);
        if (app) {
          const ownerId = app.owner?.id;
          const teamMembers = app.owner?.members;
          if (ownerId === interaction.user.id || (teamMembers && teamMembers.has(interaction.user.id))) {
            isDev = true;
          }
        }
      }

      if (!isDev) {
        return interaction.reply({
          content: '❌ Bu komut yalnızca bot geliştiricilerine özeldir!',
          ephemeral: true,
        });
      }

      // Modal Oluştur
      const modal = new ModalBuilder()
        .setCustomId('guncelleme_modal')
        .setTitle('Güncelleme Yayınla');

      // Input Alanları
      const versiyonInput = new TextInputBuilder()
        .setCustomId('versiyon_input')
        .setLabel('Sürüm (Örn: v1.3.0)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Sürüm numarasını girin...')
        .setRequired(true)
        .setMaxLength(20);

      const baslikInput = new TextInputBuilder()
        .setCustomId('baslik_input')
        .setLabel('Güncelleme Başlığı')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Duyuru başlığını yazın...')
        .setRequired(true)
        .setMaxLength(100);

      const detayInput = new TextInputBuilder()
        .setCustomId('detay_input')
        .setLabel('Yenilikler ve Değişiklikler')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('• Ses paneli buton kontrolleri eklendi.\n• Otomatik kanal kurtarma sistemi aktif edildi.\n• Sunucu limitleri güncellendi.')
        .setRequired(true)
        .setMaxLength(1500);

      const resimInput = new TextInputBuilder()
        .setCustomId('resim_input')
        .setLabel('Görsel URL (Opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://imgur.com/resim.png')
        .setRequired(false)
        .setMaxLength(200);

      const notInput = new TextInputBuilder()
        .setCustomId('not_input')
        .setLabel('Ek Not / Footer (Opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Duyuru altında gösterilecek kısa not...')
        .setRequired(false)
        .setMaxLength(150);

      // Satırları ekle
      modal.addComponents(
        new ActionRowBuilder().addComponents(versiyonInput),
        new ActionRowBuilder().addComponents(baslikInput),
        new ActionRowBuilder().addComponents(detayInput),
        new ActionRowBuilder().addComponents(resimInput),
        new ActionRowBuilder().addComponents(notInput)
      );

      // Modalı göster
      await interaction.showModal(modal);
    } catch (err) {
      console.error('guncelleme-yayinla execute hatası:', err);
      const replyData = {
        content: `❌ Komut yürütülürken hata oluştu: \`${err.message}\``,
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyData).catch(() => {});
      } else {
        await interaction.reply(replyData).catch(() => {});
      }
    }
  },

  // Modal Submit Sonrası Yürütülecek Kodlar
  async handleModal(interaction) {
    try {
      const versiyon = interaction.fields.getTextInputValue('versiyon_input');
      const baslik = interaction.fields.getTextInputValue('baslik_input');
      const detay = interaction.fields.getTextInputValue('detay_input');
      const resim = interaction.fields.getTextInputValue('resim_input') || null;
      const not = interaction.fields.getTextInputValue('not_input') || null;

      await interaction.reply({
        content: '📢 **Güncelleme yayını başlatılıyor...** Sunucular taranıyor ve duyurular gönderiliyor.',
        ephemeral: true
      });

      // Embed Oluştur
      const updateEmbed = new EmbedBuilder()
        .setTitle(`📢 Yeni Güncelleme: ${baslik}`)
        .setDescription(`### 📌 Sürüm: \`${versiyon}\`\n\n**Yenilikler & Değişiklikler:**\n${detay}`)
        .setColor('#3498DB')
        .setTimestamp()
        .setFooter({ 
          text: not || 'TBS Sunucu Koruma & Yönetim Sistemleri', 
          iconURL: interaction.client.user.avatarURL() 
        });

      // Görsel URL geçerli mi kontrol et ve ekle
      if (resim && (resim.startsWith('http://') || resim.startsWith('https://'))) {
        updateEmbed.setImage(resim);
      }

      const guilds = interaction.client.guilds.cache;
      let successCount = 0;
      let failCount = 0;
      let dmCount = 0;

      // Her sunucu için sırayla gönderim yap (Rate limit engellemek için)
      for (const [guildId, guild] of guilds) {
        let targetChannel = null;

        try {
          // 1. Öncelikli olarak ismi güncelleme/duyuru olan kanalları ara
          targetChannel = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildText && 
            (c.name.includes('güncelleme') || c.name.includes('guncelleme') || 
             c.name.includes('changelog') || c.name.includes('duyuru') || 
             c.name.includes('announcement') || c.name.includes('update')) &&
            c.permissionsFor(guild.members.me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
          );

          // 2. Bulunamazsa sistem kanalını kullan
          if (!targetChannel && guild.systemChannel) {
            const hasPerms = guild.systemChannel.permissionsFor(guild.members.me)
              .has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
            if (hasPerms) {
              targetChannel = guild.systemChannel;
            }
          }

          // 3. O da bulunamazsa botun yazabildiği ilk kanalı bul
          if (!targetChannel) {
            targetChannel = guild.channels.cache.find(c => 
              c.type === ChannelType.GuildText && 
              c.permissionsFor(guild.members.me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
            );
          }

          // Kanal bulunduysa duyuruyu at
          if (targetChannel) {
            await targetChannel.send({ embeds: [updateEmbed] });
            successCount++;
          } else {
            // 4. Kanal bulunamazsa Sunucu Sahibine DM gönder
            const owner = await guild.fetchOwner().catch(() => null);
            if (owner) {
              await owner.send({
                content: `📢 **${guild.name}** sunucunuzda güncelleme yayınlayacak uygun bir kanal bulunamadığı için duyuru direkt mesaj olarak gönderilmiştir:`,
                embeds: [updateEmbed]
              }).catch(() => null);
              dmCount++;
            } else {
              failCount++;
            }
          }
        } catch (err) {
          console.error(`Sunucu güncelleme gönderim hatası (${guild.name}):`, err);
          failCount++;
        }

        // Sunucular arası 800ms bekle (Discord Rate Limit Protection)
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Geliştiriciye detaylı rapor ver
      await interaction.editReply({
        content: [
          `✅ **Güncelleme Duyuruları Başarıyla Tamamlandı!**`,
          `🔊 **Duyuru Kanallarına Gönderilen:** \`${successCount}\` adet sunucu`,
          `✉️ **Sunucu Sahiplerine DM Atılan:** \`${dmCount}\` adet`,
          `❌ **Gönderilemeyen / Hata Oluşan:** \`${failCount}\` adet sunucu`
        ].join('\n')
      });
    } catch (err) {
      console.error('guncelleme-yayinla handleModal hatası:', err);
      const replyData = {
        content: `❌ Güncelleme yayınlanırken hata oluştu: \`${err.message}\``,
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyData).catch(() => {});
      } else {
        await interaction.reply(replyData).catch(() => {});
      }
    }
  }
};
