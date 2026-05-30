const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ChannelType 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('temizle')
        .setDescription('Kanalda belirtilen miktarda mesajı gelişmiş filtrelerle temizler.')
        .addIntegerOption(option =>
            option.setName('miktar')
                .setDescription('Taranacak mesaj sayısı (1-100)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('hedef_kisi')
                .setDescription('Sadece bu kullanıcının mesajlarını siler.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('filtre')
                .setDescription('Silinecek mesaj türü filtresi.')
                .addChoices(
                    { name: '🤖 Sadece Bot Mesajları', value: 'bot' },
                    { name: '🔗 Sadece Link İçerenler', value: 'link' },
                    { name: '🖼️ Sadece Görsel/Medya İçerenler', value: 'medya' },
                    { name: '🎫 Sadece Sunucu Davet Linkleri', value: 'davet' },
                    { name: '😀 Sadece Emoji İçerenler', value: 'emoji' },
                    { name: '💻 Sadece Kod Blokları (```)', value: 'kod' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('metin')
                .setDescription('Sadece bu kelimeyi/cümleyi içeren mesajları siler.')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ignelenmisleri_koru')
                .setDescription('İğnelenmiş (pinned) mesajlar korunsun mu? (Varsayılan: Evet)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const miktar = interaction.options.getInteger('miktar');
        const targetUser = interaction.options.getUser('hedef_kisi');
        const filterType = interaction.options.getString('filtre');
        const queryText = interaction.options.getString('metin');
        const keepPinned = interaction.options.getBoolean('ignelenmisleri_koru') ?? true;

        if (miktar > 100 || miktar < 1) {
            return interaction.reply({
                content: '❌ Lütfen 1 ile 100 arasında bir sayı girin.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        // Mesajları çekelim (Filtreleme yapabilmek için miktar kadarını alıyoruz)
        const messages = await interaction.channel.messages.fetch({ limit: miktar }).catch(() => null);
        if (!messages || messages.size === 0) {
            return interaction.editReply({
                content: '❌ Temizlenecek herhangi bir mesaj bulunamadı.'
            });
        }

        let filtered = [...messages.values()];

        // 1. İğnelenmiş Mesaj Koruması
        if (keepPinned) {
            filtered = filtered.filter(m => !m.pinned);
        }

        // 2. Kullanıcı Filtresi
        if (targetUser) {
            filtered = filtered.filter(m => m.author.id === targetUser.id);
        }

        // 3. İçerik Arama Filtresi
        if (queryText) {
            filtered = filtered.filter(m => m.content.toLowerCase().includes(queryText.toLowerCase()));
        }

        // 4. Tür Filtreleri
        if (filterType) {
            switch (filterType) {
                case 'bot':
                    filtered = filtered.filter(m => m.author.bot);
                    break;
                case 'link':
                    const linkRegex = /https?:\/\/[^\s]+/i;
                    filtered = filtered.filter(m => linkRegex.test(m.content));
                    break;
                case 'medya':
                    filtered = filtered.filter(m => m.attachments.size > 0 || m.embeds.length > 0);
                    break;
                case 'davet':
                    const inviteRegex = /(discord\.(gg|io|me|li)|discord\.com\/invite)/i;
                    filtered = filtered.filter(m => inviteRegex.test(m.content));
                    break;
                case 'emoji':
                    const emojiRegex = /(\p{Emoji_Presentation}|<a?:[a-zA-Z0-9_]+:[0-9]+>)/gu;
                    filtered = filtered.filter(m => emojiRegex.test(m.content));
                    break;
                case 'kod':
                    filtered = filtered.filter(m => m.content.includes('```'));
                    break;
            }
        }

        if (filtered.length === 0) {
            return interaction.editReply({
                content: '❌ Uygulanan filtrelere uygun temizlenecek mesaj bulunamadı.'
            });
        }

        // 14 Günden eski olan mesajları ayıralım (Discord bulkDelete kuralı)
        const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const bulkDeletable = [];
        const manuallyDeletable = [];

        for (const msg of filtered) {
            if (msg.createdTimestamp > fourteenDaysAgo) {
                bulkDeletable.push(msg);
            } else {
                manuallyDeletable.push(msg);
            }
        }

        let deletedCount = 0;

        // Toplu Silme İşlemini Yürüt
        if (bulkDeletable.length > 0) {
            try {
                const deleted = await interaction.channel.bulkDelete(bulkDeletable, true);
                deletedCount += deleted.size;
            } catch (err) {
                console.error('Kanal temizleme hatası:', err);
            }
        }

        const skippedCount = manuallyDeletable.length;

        // Raporlama Embed'i
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Kanal Temizleme Başarılı')
            .setColor('#3498DB')
            .setDescription(`**#${interaction.channel.name}** kanalında mesaj temizleme işlemi başarıyla tamamlandı.`)
            .addFields(
                { name: '🧹 Taranan Mesaj', value: `\`${messages.size}\` adet`, inline: true },
                { name: '✅ Silinen Mesaj', value: `\`${deletedCount}\` adet`, inline: true },
                { name: '🛡️ İğnelenmiş Koruması', value: keepPinned ? '🟢 `Aktif (Korundu)`' : '🔴 `Pasif`', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'TBS Yönetim & Moderasyon Sistemi', iconURL: interaction.client.user.avatarURL() });

        const activeFilters = [];
        if (targetUser) activeFilters.push(`Kullanıcı: ${targetUser.tag}`);
        if (filterType) activeFilters.push(`Filtre: ${filterType}`);
        if (queryText) activeFilters.push(`Aranan: "${queryText}"`);

        if (activeFilters.length > 0) {
            embed.addFields({ name: '🔍 Uygulanan Filtreler', value: `\`${activeFilters.join(', ')}\``, inline: false });
        }

        if (skippedCount > 0) {
            embed.addFields({ 
                name: '⚠️ Atlanan Mesajlar', 
                value: `\`${skippedCount}\` adet mesaj **14 günden eski** olduğu için Discord API kuralları gereği silinemedi.`, 
                inline: false 
            });
        }

        await interaction.editReply({ embeds: [embed] });

        // Log Kanalına Gönder
        const logChannelId = global.ticketLogKanals.get(interaction.guild.id);
        const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ Kanal Temizlendi (Purge Log)')
                .setColor('#E67E22')
                .addFields(
                    { name: '📺 Kanal', value: `${interaction.channel} (\`#${interaction.channel.name}\`)`, inline: true },
                    { name: '🛡️ Temizleyen Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                    { name: '🧹 Silinen Mesaj', value: `\`${deletedCount}\` adet`, inline: true },
                    { name: '🔍 Filtreler', value: activeFilters.length > 0 ? `\`${activeFilters.join(', ')}\`` : '`Uygulanmadı`', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'TBS Günlük Kayıtları' });
            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
};
