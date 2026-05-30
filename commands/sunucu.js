const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucu')
        .setDescription('Sunucu hakkında detaylı ve etkileşimli bilgileri gösterir.'),

    async execute(interaction) {
        const guild = interaction.guild;
        const owner = await guild.fetchOwner();
        const client = interaction.client;

        // Üye Sayaçları (Hafif ve Hızlı Hesaplama)
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount = guild.memberCount - botCount;
        const boosterCount = guild.members.cache.filter(m => m.premiumSince).size;

        // Kanal Sayaçları
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categoryChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const stageChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;
        const announcementChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildAnnouncement).size;

        // Emoji ve Çıkartma Sayaçları
        const totalEmojis = guild.emojis.cache.size;
        const animatedEmojis = guild.emojis.cache.filter(e => e.animated).size;
        const staticEmojis = totalEmojis - animatedEmojis;
        const totalStickers = guild.stickers.cache.size;

        // Güvenlik ve Doğrulama Çevirileri
        const verifLevels = {
            0: 'Yok (Sınırlandırılmamış)',
            1: 'Düşük (E-posta doğrulanmış olmalı)',
            2: 'Orta (5 dakikadır Discord üyesi olmalı)',
            3: 'Yüksek (10 dakikadır sunucu üyesi olmalı)',
            4: 'Çok Yüksek (Telefon doğrulanmış olmalı)'
        };
        const verifLevel = verifLevels[guild.verificationLevel] || 'Bilinmiyor';

        const mfaLevels = {
            0: '🔴 Pasif (Zorunlu Değil)',
            1: '🟢 Aktif (İki Aşamalı Doğrulama Zorunlu)'
        };
        const mfaLevel = mfaLevels[guild.mfaLevel] || 'Bilinmiyor';

        const nsfwLevels = {
            0: 'Varsayılan',
            1: 'Açık / Uygun',
            2: 'Güvenli',
            3: 'Kısıtlanmış'
        };
        const nsfwLevel = nsfwLevels[guild.nsfwLevel] || 'Bilinmiyor';

        // Sunucu Özellikleri (Features) Filtreleme ve Türkçe Terimler
        const featuresMap = {
            'COMMUNITY': '💬 Topluluk Sunucusu',
            'VANITY_URL': '🔗 Özel Davet Linki',
            'VERIFIED': '✅ Doğrulanmış Sunucu',
            'PARTNERED': '🤝 Partner Sunucu',
            'DISCOVERABLE': '🔍 Keşfedilebilir',
            'FEATURABLE': '⭐ Öne Çıkarılabilir',
            'WELCOME_SCREEN_ENABLED': '👋 Karşılama Ekranı',
            'NEWS': '📢 Haber Kanalları',
            'PREVIEW_ENABLED': '👁️ Sunucu Önizleme'
        };
        const activeFeatures = guild.features
            .map(f => featuresMap[f])
            .filter(Boolean)
            .slice(0, 5); // En önemli ilk 5 özelliği göster
        
        const featuresText = activeFeatures.length > 0 ? activeFeatures.join('\n') : '• Herhangi bir özel nitelik bulunmuyor.';

        // 1. Genel Bilgiler Embed'i
        const generalEmbed = new EmbedBuilder()
            .setTitle(`📊 ${guild.name} | Sunucu Bilgileri`)
            .setDescription(`Sunucu hakkında genel bilgilere aşağıdan ulaşabilirsiniz. Diğer detaylar için butonları kullanın.`)
            .setColor('#5865F2')
            .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.avatarURL())
            .addFields(
                { name: '👑 Sunucu Sahibi', value: `${owner.user} (\`${owner.user.id}\`)`, inline: true },
                { name: '🆔 Sunucu ID', value: `\`${guild.id}\``, inline: true },
                { name: '📅 Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: false },
                { name: '💎 Sunucu Seviyesi', value: `\`Seviye ${guild.premiumTier} (${guild.premiumSubscriptionCount} Boost)\``, inline: true },
                { name: '👥 Toplam Üye', value: `\`${guild.memberCount}\` Üye`, inline: true },
                { name: '🎉 Toplam Rol', value: `\`${guild.roles.cache.size}\` Adet`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        if (guild.banner) {
            generalEmbed.setImage(guild.bannerURL({ size: 1024, dynamic: true }));
        }

        // 2. Üye İstatistikleri Embed'i
        const memberEmbed = new EmbedBuilder()
            .setTitle(`👥 ${guild.name} | Üye İstatistikleri`)
            .setDescription(`Sunucudaki üye dağılımı ve boost detayları aşağıda belirtilmiştir.`)
            .setColor('#3498DB')
            .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.avatarURL())
            .addFields(
                { name: '👤 İnsanlar', value: `\`${humanCount}\` Kişi`, inline: true },
                { name: '🤖 Botlar', value: `\`${botCount}\` Bot`, inline: true },
                { name: '📈 Bot Oranı', value: `\`%${Math.round((botCount / guild.memberCount) * 100)}\``, inline: true },
                { name: '✨ Premium Üyeler (Booster)', value: `\`${boosterCount}\` Üye`, inline: true },
                { name: '📋 Toplam Üye', value: `\`${guild.memberCount}\` Kişi`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // 3. Kanallar & Emojiler Embed'i
        const channelEmbed = new EmbedBuilder()
            .setTitle(`🔊 ${guild.name} | Kanallar, Emojiler & Çıkartmalar`)
            .setDescription(`Sunucudaki tüm kanal yapılanması ve medya kütüphanesi istatistikleri aşağıdadır.`)
            .setColor('#2ECC71')
            .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.avatarURL())
            .addFields(
                { name: '📝 Yazı Kanalları', value: `\`${textChannels}\` adet`, inline: true },
                { name: '🔊 Ses Kanalları', value: `\`${voiceChannels}\` adet`, inline: true },
                { name: '📢 Duyuru Kanalları', value: `\`${announcementChannels}\` adet`, inline: true },
                { name: '🎭 Sahne Kanalları', value: `\`${stageChannels}\` adet`, inline: true },
                { name: '📁 Kategoriler', value: `\`${categoryChannels}\` adet`, inline: true },
                { name: '😀 Emojiler', value: `\`${totalEmojis}\` adet (\`${staticEmojis}\` Sabit / \`${animatedEmojis}\` Hareketli)`, inline: false },
                { name: '✨ Çıkartmalar (Stickers)', value: `\`${totalStickers}\` adet`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // 4. Güvenlik & Moderasyon Embed'i
        const guardEmbed = new EmbedBuilder()
            .setTitle(`🛡️ ${guild.name} | Güvenlik & Moderasyon`)
            .setDescription(`Sunucunun Discord güvenlik seviyeleri ve TBS Guard sistem durumu detayları aşağıdadır.`)
            .setColor('#E74C3C')
            .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.avatarURL())
            .addFields(
                { name: '🔒 Doğrulama Seviyesi', value: `\`${verifLevel}\``, inline: false },
                { name: '⚙️ İki Aşamalı Doğrulama (MFA)', value: `\`${mfaLevel}\``, inline: false },
                { name: '🔞 İçerik Filtresi (NSFW)', value: `\`${nsfwLevel}\``, inline: true },
                { name: '🛡️ TBS Guard Durumu', value: global.guardDurums.get(guild.id) ? '🟢 **Aktif (Sunucu Korunuyor)**' : '🔴 **Pasif (Koruma Devre Dışı)**', inline: true },
                { name: '💎 Sunucu Ayrıcalıkları', value: `${featuresText}`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // Buton Satırları
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sunucu_genel')
                .setLabel('📊 Genel Bilgiler')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('sunucu_uye')
                .setLabel('👥 Üye İstatistikleri')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('sunucu_kanal')
                .setLabel('🔊 Kanallar & Emojiler')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('sunucu_guvenlik')
                .setLabel('🛡️ Güvenlik & Koruma')
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await interaction.reply({
            embeds: [generalEmbed],
            components: [row]
        });

        // Buton Etkileşimi Dinleyicisi (5 Dakikalık)
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 300000
        });

        collector.on('collect', async i => {
            await i.deferUpdate();

            // Tüm butonları secondary ve aktif yapalım
            row.components.forEach(btn => {
                btn.setStyle(ButtonStyle.Secondary);
                btn.setDisabled(false);
            });

            let selectedEmbed;

            // Seçilen butona göre içeriği ve stili ayarlayalım
            if (i.customId === 'sunucu_genel') {
                selectedEmbed = generalEmbed;
                row.components[0].setStyle(ButtonStyle.Primary).setDisabled(true);
            } else if (i.customId === 'sunucu_uye') {
                selectedEmbed = memberEmbed;
                row.components[1].setStyle(ButtonStyle.Primary).setDisabled(true);
            } else if (i.customId === 'sunucu_kanal') {
                selectedEmbed = channelEmbed;
                row.components[2].setStyle(ButtonStyle.Primary).setDisabled(true);
            } else if (i.customId === 'sunucu_guvenlik') {
                selectedEmbed = guardEmbed;
                row.components[3].setStyle(ButtonStyle.Primary).setDisabled(true);
            }

            await interaction.editReply({
                embeds: [selectedEmbed],
                components: [row]
            });
        });

        collector.on('end', async () => {
            // Zaman dolduğunda butonları devre dışı bırakalım
            row.components.forEach(btn => btn.setDisabled(true));
            await interaction.editReply({
                components: [row]
            }).catch(() => {});
        });
    }
};
