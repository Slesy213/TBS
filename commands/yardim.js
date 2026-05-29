const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yardım')
        .setDescription('Botun tüm komutlarını ve detaylı yardım menüsünü gösterir'),

    name: 'yardım',

    async execute(interactionOrMessage, args, client) {
        const isSlash = interactionOrMessage.isChatInputCommand ? true : false;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guild = interactionOrMessage.guild;

        if (!client) {
            client = interactionOrMessage.client;
        }

        const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

        // Main Embed
        const mainEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('💎 Slesy Premium | Yardım ve Rehber Menüsü')
            .setDescription(`Merhaba **${user.username}**! Slesy gelişmiş yönetim, güvenlik ve destek botunun yardım merkezine hoş geldiniz.\n\nAşağıdaki açılır menüyü kullanarak komut kategorilerini, kullanımlarını ve detaylarını detaylıca inceleyebilirsiniz.\n\n🌐 **Sunucu Sayısı:** \`${client.guilds.cache.size}\`\n👥 **Toplam Kullanıcı:** \`${totalMembers}\`\n⚡ **Gecikme Süresi:** \`${client.ws.ping}ms\`\n\n🔗 [Destek Sunucumuz](https://discord.gg/tbs) | [Botu Davet Et](https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands)`)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setFooter({ text: `${user.username} tarafından istendi`, iconURL: user.displayAvatarURL({ dynamic: true }) });

        // Select Menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_select')
            .setPlaceholder('📂 Bir komut kategorisi seçin...')
            .addOptions([
                {
                    label: 'Ana Sayfa',
                    description: 'Genel bot istatistikleri ve bilgileri',
                    value: 'home',
                    emoji: '🏠'
                },
                {
                    label: 'Güvenlik & Moderasyon',
                    description: 'Koruma sistemleri ve moderasyon komutları',
                    value: 'moderation',
                    emoji: '🛡️'
                },
                {
                    label: 'Destek Talebi (Ticket)',
                    description: 'Bilet sistemi sihirbazı ve yönetimi',
                    value: 'ticket',
                    emoji: '🎫'
                },
                {
                    label: 'Çekiliş & Etkinlikler',
                    description: 'Çekiliş başlatma, sonlandırma ve yönetim',
                    value: 'giveaway',
                    emoji: '🎉'
                },
                {
                    label: 'Gelişmiş Anketler',
                    description: 'Anket oluşturma, bitirme ve grafik rapor',
                    value: 'poll',
                    emoji: '📊'
                },
                {
                    label: 'Genel & Sunucu Ayarları',
                    description: 'Sunucu analizi, profil, duyuru ve otorol',
                    value: 'general',
                    emoji: '⚙️'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        let sentMessage;
        if (isSlash) {
            sentMessage = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [row], fetchReply: true });
        } else {
            sentMessage = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [row] });
        }

        const collector = sentMessage.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: i => i.user.id === user.id,
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.customId !== 'help_select') return;

            const value = i.values[0];
            const updatedEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: `${user.username} tarafından istendi`, iconURL: user.displayAvatarURL({ dynamic: true }) });

            if (value === 'home') {
                updatedEmbed
                    .setTitle('💎 Slesy Premium | Yardım ve Rehber Menüsü')
                    .setDescription(`Merhaba **${user.username}**! Slesy gelişmiş yönetim, güvenlik ve destek botunun yardım merkezine hoş geldiniz.\n\nAşağıdaki açılır menüyü kullanarak komut kategorilerini, kullanımlarını ve detaylarını detaylıca inceleyebilirsiniz.\n\n🌐 **Sunucu Sayısı:** \`${client.guilds.cache.size}\`\n👥 **Toplam Kullanıcı:** \`${totalMembers}\`\n⚡ **Gecikme Süresi:** \`${client.ws.ping}ms\`\n\n🔗 [Destek Sunucumuz](https://discord.gg/tbs) | [Botu Davet Et](https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands)`);
            } 
            else if (value === 'moderation') {
                updatedEmbed
                    .setTitle('🛡️ Güvenlik & Moderasyon Komutları')
                    .setDescription('Sunucunuzun güvenliğini üst düzeyde tutmak ve moderasyon işlemlerini kolaylaştırmak için tasarlanan komutlar:')
                    .addFields(
                        { name: '🛡️ /guard', value: 'Sunucu koruma sistemini yönetir. (Spam, Rol, Kanal, Reklam, Webhook korumalarını açıp kapatabilirsiniz.)' },
                        { name: '🔨 /ban `[üye]` `[sebep]`', value: 'Kullanıcıyı sunucudan kalıcı olarak uzaklaştırır.' },
                        { name: '🔓 /unban `[kullanıcı_id]`', value: 'Kullanıcının yasaklamasını kaldırır.' },
                        { name: '🗑️ /temizle `[miktar]`', value: 'Belirtilen miktarda (1-100) mesajı kanaldan temizler.' }
                    );
            } 
            else if (value === 'ticket') {
                updatedEmbed
                    .setTitle('🎫 Destek Talebi (Ticket) Komutları')
                    .setDescription('Supabase veritabanı entegrasyonuna sahip, transcript raporlu, derecelendirme anketli destek sisteminin tüm komutları:')
                    .addFields(
                        { name: '⚙️ /ticket kurulum', value: 'Adım adım interaktif panel sihirbazını başlatır.' },
                        { name: '🔒 /ticket kapat', value: 'Destek kanalını kapatır, timeline ve mesaj kayıtlarını (HTML & TXT) log kanalına gönderir.' },
                        { name: '➕ /ticket ekle `[üye]`', value: 'Destek kanalına başka bir kullanıcıyı ekler.' },
                        { name: '➖ /ticket çıkar `[üye]`', value: 'Destek kanalından bir kullanıcıyı uzaklaştırır.' },
                        { name: '🔒 /ticket kilitle', value: 'Bilet sahibinin yazma yetkisini askıya alır.' },
                        { name: '🔓 /ticket kilit-aç', value: 'Bilet sahibinin yazma yetkisini tekrar açar.' },
                        { name: '📂 /ticket arşivle', value: 'Bilet sahibinin erişimini kesip kanalı yetkililere açık bırakır.' },
                        { name: '🏷️ /ticket ad-değiştir `[yeni_ad]`', value: 'Destek kanalının ismini günceller.' },
                        { name: '📊 /ticket öncelik `[Düşük/Orta/Yüksek/Acil]`', value: 'Destek talebinin aciliyet seviyesini belirler.' },
                        { name: '💼 /ticket aktar `[yetkili/rol]`', value: 'Talebi başka bir destek personeline veya role aktarır.' },
                        { name: '📝 /ticket not `[not_metni]`', value: 'Talep içine yetkililerin görebileceği gizli not bırakır.' },
                        { name: '📊 /ticket istatistik', value: 'Yetkililerin performans tablosunu ve talep sayılarını gösterir.' },
                        { name: '🚫 /ticket karaliste `[ekle/çıkar/liste]`', value: 'Kullanıcının destek talebi açmasını engeller.' }
                    );
            } 
            else if (value === 'giveaway') {
                updatedEmbed
                    .setTitle('🎉 Çekiliş & Etkinlik Komutları')
                    .setDescription('Gelişmiş katılım şartlı, rol bonuslu çekiliş komutları:')
                    .addFields(
                        { name: '🚀 /cekilis baslat', value: 'Arayüz üzerinden süre, ödül, kazanan sayısı, rol şartları, hesap yaşı gibi kısıtlamalar belirleyerek çekiliş başlatır.' },
                        { name: '📋 /cekilis liste', value: 'Sunucudaki aktif çekilişlerin durumlarını listeler.' },
                        { name: '❌ /cekilis iptal `[mesaj_id]`', value: 'Devam eden bir çekilişi sonlandırır ve iptal eder.' },
                        { name: '🔄 /cekilis yeniden-sec `[mesaj_id]`', value: 'Tamamlanmış bir çekiliş için yeni bir kazanan (yedek) belirler.' }
                    );
            } 
            else if (value === 'poll') {
                updatedEmbed
                    .setTitle('📊 Gelişmiş Anket Komutları')
                    .setDescription('Özelleştirilebilir seçenekli ve detaylı raporlamaya sahip anket komutları:')
                    .addFields(
                        { name: '📝 /anket olustur', value: 'Süre, çoklu oy, rol kısıtlaması, özel seçenekler ile gelişmiş anket tasarlar.' },
                        { name: '📋 /anket liste', value: 'Sunucudaki aktif anketlerin listesini verir.' },
                        { name: '🛑 /anket bitir `[mesaj_id]`', value: 'Aktif bir anketi erken sonlandırır.' },
                        { name: '📊 /anket sonuclar `[mesaj_id]`', value: 'Anketin detaylı oy dökümünü, yüzdelerini ve txt rapor dosyasını verir.' }
                    );
            } 
            else if (value === 'general') {
                updatedEmbed
                    .setTitle('⚙️ Genel & Sunucu Ayar Komutları')
                    .setDescription('Sunucu yönetimi ve genel bilgilendirme araçları:')
                    .addFields(
                        { name: '📊 /sunucu', value: 'Detaylı sunucu analitiği ve üye istatistiklerini gösterir.' },
                        { name: '👤 /kullanici `[üye]`', value: 'Belirtilen kullanıcının rollerini, katılım tarihini ve profil detaylarını gösterir.' },
                        { name: '🤖 /otorol', value: 'Sunucuya yeni katılan üyelere verilecek otomatik rolü belirler.' },
                        { name: '📢 /duyuru', value: 'Renkli, görselli ve şablonlu zengin duyuru mesajları oluşturur.' },
                        { name: '📨 /dm-gonder', value: 'Bot aracılığıyla sunucu üyelerine toplu duyuru DM\'i gönderir. (Yönetici Yetkisi)' },
                        { name: '🔊 /joinvoice', value: 'Botu belirtilen bir ses kanalına bağlar.' }
                    );
            }

            await i.update({ embeds: [updatedEmbed] }).catch(() => {});
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                selectMenu.setDisabled(true)
            );
            sentMessage.edit({ components: [disabledRow] }).catch(() => {});
        });
    }
};
