const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    UserSelectMenuBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const giveawayManager = require('../giveawayManager.js');
const { updateSetting } = require('../db.js');

// Global setup sessions in memory
global.giveawaySetups = global.giveawaySetups || new Map();

function getSetupSession(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!global.giveawaySetups.has(key)) {
        global.giveawaySetups.set(key, {
            reward: null,
            sureText: null,
            winnersCount: 1,
            description: null,
            requirements: {
                requiredRoles: [],
                roleMode: 'OR',
                blacklistRoleId: null,
                minAccountAge: 0,
                minServerAge: 0,
                partnerServerId: null,
                partnerServerLink: null
            },
            bypassRoles: [],
            bonusRoles: {}, // roleId -> multiplier (2x, 3x etc)
            customization: {
                banner: null,
                thumbnail: null,
                color: '#FFD700',
                buttonLabel: 'Katıl 🎟️',
                buttonEmoji: '🎟️',
                winnerRole: null,
                claimDuration: 0,
                winnersText: null
            },
            maxParticipants: 0,
            useCaptcha: false
        });
    }
    return global.giveawaySetups.get(key);
}

// ─── GENERATE WIZARD PREVIEW EMBED ───
function generateWizardEmbed(session, guildName) {
    const embed = new EmbedBuilder()
        .setColor(session.customization?.color || '#FFD700')
        .setTitle('🛠️ Slesy Çekiliş Kurulum Sihirbazı')
        .setDescription(`Aşağıdaki paneli kullanarak çekilişinizi özelleştirin. Kurulumu bitirdikten sonra **Çekilişi Başlat** butonuna basarak yayınlayabilirsiniz.\n\n` +
            `🎁 **Ödül:** \`${session.reward || 'Ayarlanmadı'}\`\n` +
            `⏰ **Süre:** \`${session.sureText || 'Ayarlanmadı'}\`\n` +
            `🏆 **Kazanan Sayısı:** \`${session.winnersCount} Kişi\`\n` +
            `📝 **Açıklama:** \`${session.description || 'Belirtilmedi'}\`\n` +
            `👥 **Katılımcı Sınırı:** \`${session.maxParticipants > 0 ? session.maxParticipants : 'Sınırsız'}\``)
        .addFields(
            {
                name: '🔒 Katılım Şartları',
                value: `• Gerekli Rol(ler): ${session.requirements?.requiredRoles?.length > 0 ? session.requirements.requiredRoles.map(rid => `<@&${rid}>`).join(', ') : 'Yok'}\n` +
                    `• Eşleşme Modu: \`${session.requirements?.roleMode || 'OR'}\`\n` +
                    `• Yasaklı Rol: ${session.requirements?.blacklistRoleId ? `<@&${session.requirements.blacklistRoleId}>` : 'Yok'}\n` +
                    `• Hesap Yaşı (Gün): \`${session.requirements?.minAccountAge || 0} Gün\`\n` +
                    `• Sunucu Süresi (Gün): \`${session.requirements?.minServerAge || 0} Gün\`\n` +
                    `• Ortak Sunucu ID: \`${session.requirements?.partnerServerId || 'Yok'}\`\n` +
                    `• Güvenlik Doğrulaması (Captcha): \`${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}\``
            },
            {
                name: '🎟️ Bonus Roller & Muafiyetler',
                value: `• Muaf Roller (Bypass): ${session.bypassRoles?.length > 0 ? session.bypassRoles.map(rid => `<@&${rid}>`).join(', ') : 'Yok'}\n` +
                    `• Bonus Roller: ${Object.keys(session.bonusRoles || {}).length > 0 ? Object.entries(session.bonusRoles).map(([rid, mult]) => `<@&${rid}> (➔ **${mult}x**)`).join(', ') : 'Yok'}`
            },
            {
                name: '🎨 Görsel & Gelişmiş Ayarlar',
                value: `• Buton Yazısı: \`${session.customization?.buttonLabel || 'Katıl'}\`\n` +
                    `• Buton Emojisi: \`${session.customization?.buttonEmoji || '🎟️'}\`\n` +
                    `• Banner Görseli: \`${session.customization?.banner ? '🟢 Eklenmiş' : '🔴 Yok'}\`\n` +
                    `• Küçük Resim (Thumbnail): \`${session.customization?.thumbnail ? '🟢 Eklenmiş' : '🔴 Yok'}\`\n` +
                    `• Kazanana Rol Verme: ${session.customization?.winnerRole ? `<@&${session.customization.winnerRole}>` : 'Yok'}\n` +
                    `• Hak Talebi Süresi: \`${session.customization?.claimDuration || 0} Saat\`\n` +
                    `• Kazanan Tebrik Metni: \`${session.customization?.winnersText || 'Varsayılan'}\``
            }
        )
        .setTimestamp()
        .setFooter({ text: `${guildName} | Slesy Çekiliş Yönetim Paneli` });

    return embed;
}

// ─── GENERATE WIZARD BUTTONS ───
function generateWizardButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_btn_basic').setLabel('🎁 Temel Ayarlar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_btn_reqs').setLabel('🔒 Katılım Şartları').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_btn_visual').setLabel('🎨 Görsel Ayarlar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_btn_adv').setLabel('⚙️ Gelişmiş Ayarlar').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_btn_launch').setLabel('🚀 Çekilişi Başlat').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_btn_cancel').setLabel('❌ Kurulumu İptal Et').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('çekiliş')
        .setDescription('Gelişmiş çekiliş sistemi (40+ Özellik)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        // SUBCOMMAND: HIZLI BAŞLAT
        .addSubcommand(sub =>
            sub.setName('başlat')
                .setDescription('Hızlıca temel bir çekiliş başlatır')
                .addStringOption(opt => opt.setName('ödül').setDescription('Çekiliş ödülü').setRequired(true))
                .addStringOption(opt => opt.setName('süre').setDescription('Süre (Örn: 10m, 2h, 1d)').setRequired(true))
                .addIntegerOption(opt => opt.setName('kazanan').setDescription('Kazanan sayısı').setRequired(true))
                .addStringOption(opt => opt.setName('açıklama').setDescription('Açıklama metni').setRequired(false))
        )

        // SUBCOMMAND: INTERACTIVE SETUP
        .addSubcommand(sub =>
            sub.setName('kurulum')
                .setDescription('Çekiliş kurulum sihirbazını açar (40+ Özellik Ayarlanabilir)')
        )

        // SUBCOMMAND: FORCE END
        .addSubcommand(sub =>
            sub.setName('bitir')
                .setDescription('Aktif çekilişi anında sonlandırıp kazananları seçer')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: REROLL
        .addSubcommand(sub =>
            sub.setName('yeniden-çek')
                .setDescription('Sona ermiş çekilişten yeni kazanan(lar) seçer')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
                .addIntegerOption(opt => opt.setName('kazanan').setDescription('Seçilecek kişi sayısı').setRequired(false))
        )

        // SUBCOMMAND: CANCEL
        .addSubcommand(sub =>
            sub.setName('iptal')
                .setDescription('Aktif çekilişi iptal eder ve kaldırır')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: LIST
        .addSubcommand(sub =>
            sub.setName('liste')
                .setDescription('Sunucudaki aktif çekilişleri listeler')
        )

        // SUBCOMMAND: INFO
        .addSubcommand(sub =>
            sub.setName('bilgi')
                .setDescription('Bir çekilişin detaylı istatistik ve durum bilgisini gösterir')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: BLACKLIST
        .addSubcommand(sub =>
            sub.setName('karaliste')
                .setDescription('Çekiliş kara listesini yönetir')
                .addStringOption(opt => opt.setName('işlem').setDescription('İşlem seç').setRequired(true).addChoices(
                    { name: 'Ekle', value: 'ekle' },
                    { name: 'Çıkar', value: 'cikar' },
                    { name: 'Listele', value: 'liste' }
                ))
                .addUserOption(opt => opt.setName('kullanici').setDescription('İşlem yapılacak üye').setRequired(false))
        ),

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // ─── SUBCOMMAND: BAŞLAT ───
        if (subcommand === 'başlat') {
            await interaction.deferReply({ ephemeral: true });
            const reward = interaction.options.getString('ödül');
            const sureText = interaction.options.getString('süre');
            const winnersCount = interaction.options.getInteger('kazanan');
            const description = interaction.options.getString('açıklama') || 'Açıklama belirtilmedi.';

            const duration = giveawayManager.parseTime(sureText);
            if (!duration) {
                return interaction.editReply({ content: '❌ Geçersiz süre formatı! Örnek: `10m`, `2h`, `1d`' });
            }

            const data = {
                guildId,
                channelId: interaction.channel.id,
                reward,
                sureText,
                winnersCount,
                description,
                hostId: interaction.user.id,
                participants: [],
                winners: [],
                ended: false,
                requirements: {},
                bypassRoles: [],
                bonusRoles: {},
                customization: {
                    color: '#FFD700',
                    buttonLabel: 'Katıl',
                    buttonEmoji: '🎟️'
                }
            };

            const msgId = await giveawayManager.startGiveaway(client, data);
            if (!msgId) {
                return interaction.editReply({ content: '❌ Çekiliş başlatılırken bir hata oluştu.' });
            }

            await interaction.editReply({ content: `✅ Çekiliş başarıyla başlatıldı! [Çekiliş Mesajı](${interaction.channel.url}/${msgId})` });
        }

        // ─── SUBCOMMAND: KURULUM ───
        else if (subcommand === 'kurulum') {
            const session = getSetupSession(guildId, interaction.user.id);
            const embed = generateWizardEmbed(session, interaction.guild.name);
            const buttons = generateWizardButtons();

            await interaction.reply({
                embeds: [embed],
                components: buttons,
                ephemeral: true
            });
        }

        // ─── SUBCOMMAND: BİTİR ───
        else if (subcommand === 'bitir') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('mesaj_id');
            const result = await giveawayManager.forceEndGiveaway(client, guildId, messageId);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: '✅ Çekiliş başarıyla anında sonuçlandırıldı.' });
        }

        // ─── SUBCOMMAND: YENİDEN ÇEK ───
        else if (subcommand === 'yeniden-çek') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('mesaj_id');
            const count = interaction.options.getInteger('kazanan') || 1;

            const result = await giveawayManager.rerollGiveaway(client, guildId, messageId, count);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: '✅ Yeniden çekim başarıyla yapıldı.' });
        }

        // ─── SUBCOMMAND: İPTAL ───
        else if (subcommand === 'iptal') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('mesaj_id');

            const result = await giveawayManager.cancelGiveaway(client, guildId, messageId);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: '✅ Çekiliş başarıyla iptal edildi.' });
        }

        // ─── SUBCOMMAND: LİSTE ───
        else if (subcommand === 'liste') {
            const activeList = giveawayManager.giveaways.filter(g => g.guildId === guildId && !g.ended);
            if (activeList.length === 0) {
                return interaction.reply({ content: 'ℹ️ Sunucuda şu an aktif çekiliş bulunmuyor.', ephemeral: true });
            }

            const listStr = activeList.map(g => `• [${g.reward}](https://discord.com/channels/${guildId}/${g.channelId}/${g.messageId}) - ID: \`${g.messageId}\` - Kalan: <t:${Math.floor(g.endAt/1000)}:R>`).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🎉 Sunucu Aktif Çekilişleri (${activeList.length})`)
                .setDescription(listStr)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ─── SUBCOMMAND: BİLGİ ───
        else if (subcommand === 'bilgi') {
            const messageId = interaction.options.getString('mesaj_id');
            const giveaway = giveawayManager.giveaways.find(g => g.messageId === messageId && g.guildId === guildId);
            if (!giveaway) {
                return interaction.reply({ content: '❌ Çekiliş bulunamadı.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`📊 Çekiliş Bilgi Raporu: ${giveaway.reward}`)
                .addFields(
                    { name: 'Çekiliş ID / Mesaj ID', value: `\`${giveaway.messageId}\``, inline: true },
                    { name: 'Durum', value: giveaway.ended ? '🔴 Sona Erdi' : '🟢 Aktif', inline: true },
                    { name: 'Katılımcı Sayısı', value: `\`${giveaway.participants.length} Kişi\``, inline: true },
                    { name: 'Kazanan Sayısı', value: `\`${giveaway.winnersCount} Kişi\``, inline: true },
                    { name: 'Sponsor/Başlatan', value: `<@${giveaway.hostId}>`, inline: true },
                    { name: 'Kanal', value: `<#${giveaway.channelId}>`, inline: true }
                )
                .setTimestamp();

            if (giveaway.ended && giveaway.winners.length > 0) {
                embed.addFields({ name: '🏆 Kazananlar', value: giveaway.winners.map(id => `<@${id}>`).join('\n') });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ─── SUBCOMMAND: KARALİSTE ───
        else if (subcommand === 'karaliste') {
            await interaction.deferReply({ ephemeral: true });
            const islem = interaction.options.getString('işlem');
            const targetUser = interaction.options.getUser('kullanici');
            const settings = global.guardSettings.get(guildId) || {};
            settings.giveawayBlacklist = settings.giveawayBlacklist || [];

            if (islem === 'ekle') {
                if (!targetUser) return interaction.editReply({ content: '❌ Kullanıcı belirtmelisiniz.' });
                if (settings.giveawayBlacklist.includes(targetUser.id)) {
                    return interaction.editReply({ content: '⚠️ Kullanıcı zaten çekiliş kara listesinde bulunuyor.' });
                }
                settings.giveawayBlacklist.push(targetUser.id);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, 'guard_settings', settings);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı çekiliş kara listesine eklendi. Artık hiçbir çekilişe katılamaz.` });
            } 
            else if (islem === 'cikar') {
                if (!targetUser) return interaction.editReply({ content: '❌ Kullanıcı belirtmelisiniz.' });
                if (!settings.giveawayBlacklist.includes(targetUser.id)) {
                    return interaction.editReply({ content: '⚠️ Kullanıcı çekiliş kara listesinde değil.' });
                }
                settings.giveawayBlacklist = settings.giveawayBlacklist.filter(id => id !== targetUser.id);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, 'guard_settings', settings);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı çekiliş kara listesinden çıkarıldı.` });
            } 
            else if (islem === 'liste') {
                if (settings.giveawayBlacklist.length === 0) {
                    return interaction.editReply({ content: '📄 Çekiliş kara listesi boş.' });
                }
                const listStr = settings.giveawayBlacklist.map(id => `• <@${id}> (\`${id}\`)`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('📄 Çekiliş Kara Listesi')
                    .setDescription(listStr)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },

    // ─── INITIALIZE TIMER AND GLOBAL INTERACTIONS LISTENER FOR WIZARD ───
    init(client) {
        // Start giveawayManager timer resume
        giveawayManager.init(client);

        // Listen for Setup Wizard Interactions
        client.on('interactionCreate', async (interaction) => {
            const guildId = interaction.guild?.id;
            if (!guildId) return;

            // Handle Buttons inside Setup Wizard
            if (interaction.isButton()) {
                const customId = interaction.customId;
                if (!customId.startsWith('setup_btn_')) return;

                const userId = interaction.user.id;
                // Only creator can edit their setup session
                const session = getSetupSession(guildId, userId);

                // 1. BASIC SETTINGS BUTTON
                if (customId === 'setup_btn_basic') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_basic')
                        .setTitle('🎁 Çekiliş Temel Ayarları');

                    const odulInput = new TextInputBuilder()
                        .setCustomId('basic_reward')
                        .setLabel('Hediye / Ödül Nedir?')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: Nitro Classic, Sponsor Paketi vb.')
                        .setValue(session.reward || '')
                        .setRequired(true);

                    const sureInput = new TextInputBuilder()
                        .setCustomId('basic_duration')
                        .setLabel('Çekiliş Süresi')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 10s (saniye), 15m (dakika), 2h (saat), 1d (gün)')
                        .setValue(session.sureText || '')
                        .setRequired(true);

                    const kazananInput = new TextInputBuilder()
                        .setCustomId('basic_winners')
                        .setLabel('Kazanan Sayısı')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 1 veya 3')
                        .setValue(session.winnersCount.toString())
                        .setRequired(true);

                    const descInput = new TextInputBuilder()
                        .setCustomId('basic_desc')
                        .setLabel('Açıklama Metni')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Çekilişe ait ekstra açıklamalar')
                        .setValue(session.description || '')
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(odulInput),
                        new ActionRowBuilder().addComponents(sureInput),
                        new ActionRowBuilder().addComponents(kazananInput),
                        new ActionRowBuilder().addComponents(descInput)
                    );

                    await interaction.showModal(modal);
                }

                // 2. REQUIREMENTS BUTTON
                else if (customId === 'setup_btn_reqs') {
                    // Send selection menus for roles and open a modal for age checks
                    const embed = new EmbedBuilder()
                        .setColor('#E67E22')
                        .setTitle('🔒 Katılım Şartları Ayarları')
                        .setDescription('Çekilişe katılım şartı olarak belirlemek istediğiniz rolleri, yaş limitlerini veya ortak sunucu kimliklerini aşağıdaki menüleri kullanarak seçin.\n\n' +
                            `• **Gerekli Roller:** Gerekli rollerden hangilerini seçtiğinizi aşağıdaki ilk menüden seçin.\n` +
                            `• **Rol Eşleşme Modu:** Üyenin bu rollerin *hepsine* mi yoksa *herhangi birine* mi sahip olması gerektiğini belirler.\n` +
                            `• **Yasaklı Rol:** Çekilişe katılması yasak olan rolü ikinci menüden seçin.`);

                    const roleSelectRequired = new RoleSelectMenuBuilder()
                        .setCustomId('setup_select_required_roles')
                        .setPlaceholder('🔒 Gerekli Rolleri Seçin (Çoklu Seçilebilir)')
                        .setMinValues(0)
                        .setMaxValues(10);

                    const roleSelectBlacklist = new RoleSelectMenuBuilder()
                        .setCustomId('setup_select_blacklist_role')
                        .setPlaceholder('🚫 Yasaklı Rol Seçin')
                        .setMinValues(0)
                        .setMaxValues(1);

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_btn_reqs_modal').setLabel('✍️ Hesap Yaşı & Ortak Sunucu Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        embeds: [embed],
                        components: [
                            new ActionRowBuilder().addComponents(roleSelectRequired),
                            new ActionRowBuilder().addComponents(roleSelectBlacklist),
                            buttonRow
                        ]
                    });
                }

                // 3. VISUAL SETTINGS BUTTON
                else if (customId === 'setup_btn_visual') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_visual')
                        .setTitle('🎨 Görsel & Buton Ayarları');

                    const colorInput = new TextInputBuilder()
                        .setCustomId('visual_color')
                        .setLabel('Embed Rengi (Hex Kodu)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: #FF0000 veya #FFD700')
                        .setValue(session.customization.color)
                        .setRequired(false);

                    const buttonLabelInput = new TextInputBuilder()
                        .setCustomId('visual_btn_label')
                        .setLabel('Buton Üzerindeki Yazı')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Katıl 🎟️')
                        .setValue(session.customization.buttonLabel)
                        .setRequired(false);

                    const buttonEmojiInput = new TextInputBuilder()
                        .setCustomId('visual_btn_emoji')
                        .setLabel('Buton Emojisi')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('🎟️')
                        .setValue(session.customization.buttonEmoji || '')
                        .setRequired(false);

                    const bannerInput = new TextInputBuilder()
                        .setCustomId('visual_banner')
                        .setLabel('Görsel Banner Linki (URL)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://example.com/image.png')
                        .setValue(session.customization.banner || '')
                        .setRequired(false);

                    const thumbInput = new TextInputBuilder()
                        .setCustomId('visual_thumbnail')
                        .setLabel('Küçük Resim Linki (URL)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://example.com/logo.png')
                        .setValue(session.customization.thumbnail || '')
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(colorInput),
                        new ActionRowBuilder().addComponents(buttonLabelInput),
                        new ActionRowBuilder().addComponents(buttonEmojiInput),
                        new ActionRowBuilder().addComponents(bannerInput),
                        new ActionRowBuilder().addComponents(thumbInput)
                    );

                    await interaction.showModal(modal);
                }

                // 4. ADVANCED SETTINGS BUTTON
                else if (customId === 'setup_btn_adv') {
                    const embed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setTitle('⚙️ Gelişmiş Çekiliş Ayarları')
                        .setDescription('Çekiliş kazananlarına rol verilmesi, hak talebi (claim) süresi ve bypass edilecek / bonus alacak roller gibi detaylı ayarlar.\n\n' +
                            `• **Bypass Rolleri:** Çekiliş katılım şartlarını (hesap yaşı vb.) es geçen muaf roller.\n` +
                            `• **Kazanana Verilecek Rol:** Çekilişi kazanan üyelere otomatik atanacak rol.\n`);

                    const roleSelectBypass = new RoleSelectMenuBuilder()
                        .setCustomId('setup_select_bypass_roles')
                        .setPlaceholder('🎟️ Şartları Es Geçecek Bypass Rollerini Seçin')
                        .setMinValues(0)
                        .setMaxValues(10);

                    const roleSelectWinner = new RoleSelectMenuBuilder()
                        .setCustomId('setup_select_winner_role')
                        .setPlaceholder('🏆 Kazanana Otomatik Verilecek Rolü Seçin')
                        .setMinValues(0)
                        .setMaxValues(1);

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_btn_adv_modal').setLabel('✍️ Hak Talebi, Maks Katılımcı & Bonus').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_btn_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        embeds: [embed],
                        components: [
                            new ActionRowBuilder().addComponents(roleSelectBypass),
                            new ActionRowBuilder().addComponents(roleSelectWinner),
                            buttonRow
                        ]
                    });
                }

                // BACK TO MAIN PANEL
                else if (customId === 'setup_btn_back_to_main') {
                    const embed = generateWizardEmbed(session, interaction.guild.name);
                    const buttons = generateWizardButtons();
                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // REQS EXTRA DETAILS MODAL
                else if (customId === 'setup_btn_reqs_modal') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_reqs_details')
                        .setTitle('✍️ Yaş & Ortak Sunucu Koruması');

                    const accAgeInput = new TextInputBuilder()
                        .setCustomId('reqs_account_age')
                        .setLabel('Asgari Hesap Yaşı (Gün)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 7 (7 günden yeni hesaplar katılamaz)')
                        .setValue(session.requirements.minAccountAge.toString())
                        .setRequired(false);

                    const srvAgeInput = new TextInputBuilder()
                        .setCustomId('reqs_server_age')
                        .setLabel('Asgari Sunucu Süresi (Gün)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 1 (Sunucuya 24 saat önce girmiş olmalı)')
                        .setValue(session.requirements.minServerAge.toString())
                        .setRequired(false);

                    const partnerSrvInput = new TextInputBuilder()
                        .setCustomId('reqs_partner_id')
                        .setLabel('Ortak Sunucu ID')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Botun ortak sunucuda katılımı kontrol etmesi için ID')
                        .setValue(session.requirements.partnerServerId || '')
                        .setRequired(false);

                    const partnerSrvLink = new TextInputBuilder()
                        .setCustomId('reqs_partner_link')
                        .setLabel('Ortak Sunucu Davet Linki')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Şartı karşılamayanlara gösterilecek davet linki')
                        .setValue(session.requirements.partnerServerLink || '')
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(accAgeInput),
                        new ActionRowBuilder().addComponents(srvAgeInput),
                        new ActionRowBuilder().addComponents(partnerSrvInput),
                        new ActionRowBuilder().addComponents(partnerSrvLink)
                    );

                    await interaction.showModal(modal);
                }

                // REQS TOGGLE ROLE MODE
                else if (customId === 'setup_btn_reqs_toggle_mode') {
                    session.requirements.roleMode = session.requirements.roleMode === 'OR' ? 'AND' : 'OR';
                    // Re-render requirements page
                    const btnRow = interaction.message.components[2];
                    // Replace the toggle button label
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_btn_reqs_modal').setLabel('✍️ Hesap Yaşı & Ortak Sunucu Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            interaction.message.components[1],
                            newBtnRow
                        ]
                    });
                }

                // REQS TOGGLE CAPTCHA
                else if (customId === 'setup_btn_reqs_captcha') {
                    session.useCaptcha = !session.useCaptcha;
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_btn_reqs_modal').setLabel('✍️ Hesap Yaşı & Ortak Sunucu Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_btn_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            interaction.message.components[1],
                            newBtnRow
                        ]
                    });
                }

                // ADVANCED OPTIONS MODAL
                else if (customId === 'setup_btn_adv_modal') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_adv_details')
                        .setTitle('⚙️ Diğer Gelişmiş Ayarlar');

                    const claimInput = new TextInputBuilder()
                        .setCustomId('adv_claim_duration')
                        .setLabel('Hak Talebi (Claim) Süresi (Saat)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('0 = Sınırsız / Yok, Örn: 24 (24 Saat içinde onaylamalı)')
                        .setValue(session.customization.claimDuration.toString())
                        .setRequired(false);

                    const maxPartInput = new TextInputBuilder()
                        .setCustomId('adv_max_participants')
                        .setLabel('Maksimum Katılımcı Sınırı')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('0 = Sınırsız, Örn: 100')
                        .setValue(session.maxParticipants.toString())
                        .setRequired(false);

                    const winnersTextInput = new TextInputBuilder()
                        .setCustomId('adv_winners_text')
                        .setLabel('Kazanan Tebrik Mesajı')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Çekiliş sonuçlandığında kazananların altına yazılacak metin')
                        .setValue(session.customization.winnersText || '')
                        .setRequired(false);

                    const bonusInput = new TextInputBuilder()
                        .setCustomId('adv_bonus_role_weight')
                        .setLabel('Bonus Roller (Format: rolID:carpan)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Örn:\n998877665544332211:3\n112233445566778899:2')
                        .setValue(Object.entries(session.bonusRoles).map(([rid, m]) => `${rid}:${m}`).join('\n'))
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(claimInput),
                        new ActionRowBuilder().addComponents(maxPartInput),
                        new ActionRowBuilder().addComponents(winnersTextInput),
                        new ActionRowBuilder().addComponents(bonusInput)
                    );

                    await interaction.showModal(modal);
                }

                // LAUNCH GIVEAWAY
                else if (customId === 'setup_btn_launch') {
                    if (!session.reward || !session.sureText) {
                        return interaction.reply({ content: '❌ Hata: Çekilişi başlatabilmek için önce **Temel Ayarlar** kısmından Ödül ve Süre girmelisiniz!', ephemeral: true });
                    }

                    const duration = giveawayManager.parseTime(session.sureText);
                    if (!duration) {
                        return interaction.reply({ content: '❌ Hata: Girdiğiniz çekiliş süresi geçersiz formatta! Örnek: `15m`, `2h`, `1d`', ephemeral: true });
                    }

                    const data = {
                        guildId,
                        channelId: interaction.channel.id,
                        reward: session.reward,
                        sureText: session.sureText,
                        winnersCount: session.winnersCount,
                        description: session.description,
                        hostId: interaction.user.id,
                        participants: [],
                        winners: [],
                        ended: false,
                        requirements: {
                            requiredRoles: session.requirements.requiredRoles,
                            roleMode: session.requirements.roleMode,
                            blacklistRoleId: session.requirements.blacklistRoleId,
                            minAccountAge: session.requirements.minAccountAge,
                            minServerAge: session.requirements.minServerAge,
                            partnerServerId: session.requirements.partnerServerId,
                            partnerServerLink: session.requirements.partnerServerLink
                        },
                        bypassRoles: session.bypassRoles,
                        bonusRoles: session.bonusRoles,
                        customization: {
                            banner: session.customization.banner,
                            thumbnail: session.customization.thumbnail,
                            color: session.customization.color,
                            buttonLabel: session.customization.buttonLabel,
                            buttonEmoji: session.customization.buttonEmoji,
                            winnerRole: session.customization.winnerRole,
                            claimDuration: session.customization.claimDuration,
                            winnersText: session.customization.winnersText
                        },
                        maxParticipants: session.maxParticipants,
                        useCaptcha: session.useCaptcha
                    };

                    const msgId = await giveawayManager.startGiveaway(client, data);
                    if (!msgId) {
                        return interaction.reply({ content: '❌ Çekiliş başlatılırken hata oluştu.', ephemeral: true });
                    }

                    // Delete setup session
                    global.giveawaySetups.delete(`${guildId}-${userId}`);

                    await interaction.update({
                        content: `✅ **Çekiliş başarıyla oluşturuldu ve başlatıldı!**\n[Çekiliş Mesajı Bağlantısı](${interaction.channel.url}/${msgId})`,
                        embeds: [],
                        components: []
                    });
                }

                // CANCEL WIZARD SETUP
                else if (customId === 'setup_btn_cancel') {
                    global.giveawaySetups.delete(`${guildId}-${interaction.user.id}`);
                    await interaction.update({
                        content: '❌ **Çekiliş kurulum sihirbazı iptal edildi ve taslak silindi.**',
                        embeds: [],
                        components: []
                    });
                }
            }

            // Handle Select Menus inside Setup Wizard
            else if (interaction.isRoleSelectMenu()) {
                const customId = interaction.customId;
                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                // Required Roles select menu
                if (customId === 'setup_select_required_roles') {
                    session.requirements.requiredRoles = interaction.values;
                    await interaction.deferUpdate();
                }

                // Blacklisted Role select menu
                else if (customId === 'setup_select_blacklist_role') {
                    session.requirements.blacklistRoleId = interaction.values[0] || null;
                    await interaction.deferUpdate();
                }

                // Bypass Roles select menu
                else if (customId === 'setup_select_bypass_roles') {
                    session.bypassRoles = interaction.values;
                    await interaction.deferUpdate();
                }

                // Winner automatical Role select menu
                else if (customId === 'setup_select_winner_role') {
                    session.customization.winnerRole = interaction.values[0] || null;
                    await interaction.deferUpdate();
                }
            }

            // Handle Modal Submissions for Setup Wizard
            else if (interaction.isModalSubmit()) {
                const customId = interaction.customId;
                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                // 1. Basic details modal submit
                if (customId === 'setup_modal_basic') {
                    const reward = interaction.fields.getTextInputValue('basic_reward');
                    const sureText = interaction.fields.getTextInputValue('basic_duration');
                    const winnersCount = parseInt(interaction.fields.getTextInputValue('basic_winners')) || 1;
                    const description = interaction.fields.getTextInputValue('basic_desc');

                    session.reward = reward;
                    session.sureText = sureText;
                    session.winnersCount = winnersCount;
                    session.description = description || null;

                    // Re-render main setup panel
                    const embed = generateWizardEmbed(session, interaction.guild.name);
                    const buttons = generateWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // 2. Reqs Details modal submit
                else if (customId === 'setup_modal_reqs_details') {
                    const accAge = parseInt(interaction.fields.getTextInputValue('reqs_account_age')) || 0;
                    const srvAge = parseInt(interaction.fields.getTextInputValue('reqs_server_age')) || 0;
                    const partnerId = interaction.fields.getTextInputValue('reqs_partner_id');
                    const partnerLink = interaction.fields.getTextInputValue('reqs_partner_link');

                    session.requirements.minAccountAge = accAge;
                    session.requirements.minServerAge = srvAge;
                    session.requirements.partnerServerId = partnerId ? partnerId.trim() : null;
                    session.requirements.partnerServerLink = partnerLink ? partnerLink.trim() : null;

                    // Re-render main setup panel
                    const embed = generateWizardEmbed(session, interaction.guild.name);
                    const buttons = generateWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // 3. Visual settings modal submit
                else if (customId === 'setup_modal_visual') {
                    const color = interaction.fields.getTextInputValue('visual_color');
                    const btnLabel = interaction.fields.getTextInputValue('visual_btn_label');
                    const btnEmoji = interaction.fields.getTextInputValue('visual_btn_emoji');
                    const banner = interaction.fields.getTextInputValue('visual_banner');
                    const thumb = interaction.fields.getTextInputValue('visual_thumbnail');

                    if (color) session.customization.color = color.trim();
                    if (btnLabel) session.customization.buttonLabel = btnLabel.trim();
                    session.customization.buttonEmoji = btnEmoji ? btnEmoji.trim() : null;
                    session.customization.banner = banner ? banner.trim() : null;
                    session.customization.thumbnail = thumb ? thumb.trim() : null;

                    // Re-render main setup panel
                    const embed = generateWizardEmbed(session, interaction.guild.name);
                    const buttons = generateWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // 4. Advanced options modal submit
                else if (customId === 'setup_modal_adv_details') {
                    const claim = parseInt(interaction.fields.getTextInputValue('adv_claim_duration')) || 0;
                    const maxPart = parseInt(interaction.fields.getTextInputValue('adv_max_participants')) || 0;
                    const winText = interaction.fields.getTextInputValue('adv_winners_text');
                    const bonusText = interaction.fields.getTextInputValue('adv_bonus_role_weight');

                    session.customization.claimDuration = claim;
                    session.maxParticipants = maxPart;
                    session.customization.winnersText = winText ? winText.trim() : null;

                    // Parse bonus roles mapping (format: roleId:multiplier)
                    const parsedBonus = {};
                    if (bonusText) {
                        const lines = bonusText.split('\n');
                        for (const line of lines) {
                            const match = line.trim().match(/^(\d+):(\d+)$/);
                            if (match) {
                                parsedBonus[match[1]] = parseInt(match[2]);
                            }
                        }
                    }
                    session.bonusRoles = parsedBonus;

                    // Re-render main setup panel
                    const embed = generateWizardEmbed(session, interaction.guild.name);
                    const buttons = generateWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }
            }
        });
    }
};
