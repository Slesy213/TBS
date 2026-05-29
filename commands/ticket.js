const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder
} = require('discord.js');

const ticketManager = require('../ticketManager.js');
const { updateSettings } = require('../db.js');

// Global setup sessions in memory for wizard draft persistence
global.ticketSetups = global.ticketSetups || new Map();

function getSetupSession(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!global.ticketSetups.has(key)) {
        global.ticketSetups.set(key, {
            mesaj: 'Destek talebi oluşturmak için aşağıdaki kategorilerden birine tıklayın.',
            resimUrl: null,
            kategoriId: null,
            yetkiliRolId: null,
            logKanalId: null,
            customization: {
                color: '#5865F2',
                categories: [] // Custom categories list
            }
        });
    }
    return global.ticketSetups.get(key);
}

// Default ticket types
const defaultTypes = [
    { id: 'genel', label: 'Genel Destek', emoji: '🎫', renk: 0x5865F2, kanalAdi: 'genel-destek', roleId: null },
    { id: 'teknik', label: 'Teknik Destek', emoji: '🔧', renk: 0x57F287, kanalAdi: 'teknik-destek', roleId: null },
    { id: 'sikayet', label: 'Şikayet', emoji: '📋', renk: 0xFEE75C, kanalAdi: 'sikayet', roleId: null },
    { id: 'ban_itiraz', label: 'Ban İtiraz', emoji: '🔨', renk: 0xED4245, kanalAdi: 'ban-itiraz', roleId: null }
];

// ─── GENERATE WIZARD PREVIEW EMBED ───
function generateTicketWizardEmbed(session, guildName) {
    const categoriesList = (session.customization.categories && session.customization.categories.length > 0)
        ? session.customization.categories.map((c, i) => `• **${c.emoji} ${c.label}** (ID: \`${c.id}\`, Kanal: \`${c.kanalAdi}\`, Rol: ${c.roleId ? `<@&${c.roleId}>` : 'Varsayılan'})`).join('\n')
        : 'Varsayılan Türler Aktif:\n• 🎫 Genel Destek\n• 🔧 Teknik Destek\n• 📋 Şikayet\n• 🔨 Ban İtiraz';

    const embed = new EmbedBuilder()
        .setColor(session.customization?.color || '#5865F2')
        .setTitle('🛠️ Slesy Ticket Kurulum Sihirbazı')
        .setDescription(`Aşağıdaki paneli kullanarak ticket sisteminizi özelleştirin. Kurulumu bitirdikten sonra **Paneli Kur** butonuna basarak yayınlayabilirsiniz.\n\n` +
            `📝 **Panel Mesajı:** \`${session.mesaj || 'Varsayılan'}\`\n` +
            `🖼️ **Panel Resmi:** \`${session.resimUrl || 'Belirtilmedi'}\`\n` +
            `📂 **Ticket Kategorisi:** ${session.kategoriId ? `<#${session.kategoriId}>` : '`Ayarlanmadı` (Slash seçimi ile girildi)'}\n` +
            `👤 **Yetkili Rolü:** ${session.yetkiliRolId ? `<@&${session.yetkiliRolId}>` : '`Ayarlanmadı` (Slash seçimi ile girildi)'}\n` +
            `📋 **Log Kanalı:** ${session.logKanalId ? `<#${session.logKanalId}>` : '`Ayarlanmadı` (Slash seçimi ile girildi)'}`)
        .addFields({
            name: '📂 Destek Türleri / Kategorileri',
            value: categoriesList
        })
        .setTimestamp()
        .setFooter({ text: `${guildName} | Slesy Ticket Yönetim Paneli` });

    return embed;
}

// ─── GENERATE WIZARD BUTTONS ───
function generateTicketWizardButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_basic').setLabel('✍️ Görsel & Panel Ayarları').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories').setLabel('➕ Özel Destek Türü Ekle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories_clear').setLabel('🗑️ Türleri Sıfırla').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_launch').setLabel('🚀 Paneli Kur ve Aktifleştir').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_ticket_cancel').setLabel('❌ Kurulumu İptal Et').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Gelişmiş destek talebi (ticket) sistemi (60+ Özellik)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

        // SUBCOMMAND: KURULUM
        .addSubcommand(sub =>
            sub.setName('kurulum')
                .setDescription('İnteraktif ticket kurulum sihirbazını açar')
                .addChannelOption(opt => opt.setName('kategori').setDescription('Destek talebi kanallarının açılacağı kategori').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addRoleOption(opt => opt.setName('yetkili_rol').setDescription('Destek taleplerine bakacak yetkili rolü').setRequired(true))
                .addChannelOption(opt => opt.setName('log_kanal').setDescription('Destek talebi loglarının gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )

        // SUBCOMMAND: EKLE
        .addSubcommand(sub =>
            sub.setName('ekle')
                .setDescription('Destek kanalına bir üye ekler')
                .addUserOption(opt => opt.setName('uye').setDescription('Eklenecek üye').setRequired(true))
        )

        // SUBCOMMAND: ÇIKAR
        .addSubcommand(sub =>
            sub.setName('çıkar')
                .setDescription('Destek kanalından bir üyeyi çıkarır')
                .addUserOption(opt => opt.setName('uye').setDescription('Çıkarılacak üye').setRequired(true))
        )

        // SUBCOMMAND: KAPAT
        .addSubcommand(sub =>
            sub.setName('kapat')
                .setDescription('Destek kanalını kapatır (sohbet geçmişi kaydedilir)')
        )

        // SUBCOMMAND: KİLİTLE
        .addSubcommand(sub =>
            sub.setName('kilitle')
                .setDescription('Destek kanalını kilitleyerek üyenin yazmasını engeller')
        )

        // SUBCOMMAND: KİLİT AÇ
        .addSubcommand(sub =>
            sub.setName('kilit-aç')
                .setDescription('Destek kanalının kilidini kaldırır')
        )

        // SUBCOMMAND: ARŞİVLE
        .addSubcommand(sub =>
            sub.setName('arşivle')
                .setDescription('Destek kanalını arşivler (üye erişimi kesilir)')
        )

        // SUBCOMMAND: AD DEĞİŞTİR
        .addSubcommand(sub =>
            sub.setName('ad-değiştir')
                .setDescription('Destek kanalının adını değiştirir')
                .addStringOption(opt => opt.setName('yeni_ad').setDescription('Yeni kanal adı').setRequired(true))
        )

        // SUBCOMMAND: ÖNCELİK
        .addSubcommand(sub =>
            sub.setName('öncelik')
                .setDescription('Destek kanalının öncelik seviyesini belirler')
                .addStringOption(opt => opt.setName('değer').setDescription('Öncelik derecesi').setRequired(true).addChoices(
                    { name: 'Düşük', value: 'Düşük' },
                    { name: 'Orta', value: 'Orta' },
                    { name: 'Yüksek', value: 'Yüksek' },
                    { name: 'Acil', value: 'Acil' }
                ))
        )

        // SUBCOMMAND: AKTAR
        .addSubcommand(sub =>
            sub.setName('aktar')
                .setDescription('Destek talebini başka bir yetkiliye veya role aktarır')
                .addUserOption(opt => opt.setName('yetkili').setDescription('Aktarılacak yetkili').setRequired(false))
                .addRoleOption(opt => opt.setName('rol').setDescription('Aktarılacak yetkili rolü').setRequired(false))
        )

        // SUBCOMMAND: NOT
        .addSubcommand(sub =>
            sub.setName('not')
                .setDescription('Destek talebine yetkililere özel gizli not ekler')
                .addStringOption(opt => opt.setName('not_metni').setDescription('Not içeriği').setRequired(true))
        )

        // SUBCOMMAND: İSTATİSTİK
        .addSubcommand(sub =>
            sub.setName('istatistik')
                .setDescription('Destek ekibinin ve taleplerin istatistiklerini gösterir')
        )

        // SUBCOMMAND: KARALİSTE
        .addSubcommand(sub =>
            sub.setName('karaliste')
                .setDescription('Kullanıcıyı destek sisteminden engeller/engelini kaldırır')
                .addStringOption(opt => opt.setName('işlem').setDescription('İşlem türü').setRequired(true).addChoices(
                    { name: 'Ekle', value: 'ekle' },
                    { name: 'Çıkar', value: 'cikar' },
                    { name: 'Listele', value: 'liste' }
                ))
                .addUserOption(opt => opt.setName('kullanici').setDescription('İşlem yapılacak üye').setRequired(false))
        ),

    async execute(interaction, client) {
        const member = interaction.member;
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();
        const ticketYetkiliRol = global.ticketYetkiliRols.get(guildId);

        // Subcommands requiring Administrator/ManageGuild permissions
        const adminSubcommands = ['kurulum', 'karaliste', 'istatistik'];
        if (adminSubcommands.includes(subcommand)) {
            if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ Bu yönetim komutunu kullanmak için `Sunucuyu Yönet` veya `Yönetici` yetkisine sahip olmalısınız.',
                    ephemeral: true
                });
            }
        } else {
            // Staff subcommands
            const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) || 
                            member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                            (ticketYetkiliRol && member.roles.cache.has(ticketYetkiliRol));
                            
            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Bu komutu kullanmak için gerekli yetkiye sahip değilsiniz.',
                    ephemeral: true
                });
            }
        }

        // ─── SUBCOMMAND: KURULUM ───
        if (subcommand === 'kurulum') {
            const kategori = interaction.options.getChannel('kategori');
            const yetkiliRol = interaction.options.getRole('yetkili_rol');
            const logKanal = interaction.options.getChannel('log_kanal');

            const session = getSetupSession(guildId, interaction.user.id);
            session.kategoriId = kategori.id;
            session.yetkiliRolId = yetkiliRol.id;
            session.logKanalId = logKanal.id;

            const embed = generateTicketWizardEmbed(session, interaction.guild.name);
            const buttons = generateTicketWizardButtons();

            await interaction.reply({
                embeds: [embed],
                components: buttons,
                ephemeral: true
            });
        }

        // ─── SUBCOMMAND: EKLE ───
        else if (subcommand === 'ekle') {
            await interaction.deferReply();
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.editReply('❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.');

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            });

            await interaction.editReply(`✅ ${memberTarget} başarıyla destek talebine eklendi.`);
        }

        // ─── SUBCOMMAND: ÇIKAR ───
        else if (subcommand === 'çıkar') {
            await interaction.deferReply();
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.editReply('❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.');

            if (memberTarget.id === t.creatorId) {
                return interaction.editReply('❌ Destek talebinin sahibini kanaldan çıkaramazsınız.');
            }

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: false
            });

            await interaction.editReply(`✅ ${memberTarget} başarıyla destek talebinden çıkarıldı.`);
        }

        // ─── SUBCOMMAND: KAPAT ───
        else if (subcommand === 'kapat') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            await interaction.reply('🔒 Destek talebi kapatılıyor...');
            await ticketManager.closeTicket(client, interaction.channel.id, interaction.user.id);
        }

        // ─── SUBCOMMAND: KİLİTLE ───
        else if (subcommand === 'kilitle') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            t.status = 'locked';
            await ticketManager.saveGuildTickets(guildId);

            await interaction.channel.permissionOverwrites.edit(t.creatorId, {
                SendMessages: false
            }).catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setDescription('🔒 Destek talebi kilitlendi. Bilet sahibinin yazma yetkisi kaldırıldı.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: KİLİT AÇ ───
        else if (subcommand === 'kilit-aç') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            t.status = 'open';
            await ticketManager.saveGuildTickets(guildId);

            await interaction.channel.permissionOverwrites.edit(t.creatorId, {
                SendMessages: true
            }).catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setDescription('🔓 Destek talebi kilidi açıldı. Bilet sahibi tekrar mesaj gönderebilir.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: ARŞİVLE ───
        else if (subcommand === 'arşivle') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            t.status = 'archived';
            await ticketManager.saveGuildTickets(guildId);

            await interaction.channel.permissionOverwrites.edit(t.creatorId, {
                ViewChannel: false
            }).catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0xE67E22)
                .setDescription(`📂 Destek talebi arşivlendi. Kullanıcı erişimi kapatıldı.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: AD DEĞİŞTİR ───
        else if (subcommand === 'ad-değiştir') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            const yeniAd = interaction.options.getString('yeni_ad').toLowerCase().replace(/[^a-z0-9_-]/g, '');
            await interaction.channel.setName(yeniAd);
            await interaction.reply(`✅ Kanal adı başarıyla \`${yeniAd}\` olarak değiştirildi.`);
        }

        // ─── SUBCOMMAND: ÖNCELİK ───
        else if (subcommand === 'öncelik') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            const deger = interaction.options.getString('değer');
            t.priority = deger;
            await ticketManager.saveGuildTickets(guildId);

            const currentName = interaction.channel.name.replace(/^(dusuk|orta|yuksek|acil)-/, '');
            const prefixMap = { 'Düşük': 'dusuk-', 'Orta': 'orta-', 'Yüksek': 'yuksek-', 'Acil': 'acil-' };
            await interaction.channel.setName(`${prefixMap[deger] || ''}${currentName}`).catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setDescription(`📊 Destek talebi öncelik derecesi **${deger}** olarak güncellendi.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: AKTAR ───
        else if (subcommand === 'aktar') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            const yetkili = interaction.options.getUser('yetkili');
            const rol = interaction.options.getRole('rol');

            if (yetkili) {
                t.claimedBy = yetkili.id;
                await ticketManager.saveGuildTickets(guildId);

                await interaction.channel.permissionOverwrites.edit(yetkili.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});

                await interaction.reply(`💼 Destek talebi yetkili <@${yetkili.id}> kullanıcısına aktarıldı.`);
            } else if (rol) {
                await interaction.channel.permissionOverwrites.edit(rol.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});
                await interaction.reply(`💼 Destek talebi <@&${rol.id}> rolündeki yetkililere aktarıldı.`);
            } else {
                await interaction.reply({ content: '❌ Lütfen aktarılacak bir yetkili veya rol seçin.', ephemeral: true });
            }
        }

        // ─── SUBCOMMAND: NOT ───
        else if (subcommand === 'not') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            const notMetni = interaction.options.getString('not_metni');
            t.notes = t.notes || [];
            t.notes.push({
                authorId: interaction.user.id,
                text: notMetni,
                timestamp: Date.now()
            });
            await ticketManager.saveGuildTickets(guildId);

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📝 Gizli Not Eklendi')
                .setDescription(notMetni)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: İSTATİSTİK ───
        else if (subcommand === 'istatistik') {
            await interaction.deferReply({ ephemeral: true });

            const serverTickets = ticketManager.tickets.filter(x => x.guildId === guildId);
            const totalCount = serverTickets.length;
            const openCount = serverTickets.filter(x => x.status === 'open').length;
            const closedCount = serverTickets.filter(x => x.status === 'closed').length;

            let staffStatsText = '';
            for (const [staffId, stats] of Object.entries(ticketManager.staffStats)) {
                const avgRating = stats.ratings.length > 0
                    ? (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length).toFixed(1)
                    : 'Yok';
                staffStatsText += `• <@${staffId}>: Sahiplenilen: \`${stats.claimedCount}\` | Kapatılan: \`${stats.closedCount}\` | Puan: \`${avgRating} ⭐\`\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 Destek Talepleri İstatistikleri')
                .addFields(
                    { name: 'Toplam Destek Kanalı', value: `\`${totalCount}\``, inline: true },
                    { name: 'Aktif Talepler', value: `\`${openCount}\``, inline: true },
                    { name: 'Kapatılan Talepler', value: `\`${closedCount}\``, inline: true },
                    { name: 'Yetkili Performans Tablosu', value: staffStatsText || 'Henüz yetkili verisi bulunmuyor.' }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        // ─── SUBCOMMAND: KARALİSTE ───
        else if (subcommand === 'karaliste') {
            await interaction.deferReply({ ephemeral: true });
            const islem = interaction.options.getString('işlem');
            const targetUser = interaction.options.getUser('kullanici');

            if (islem === 'ekle') {
                if (!targetUser) return interaction.editReply({ content: '❌ Kullanıcı belirtmelisiniz.' });
                if (ticketManager.blacklist.includes(targetUser.id)) {
                    return interaction.editReply({ content: '⚠️ Kullanıcı zaten ticket kara listesinde.' });
                }
                ticketManager.blacklist.push(targetUser.id);
                await ticketManager.saveGuildTickets(guildId);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı ticket kara listesine eklendi. Artık destek talebi oluşturamaz.` });
            } 
            else if (islem === 'cikar') {
                if (!targetUser) return interaction.editReply({ content: '❌ Kullanıcı belirtmelisiniz.' });
                if (!ticketManager.blacklist.includes(targetUser.id)) {
                    return interaction.editReply({ content: '⚠️ Kullanıcı ticket kara listesinde değil.' });
                }
                const index = ticketManager.blacklist.indexOf(targetUser.id);
                ticketManager.blacklist.splice(index, 1);
                await ticketManager.saveGuildTickets(guildId);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı ticket kara listesinden çıkarıldı.` });
            } 
            else if (islem === 'liste') {
                if (ticketManager.blacklist.length === 0) {
                    return interaction.editReply({ content: '📄 Ticket kara listesi boş.' });
                }
                const listStr = ticketManager.blacklist.map(id => `• <@${id}> (\`${id}\`)`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('📄 Ticket Kara Listesi')
                    .setDescription(listStr)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },

    // ─── INITIALIZE TICKET EVENTS AND WIZARD INTERACTION LISTENERS ───
    init(client) {
        ticketManager.init(client);

        // Listen for Setup Wizard Interactions
        client.on('interactionCreate', async (interaction) => {
            const guildId = interaction.guild?.id;
            if (!guildId) return;

            if (interaction.isButton()) {
                const customId = interaction.customId;
                if (!customId.startsWith('setup_ticket_')) return;

                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                // 1. Basic details modal open
                if (customId === 'setup_ticket_basic') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_ticket_basic')
                        .setTitle('🎫 Ticket Görsel & Metin Ayarları');

                    const msgInput = new TextInputBuilder()
                        .setCustomId('panel_message')
                        .setLabel('Panel Açıklama Mesajı')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Destek talebi açmak için aşağıdaki butonlara tıklayın.')
                        .setValue(session.mesaj)
                        .setRequired(true);

                    const imgInput = new TextInputBuilder()
                        .setCustomId('panel_image')
                        .setLabel('Panel Görsel Resmi (URL)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://example.com/logo.png')
                        .setValue(session.resimUrl || '')
                        .setRequired(false);

                    const colInput = new TextInputBuilder()
                        .setCustomId('panel_color')
                        .setLabel('Panel Hex Rengi')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('#5865F2')
                        .setValue(session.customization.color)
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(msgInput),
                        new ActionRowBuilder().addComponents(imgInput),
                        new ActionRowBuilder().addComponents(colInput)
                    );

                    await interaction.showModal(modal);
                }

                // 2. Add custom category modal open
                else if (customId === 'setup_ticket_categories') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_ticket_categories')
                        .setTitle('➕ Özel Destek Türü Ekle');

                    const nameInput = new TextInputBuilder()
                        .setCustomId('category_name')
                        .setLabel('Destek Türü Adı')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: Ortaklık Anlaşmaları')
                        .setRequired(true);

                    const emojiInput = new TextInputBuilder()
                        .setCustomId('category_emoji')
                        .setLabel('Emoji')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 🤝')
                        .setRequired(true);

                    const prefixInput = new TextInputBuilder()
                        .setCustomId('category_prefix')
                        .setLabel('Kanal Öneki (ingilizce karakterler)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: ortaklik')
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(nameInput),
                        new ActionRowBuilder().addComponents(emojiInput),
                        new ActionRowBuilder().addComponents(prefixInput)
                    );

                    await interaction.showModal(modal);
                }

                // 3. Clear custom categories
                else if (customId === 'setup_ticket_categories_clear') {
                    session.customization.categories = [];
                    const embed = generateTicketWizardEmbed(session, interaction.guild.name);
                    const buttons = generateTicketWizardButtons();
                    await interaction.update({ embeds: [embed], components: buttons });
                }

                // 4. Launch ticket system panel
                else if (customId === 'setup_ticket_launch') {
                    if (!session.kategoriId || !session.yetkiliRolId || !session.logKanalId) {
                        return interaction.reply({
                            content: '❌ Hata: Sistemi aktifleştirmek için Kategori, Yetkili Rolü ve Log Kanalı önceden belirtilmiş olmalıdır.',
                            ephemeral: true
                        });
                    }

                    const finalEmbed = new EmbedBuilder()
                        .setColor(session.customization.color || '#5865F2')
                        .setDescription(session.mesaj)
                        .setTimestamp();

                    if (session.resimUrl) finalEmbed.setImage(session.resimUrl);

                    const categories = session.customization.categories.length > 0 
                        ? session.customization.categories 
                        : defaultTypes;

                    const buttons = categories.map(cat => 
                        new ButtonBuilder()
                            .setCustomId(`ticket_ac_${cat.id}`)
                            .setLabel(cat.label)
                            .setEmoji(cat.emoji)
                            .setStyle(cat.id === 'ban_itiraz' ? ButtonStyle.Danger : ButtonStyle.Success)
                    );

                    const rows = [];
                    for (let i = 0; i < buttons.length; i += 3) {
                        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
                    }

                    const message = await interaction.channel.send({
                        embeds: [finalEmbed],
                        components: rows
                    });

                    // Save configuration globally and inside Database
                    await updateSettings(guildId, {
                        ticket_kategori: session.kategoriId,
                        ticket_yetkili_rol: session.yetkiliRolId,
                        ticket_log_kanal: session.logKanalId,
                        guard_settings: {
                            ...global.guardSettings.get(guildId),
                            ticketCategories: session.customization.categories
                        }
                    });

                    global.ticketKategoris.set(guildId, session.kategoriId);
                    global.ticketYetkiliRols.set(guildId, session.yetkiliRolId);
                    global.ticketLogKanals.set(guildId, session.logKanalId);
                    
                    const gs = global.guardSettings.get(guildId) || {};
                    gs.ticketCategories = session.customization.categories;
                    global.guardSettings.set(guildId, gs);

                    global.ticketSetups.delete(`${guildId}-${userId}`);

                    await interaction.update({
                        content: `✅ **Ticket paneli başarıyla kuruldu ve aktifleştirildi!**\n[Panel Mesajı Bağlantısı](${interaction.channel.url}/${message.id})`,
                        embeds: [],
                        components: []
                    });
                }

                // 5. Cancel setup session
                else if (customId === 'setup_ticket_cancel') {
                    global.ticketSetups.delete(`${guildId}-${userId}`);
                    await interaction.update({
                        content: '❌ **Ticket kurulum sihirbazı iptal edildi ve taslak silindi.**',
                        embeds: [],
                        components: []
                    });
                }
            }

            else if (interaction.isModalSubmit()) {
                const customId = interaction.customId;
                if (!customId.startsWith('setup_modal_ticket_')) return;

                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                // Basic settings modal submit
                if (customId === 'setup_modal_ticket_basic') {
                    const mesaj = interaction.fields.getTextInputValue('panel_message');
                    const resim = interaction.fields.getTextInputValue('panel_image');
                    const color = interaction.fields.getTextInputValue('panel_color');

                    session.mesaj = mesaj;
                    session.resimUrl = resim ? resim.trim() : null;
                    if (color) session.customization.color = color.trim();

                    const embed = generateTicketWizardEmbed(session, interaction.guild.name);
                    const buttons = generateTicketWizardButtons();

                    await interaction.update({ embeds: [embed], components: buttons });
                }

                // Add custom category modal submit
                else if (customId === 'setup_modal_ticket_categories') {
                    const name = interaction.fields.getTextInputValue('category_name');
                    const emoji = interaction.fields.getTextInputValue('category_emoji');
                    const prefix = interaction.fields.getTextInputValue('category_prefix').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const uniqueId = `custom_${Date.now()}`;

                    const newCategory = {
                        id: uniqueId,
                        label: name,
                        emoji: emoji,
                        renk: 0x5865F2,
                        kanalAdi: prefix,
                        roleId: null
                    };

                    session.customization.categories.push(newCategory);

                    const embed = generateTicketWizardEmbed(session, interaction.guild.name);
                    const buttons = generateTicketWizardButtons();

                    await interaction.update({ embeds: [embed], components: buttons });
                }
            }
        });
    }
};
