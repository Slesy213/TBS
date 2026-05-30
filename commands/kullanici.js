const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kullanici')
        .setDescription('Kullanıcı hakkında detaylı, etkileşimli ve premium bilgileri gösterir.')
        .addUserOption(option =>
            option
                .setName('kisi')
                .setDescription('Bilgisi gösterilecek kişi (Boş bırakılırsa kendiniz)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const member = interaction.options.getMember('kisi') || interaction.member;
        const guild = interaction.guild;
        const client = interaction.client;

        // Force fetch user to get banner and detailed profile flags
        const user = await client.users.fetch(member.user.id, { force: true }).catch(() => member.user);

        // Hesap Katılım Sırası (Join Rank) Hesaplama
        let joinRank = 'Hesaplanıyor...';
        if (guild.memberCount < 2000) {
            try {
                const fetchedMembers = await guild.members.fetch();
                const sorted = [...fetchedMembers.values()].sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
                joinRank = sorted.findIndex(m => m.id === member.id) + 1;
            } catch (e) {
                joinRank = 'Sayılamadı';
            }
        } else {
            const sorted = [...guild.members.cache.values()].sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
            const idx = sorted.findIndex(m => m.id === member.id);
            joinRank = idx !== -1 ? `${idx + 1} (Tahmini)` : 'Hesaplanamadı';
        }

        // Rozet/Flag Haritası ve Çevirisi
        const flagsMap = {
            Staff: '🛠️ Discord Yetkilisi',
            Partner: '🤝 Discord Partneri',
            Hypesquad: '🎭 HypeSquad Etkinlikleri',
            BugHunterLevel1: '🐛 Bug Avcısı (Lvl 1)',
            BugHunterLevel2: '🐛 Bug Avcısı (Lvl 2)',
            HypeSquadOnlineHouse1: '🏠 HypeSquad Bravery',
            HypeSquadOnlineHouse2: '🏠 HypeSquad Brilliance',
            HypeSquadOnlineHouse3: '🏠 HypeSquad Balance',
            PremiumEarlySupporter: '💎 Erken Dönem Destekçisi',
            VerifiedDeveloper: '👨‍💻 Doğrulanmış Geliştirici',
            ActiveDeveloper: '🚀 Aktif Geliştirici'
        };
        const userFlags = user.flags ? user.flags.toArray() : [];
        const detectedBadges = userFlags.map(f => flagsMap[f]).filter(Boolean);
        const badgesText = detectedBadges.length > 0 ? detectedBadges.join('\n') : '• Herhangi bir Discord rozeti bulunmuyor.';

        // Hesap Yaşı ve Şüpheli Durum Kontrolü
        const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000));
        const isNewAccount = accountAgeDays < 7;
        const accountAgeText = isNewAccount 
            ? `⚠️ **Yeni Hesap** (\`${accountAgeDays} Günlük\`)` 
            : `\`${accountAgeDays} Günlük\``;

        // Önemli Yetkiler Denetimi
        const keyPermissions = [
            { flag: PermissionFlagsBits.Administrator, name: 'Yönetici' },
            { flag: PermissionFlagsBits.ManageGuild, name: 'Sunucuyu Yönet' },
            { flag: PermissionFlagsBits.BanMembers, name: 'Üyeleri Yasakla' },
            { flag: PermissionFlagsBits.KickMembers, name: 'Üyeleri At' },
            { flag: PermissionFlagsBits.ManageChannels, name: 'Kanalları Yönet' },
            { flag: PermissionFlagsBits.ManageRoles, name: 'Rolleri Yönet' },
            { flag: PermissionFlagsBits.ManageMessages, name: 'Mesajları Yönet' }
        ];

        const permissionsStatus = keyPermissions.map(p => {
            const hasPerm = member.permissions.has(p.flag);
            return `${hasPerm ? '🟢' : '🔴'} ${p.name}`;
        }).join('\n');

        // Rollerin Listelenmesi (Limitli)
        const roles = member.roles.cache
            .filter(r => r.id !== guild.id) // @everyone çıkar
            .sort((a, b) => b.position - a.position)
            .map(r => r.toString());
        
        let rolesText = roles.join(', ');
        if (rolesText.length > 1024) {
            rolesText = roles.slice(0, 15).join(', ') + `... ve ${roles.length - 15} daha fazla rol.`;
        }
        rolesText = rolesText || '• Herhangi bir rolü bulunmuyor.';

        // Güvenli Liste Durumu
        const isWhitelisted = global.guvenliListes.get(guild.id)?.includes(user.id);
        const whitelistText = isWhitelisted ? '🟢 Güvenli Listede Kayıtlı' : '🔴 Güvenli Listede Değil';

        // 1. Genel Bilgiler Embed'i
        const generalEmbed = new EmbedBuilder()
            .setTitle(`👤 ${user.username} | Profil Bilgileri`)
            .setDescription(`Kullanıcının genel bilgileri aşağıda listelenmiştir. Diğer detaylar için butonları kullanın.`)
            .setColor('#9B59B6')
            .setThumbnail(user.displayAvatarURL({ dynamic: true }) || null)
            .addFields(
                { name: '👤 Kullanıcı Tagı', value: `${user} (\`${user.tag}\`)`, inline: true },
                { name: '🆔 Kullanıcı ID', value: `\`${user.id}\``, inline: true },
                { name: '🤖 Hesap Türü', value: user.bot ? '🤖 Bot' : '👤 Kullanıcı', inline: true },
                { name: '📅 Katılım Sırası', value: `\`${joinRank}. Üye\``, inline: true },
                { name: '📅 Discord Kayıt', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: false },
                { name: '📥 Sunucuya Giriş', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, inline: false },
                { name: '✨ Discord Rozetleri', value: `${badgesText}`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // Kullanıcı afişi/banner varsa ekle
        if (user.banner) {
            generalEmbed.setImage(user.bannerURL({ size: 1024, dynamic: true }));
        }

        // 2. Rol ve Yetkiler Embed'i
        const rolesEmbed = new EmbedBuilder()
            .setTitle(`🎭 ${user.username} | Rol & İzin Bilgileri`)
            .setDescription(`Kullanıcının sunucudaki rolleri ve sahip olduğu kritik yetkiler aşağıdadır.`)
            .setColor('#3498DB')
            .setThumbnail(user.displayAvatarURL({ dynamic: true }) || null)
            .addFields(
                { name: '🎭 En Yüksek Rol', value: `${member.roles.highest}`, inline: true },
                { name: '📋 Toplam Rol Sayısı', value: `\`${roles.length}\` adet`, inline: true },
                { name: '🏷️ Tüm Rolleri', value: rolesText, inline: false },
                { name: '🔑 Kritik Yetki Durumu', value: permissionsStatus, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // 3. Güvenlik ve Durum Embed'i
        const securityEmbed = new EmbedBuilder()
            .setTitle(`🛡️ ${user.username} | Güvenlik & Hesap Durumu`)
            .setDescription(`Kullanıcının hesap yaşı, güvenlik durumu ve profil bağlantıları detaylandırılmıştır.`)
            .setColor('#E74C3C')
            .setThumbnail(user.displayAvatarURL({ dynamic: true }) || null)
            .addFields(
                { name: '👶 Hesap Yaşı', value: accountAgeText, inline: true },
                { name: '🛡️ TBS Güvenli Liste', value: `\`${whitelistText}\``, inline: true },
                { name: '🖼️ Avatar Bağlantısı', value: `[Resmi Görüntüle](${user.displayAvatarURL({ size: 2048, dynamic: true })})`, inline: true },
                { name: '🖼️ Profil Afişi', value: user.banner ? `[Afişi Görüntüle](${user.bannerURL({ size: 2048, dynamic: true })})` : 'Afiş Bulunmuyor', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `${interaction.user.username} tarafından istendi`, iconURL: interaction.user.displayAvatarURL() });

        // Buton Satırları
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('user_genel')
                .setLabel('👤 Genel Bilgiler')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('user_rol')
                .setLabel('🎭 Rol & Yetkiler')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('user_guvenlik')
                .setLabel('🛡️ Güvenlik & Durum')
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

            row.components.forEach(btn => {
                btn.setStyle(ButtonStyle.Secondary);
                btn.setDisabled(false);
            });

            let selectedEmbed;

            if (i.customId === 'user_genel') {
                selectedEmbed = generalEmbed;
                row.components[0].setStyle(ButtonStyle.Primary).setDisabled(true);
            } else if (i.customId === 'user_rol') {
                selectedEmbed = rolesEmbed;
                row.components[1].setStyle(ButtonStyle.Primary).setDisabled(true);
            } else if (i.customId === 'user_guvenlik') {
                selectedEmbed = securityEmbed;
                row.components[2].setStyle(ButtonStyle.Primary).setDisabled(true);
            }

            await interaction.editReply({
                embeds: [selectedEmbed],
                components: [row]
            });
        });

        collector.on('end', async () => {
            row.components.forEach(btn => btn.setDisabled(true));
            await interaction.editReply({
                components: [row]
            }).catch(() => {});
        });
    }
};
