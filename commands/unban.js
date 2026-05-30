const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Bir kullanıcının sunucu yasaklamasını kaldırır.')
        .addStringOption(option =>
            option
                .setName('kullanici')
                .setDescription('Yasaklaması kaldırılacak kişinin ID\'si veya kullanıcı adı')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('sebep')
                .setDescription('Yasağın kaldırılma gerekçesi')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const input = interaction.options.getString('kullanici');
        const reason = interaction.options.getString('sebep') || 'Gerekçe belirtilmedi';

        const bans = await interaction.guild.bans.fetch().catch(() => null);
        if (!bans) {
            return interaction.reply({
                content: '❌ Sunucunun ban listesine erişilemedi!',
                ephemeral: true
            });
        }

        const bannedUser = bans.find(ban =>
            ban.user.id === input ||
            ban.user.username.toLowerCase() === input.toLowerCase()
        );

        if (!bannedUser) {
            return interaction.reply({
                content: '❌ Belirtilen kriterlere uygun banlı bir kullanıcı bulunamadı.',
                ephemeral: true
            });
        }

        const user = bannedUser.user;

        // Yasak kaldırma işlemi
        await interaction.guild.members.unban(user.id, `${interaction.user.tag}: ${reason}`);

        // Süreli ban listesinden bu kullanıcıyı çıkaralım (Eğer varsa)
        const guildId = interaction.guild.id;
        const settings = global.guardSettings.get(guildId) || {};
        if (settings.temp_bans && settings.temp_bans.length > 0) {
            const filteredBans = settings.temp_bans.filter(b => b.userId !== user.id);
            if (filteredBans.length !== settings.temp_bans.length) {
                settings.temp_bans = filteredBans;
                global.guardSettings.set(guildId, settings);
                const { updateSetting } = require('../db.js');
                await updateSetting(guildId, 'guard_settings', settings);
            }
        }

        // Sunucu davet linkini almayı dene
        let inviteLink = '';
        try {
            // Get first channel we can make an invite for
            const textChannel = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText);
            const channelId = textChannel ? textChannel.id : interaction.channel.id;
            const invite = await interaction.guild.invites.create(channelId, { maxAge: 0, maxUses: 0 }).catch(() => null);
            if (invite) inviteLink = invite.url;
        } catch (e) {}

        // DM Bildirimi
        const dmEmbed = new EmbedBuilder()
            .setTitle('🔓 Yasaklamanız Kaldırıldı')
            .setDescription(`**${interaction.guild.name}** sunucusundaki yasaklamanız kaldırıldı.`)
            .setColor('#2ECC71')
            .addFields(
                { name: '📝 Gerekçe', value: reason }
            )
            .setTimestamp();
        
        if (inviteLink) {
            dmEmbed.addFields({ name: '🔗 Tekrar Katılmak İçin Davet Linki', value: inviteLink });
        }

        try {
            await user.send({ embeds: [dmEmbed] });
        } catch (err) {
            console.log(`DM to unbanned user ${user.tag} could not be sent.`);
        }

        // Başarılı Embed
        const unbanEmbed = new EmbedBuilder()
            .setTitle('🔓 Üyenin Yasaklaması Kaldırıldı')
            .setColor('#2ECC71')
            .setThumbnail(user.displayAvatarURL({ dynamic: true }) || null)
            .addFields(
                { name: '👤 Kullanıcı', value: `${user} (\`${user.tag}\`)`, inline: true },
                { name: '🆔 Kullanıcı ID', value: `\`${user.id}\``, inline: true },
                { name: '🛡️ Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: '📝 Kaldırma Gerekçesi', value: `\`${reason}\``, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'TBS Moderasyon Sistemi', iconURL: interaction.client.user.avatarURL() });

        await interaction.reply({ embeds: [unbanEmbed] });

        // Log kanalına gönder
        const logChannelId = global.ticketLogKanals.get(guildId);
        const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
        if (logChannel) {
            await logChannel.send({ embeds: [unbanEmbed] }).catch(() => {});
        }
    }
};
