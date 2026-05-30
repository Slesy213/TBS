const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const { updateSetting } = require('../db.js');

/**
 * Parses duration strings like 30m, 2h, 3d into milliseconds
 */
function parseDuration(str) {
    const match = str.match(/^(\d+)([mhd])$/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 'm': return { ms: num * 60 * 1000, label: `${num} Dakika` };
        case 'h': return { ms: num * 60 * 60 * 1000, label: `${num} Saat` };
        case 'd': return { ms: num * 24 * 60 * 60 * 1000, label: `${num} Gün` };
        default: return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bir kullanıcıyı sunucudan yasaklar (Süreli veya Süresiz).')
        .addUserOption(option =>
            option
                .setName('kişi')
                .setDescription('Yasaklanacak kişi')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('sebep')
                .setDescription('Yasaklama sebebi')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('sure')
                .setDescription('Yasaklama süresi (Örn: 30m, 2h, 3d). Boş bırakılırsa süresiz olur.')
                .setRequired(false))
        .addIntegerOption(option =>
            option
                .setName('silinecek_mesajlar')
                .setDescription('Kullanıcının geçmiş mesajları silinsin mi?')
                .addChoices(
                    { name: 'Silme', value: 0 },
                    { name: 'Son 24 Saat', value: 86400 },
                    { name: 'Son 7 Gün', value: 604800 }
                )
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const executor = interaction.member;
        const targetUser = interaction.options.getUser('kişi');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
        const durationStr = interaction.options.getString('sure');
        const deleteHistorySecs = interaction.options.getInteger('silinecek_mesajlar') || 0;

        // 1. Temel kontroller (Kendini banlama, botu banlama, vb.)
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Kendini yasaklayamazsın!', ephemeral: true });
        }

        if (targetUser.id === interaction.client.user.id) {
            return interaction.reply({ content: '❌ Beni yasaklayamazsın!', ephemeral: true });
        }

        if (targetUser.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ Sunucu sahibini yasaklayamazsın!', ephemeral: true });
        }

        // 2. Rol Hiyerarşisi Kontrolleri
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember) {
            if (targetMember.roles.highest.position >= executor.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({
                    content: '❌ Yasaklamak istediğin üyenin rolü seninle aynı veya senden daha yüksek!',
                    ephemeral: true
                });
            }

            if (!targetMember.bannable) {
                return interaction.reply({
                    content: '❌ Bu üyeyi yasaklamak için yetkim yetersiz! (Bot rolünün yerini kontrol edin)',
                    ephemeral: true
                });
            }
        }

        // 3. Süre Formatı Kontrolü
        let durationObj = null;
        if (durationStr) {
            durationObj = parseDuration(durationStr);
            if (!durationObj) {
                return interaction.reply({
                    content: '❌ Geçersiz süre formatı! Lütfen dakika için `m`, saat için `h`, gün için `d` kullanın (Örn: `30m`, `2h`, `3d`).',
                    ephemeral: true
                });
            }
        }

        // 4. Yasaklanacak üyeye DM atılması
        const dmEmbed = new EmbedBuilder()
            .setTitle(`🚫 Sunucudan Yasaklandınız`)
            .setDescription(`**${interaction.guild.name}** sunucusundan uzaklaştırıldınız.`)
            .setColor('#ED4245')
            .addFields(
                { name: '📝 Sebep', value: reason },
                { name: '⏳ Süre', value: durationObj ? durationObj.label : 'Süresiz' }
            )
            .setTimestamp()
            .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

        try {
            await targetUser.send({ embeds: [dmEmbed] });
        } catch (err) {
            console.log(`DM to ${targetUser.tag} could not be sent.`);
        }

        // 5. Veritabanına Temp-ban kaydı (Süreli ise)
        const guildId = interaction.guild.id;
        if (durationObj) {
            const settings = global.guardSettings.get(guildId) || {};
            if (!settings.temp_bans) settings.temp_bans = [];

            // Eski mükerrer kayıtları temizle
            settings.temp_bans = settings.temp_bans.filter(b => b.userId !== targetUser.id);

            settings.temp_bans.push({
                userId: targetUser.id,
                unbanAt: Date.now() + durationObj.ms,
                reason: reason,
                staffId: interaction.user.id
            });

            global.guardSettings.set(guildId, settings);
            await updateSetting(guildId, 'guard_settings', settings);
        }

        // 6. Ban İşlemi
        await interaction.guild.bans.create(targetUser.id, {
            deleteMessageSeconds: deleteHistorySecs,
            reason: `${interaction.user.tag} (Süre: ${durationObj ? durationObj.label : 'Süresiz'}): ${reason}`
        });

        // 7. Arayüz ve Log Embed Tasarımları
        const banEmbed = new EmbedBuilder()
            .setTitle('🚫 Üye Sunucudan Yasaklandı')
            .setColor('#ED4245')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }) || null)
            .addFields(
                { name: '👤 Kullanıcı', value: `${targetUser} (\`${targetUser.tag}\`)`, inline: true },
                { name: '🆔 Kullanıcı ID', value: `\`${targetUser.id}\``, inline: true },
                { name: '🛡️ Yasaklayan Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: '⏳ Yasak Süresi', value: durationObj ? `\`${durationObj.label}\`` : '`Süresiz`', inline: true },
                { name: '🗑️ Silinen Mesajlar', value: deleteHistorySecs > 0 ? `\`Son ${deleteHistorySecs / 3600} Saat\`` : '`Silinmedi`', inline: true },
                { name: '📝 Gerekçe / Sebep', value: `\`${reason}\``, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'TBS Moderasyon Sistemi', iconURL: interaction.client.user.avatarURL() });

        await interaction.reply({ embeds: [banEmbed] });

        // Log Kanalına Gönder
        const logChannelId = global.ticketLogKanals.get(guildId);
        const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
        if (logChannel) {
            await logChannel.send({ embeds: [banEmbed] }).catch(() => {});
        }
    }
};
