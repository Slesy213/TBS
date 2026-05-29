const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');

const pollManager = require('../pollManager.js');
const { updateSetting } = require('../db.js');

// Global poll setups in memory for wizard persistence
global.pollSetups = global.pollSetups || new Map();

function getPollSetupSession(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!global.pollSetups.has(key)) {
        global.pollSetups.set(key, {
            question: null,
            choicesRaw: null,
            choices: [],
            customEmojis: [],
            sureText: null,
            minVoters: 0,
            useCaptcha: false,
            requirements: {
                requiredRoles: [],
                roleMode: 'OR',
                blacklistRoleId: null,
                minAccountAge: 0,
                minServerAge: 0
            },
            bypassRoles: [],
            customization: {
                color: '#3498DB',
                banner: null,
                thumbnail: null,
                btnStyle: 'Primary',
                multiChoice: false,
                revealMode: false,
                winnerRole: null
            }
        });
    }
    return global.pollSetups.get(key);
}

// ─── GENERATE WIZARD PREVIEW EMBED ───
function generatePollWizardEmbed(session, guildName) {
    const choicesList = session.choices && session.choices.length > 0
        ? session.choices.map((c, i) => {
            const emoji = session.customEmojis?.[i] ? `${session.customEmojis[i]} ` : '';
            return `**${i + 1}.** ${emoji}${c}`;
        }).join('\n')
        : 'Belirtilmedi (En az 2 seçenek gereklidir)';

    const embed = new EmbedBuilder()
        .setColor(session.customization?.color || '#3498DB')
        .setTitle('🛠️ Slesy Anket Kurulum Sihirbazı')
        .setDescription(`Aşağıdaki paneli kullanarak anketinizi özelleştirin. Kurulumu bitirdikten sonra **Anketi Başlat** butonuna basarak yayınlayabilirsiniz.\n\n` +
            `❓ **Soru:** \`${session.question || 'Ayarlanmadı'}\`\n` +
            `⏰ **Süre:** \`${session.sureText || 'Ayarlanmadı'}\`\n` +
            `🎟️ **Asgari Oy Sınırı:** \`${session.minVoters > 0 ? session.minVoters : 'Yok'}\`\n` +
            `🤖 **Robot Doğrulaması (Captcha):** \`${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}\`\n\n` +
            `📋 **Seçenekler:**\n${choicesList}`)
        .addFields(
            {
                name: '🔒 Katılım Şartları',
                value: `• Gerekli Rol(ler): ${session.requirements?.requiredRoles?.length > 0 ? session.requirements.requiredRoles.map(rid => `<@&${rid}>`).join(', ') : 'Yok'}\n` +
                    `• Eşleşme Modu: \`${session.requirements?.roleMode || 'OR'}\`\n` +
                    `• Yasaklı Rol: ${session.requirements?.blacklistRoleId ? `<@&${session.requirements.blacklistRoleId}>` : 'Yok'}\n` +
                    `• Hesap Yaşı (Gün): \`${session.requirements?.minAccountAge || 0} Gün\`\n` +
                    `• Sunucu Süresi (Gün): \`${session.requirements?.minServerAge || 0} Gün\``
            },
            {
                name: '🎨 Görsel & Gelişmiş Ayarlar',
                value: `• Embed Rengi: \`${session.customization?.color || '#3498DB'}\`\n` +
                    `• Buton Stili: \`${session.customization?.btnStyle || 'Primary'}\`\n` +
                    `• Çoklu Seçim: \`${session.customization?.multiChoice ? '🟢 Aktif' : '🔴 Pasif'}\`\n` +
                    `• Sonuç Gizleme (Reveal on End): \`${session.customization?.revealMode ? '🟢 Aktif (Sadece Bitişte Göster)' : '🔴 Pasif (Canlı Güncelleme)'}\`\n` +
                    `• Banner Görseli: \`${session.customization?.banner ? '🟢 Eklenmiş' : '🔴 Yok'}\`\n` +
                    `• Küçük Resim (Thumbnail): \`${session.customization?.thumbnail ? '🟢 Eklenmiş' : '🔴 Yok'}\`\n` +
                    `• Kazanana Rol Verme: ${session.customization?.winnerRole ? `<@&${session.customization.winnerRole}>` : 'Yok'}`
            },
            {
                name: '🎟️ Muafiyetler',
                value: `• Muaf Roller (Bypass): ${session.bypassRoles?.length > 0 ? session.bypassRoles.map(rid => `<@&${rid}>`).join(', ') : 'Yok'}`
            }
        )
        .setTimestamp()
        .setFooter({ text: `${guildName} | Slesy Anket Yönetim Paneli` });

    return embed;
}

// ─── GENERATE WIZARD BUTTONS ───
function generatePollWizardButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_poll_basic').setLabel('❓ Temel Ayarlar & Seçenekler').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_poll_reqs').setLabel('🔒 Katılım Şartları').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_poll_visual').setLabel('🎨 Görsel & Gelişmiş').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_poll_bypass').setLabel('🎟️ Muafiyetler').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_poll_launch').setLabel('🚀 Anketi Başlat').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_poll_cancel').setLabel('❌ Kurulumu İptal Et').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anket')
        .setDescription('Gelişmiş anket sistemi (40+ Özellik)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

        // SUBCOMMAND: BAŞLAT
        .addSubcommand(sub =>
            sub.setName('başlat')
                .setDescription('Hızlıca temel bir anket başlatır')
                .addStringOption(opt => opt.setName('soru').setDescription('Anket sorusu').setRequired(true))
                .addStringOption(opt => opt.setName('secenekler').setDescription('Seçenekler (Virgülle veya | işaretiyle ayırın)').setRequired(true))
                .addStringOption(opt => opt.setName('süre').setDescription('Süre (Örn: 10m, 2h, 1d)').setRequired(true))
                .addIntegerOption(opt => opt.setName('asgari-oy').setDescription('Asgari oy sayısı').setRequired(false))
                .addBooleanOption(opt => opt.setName('captcha').setDescription('Robot doğrulaması aktif olsun mu?').setRequired(false))
        )

        // SUBCOMMAND: KURULUM
        .addSubcommand(sub =>
            sub.setName('kurulum')
                .setDescription('Anket kurulum sihirbazını açar')
        )

        // SUBCOMMAND: BİTİR
        .addSubcommand(sub =>
            sub.setName('bitir')
                .setDescription('Aktif bir anketi anında sonlandırır')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Anket mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: İPTAL
        .addSubcommand(sub =>
            sub.setName('iptal')
                .setDescription('Aktif bir anketi iptal eder')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Anket mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: LİSTE
        .addSubcommand(sub =>
            sub.setName('liste')
                .setDescription('Sunucudaki aktif anketleri listeler')
        )

        // SUBCOMMAND: BİLGİ
        .addSubcommand(sub =>
            sub.setName('bilgi')
                .setDescription('Bir anketin detaylı oy oranlarını ve bilgilerini gösterir')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Anket mesajının ID\'si').setRequired(true))
        )

        // SUBCOMMAND: SÜRE UZAT
        .addSubcommand(sub =>
            sub.setName('sure-uzat')
                .setDescription('Aktif bir anketin süresini uzatır')
                .addStringOption(opt => opt.setName('mesaj_id').setDescription('Anket mesajının ID\'si').setRequired(true))
                .addStringOption(opt => opt.setName('ek_süre').setDescription('Uzatılacak süre (Örn: 10m, 1h, 1d)').setRequired(true))
        )

        // SUBCOMMAND: KARALİSTE
        .addSubcommand(sub =>
            sub.setName('karaliste')
                .setDescription('Anket kara listesini yönetir')
                .addStringOption(opt => opt.setName('işlem').setDescription('İşlem seç').setRequired(true).addChoices(
                    { name: 'Ekle', value: 'ekle' },
                    { name: 'Çıkar', value: 'cikar' },
                    { name: 'Listele', value: 'liste' }
                ))
                .addUserOption(opt => opt.setName('kullanici').setDescription('İşlem yapılacak üye').setRequired(false))
        ),

    async execute(interaction, client) {
        const member = interaction.member;
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ Bu komutu kullanmak için `Mesajları Yönet` yetkisine sahip olmalısınız.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // ─── SUBCOMMAND: BAŞLAT ───
        if (subcommand === 'başlat') {
            await interaction.deferReply({ ephemeral: true });
            const question = interaction.options.getString('soru');
            const seceneklerRaw = interaction.options.getString('secenekler');
            const sureText = interaction.options.getString('süre');
            const minVoters = interaction.options.getInteger('asgari-oy') || 0;
            const useCaptcha = interaction.options.getBoolean('captcha') || false;

            const duration = pollManager.parseTime(sureText);
            if (!duration) {
                return interaction.editReply({ content: '❌ Geçersiz süre formatı! Örnek: `10m`, `2h`, `1d`' });
            }

            let choices = seceneklerRaw.split(/[|\n,]+/).map(c => c.trim()).filter(c => c.length > 0);
            if (choices.length < 2) {
                return interaction.editReply({ content: '❌ Anket başlatmak için en az 2 seçenek belirtmelisiniz.' });
            }
            if (choices.length > 25) {
                return interaction.editReply({ content: '❌ En fazla 25 adet seçenek ekleyebilirsiniz.' });
            }

            // Automatically detect emojis in the options
            const customEmojis = [];
            const cleanChoices = [];
            const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])|<a?:[a-zA-Z0-8_]+:\d+>/;

            for (const choice of choices) {
                const match = choice.match(emojiRegex);
                if (match && choice.startsWith(match[0])) {
                    customEmojis.push(match[0]);
                    cleanChoices.push(choice.replace(match[0], '').trim());
                } else {
                    customEmojis.push(null);
                    cleanChoices.push(choice);
                }
            }

            const data = {
                guildId,
                channelId: interaction.channel.id,
                question,
                choices: cleanChoices,
                customEmojis,
                sureText,
                minVoters,
                useCaptcha,
                requirements: {
                    requiredRoles: [],
                    roleMode: 'OR',
                    blacklistRoleId: null,
                    minAccountAge: 0,
                    minServerAge: 0
                },
                bypassRoles: [],
                customization: {
                    color: '#3498DB',
                    banner: null,
                    thumbnail: null,
                    btnStyle: 'Primary',
                    multiChoice: false,
                    revealMode: false,
                    winnerRole: null
                },
                votes: {},
                ended: false,
                hostId: interaction.user.id
            };

            const msgId = await pollManager.startPoll(client, data);
            if (!msgId) {
                return interaction.editReply({ content: '❌ Anket başlatılırken bir hata oluştu.' });
            }

            await interaction.editReply({ content: `✅ Anket başarıyla başlatıldı! [Anket Mesajı](${interaction.channel.url}/${msgId})` });
        }

        // ─── SUBCOMMAND: KURULUM ───
        else if (subcommand === 'kurulum') {
            const session = getPollSetupSession(guildId, interaction.user.id);
            const embed = generatePollWizardEmbed(session, interaction.guild.name);
            const buttons = generatePollWizardButtons();

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
            const result = await pollManager.forceEndPoll(client, guildId, messageId);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: '✅ Anket başarıyla sonlandırıldı.' });
        }

        // ─── SUBCOMMAND: İPTAL ───
        else if (subcommand === 'iptal') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('mesaj_id');
            const result = await pollManager.cancelPoll(client, guildId, messageId);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: '✅ Anket başarıyla iptal edildi.' });
        }

        // ─── SUBCOMMAND: LİSTE ───
        else if (subcommand === 'liste') {
            const activeList = pollManager.polls.filter(p => p.guildId === guildId && !p.ended);
            if (activeList.length === 0) {
                return interaction.reply({ content: 'ℹ️ Sunucuda şu an aktif anket bulunmuyor.', ephemeral: true });
            }

            const listStr = activeList.map(p => `• [${p.question}](https://discord.com/channels/${guildId}/${p.channelId}/${p.messageId}) - ID: \`${p.messageId}\` - Kalan: <t:${Math.floor(p.endAt/1000)}:R>`).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`📊 Sunucu Aktif Anketleri (${activeList.length})`)
                .setDescription(listStr)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ─── SUBCOMMAND: BİLGİ ───
        else if (subcommand === 'bilgi') {
            const messageId = interaction.options.getString('mesaj_id');
            const poll = pollManager.polls.find(p => p.messageId === messageId && p.guildId === guildId);
            if (!poll) {
                return interaction.reply({ content: '❌ Anket bulunamadı.', ephemeral: true });
            }

            const totalVotesMap = {};
            poll.choices.forEach((_, idx) => totalVotesMap[idx] = 0);
            let totalVotersCount = 0;
            Object.values(poll.votes).forEach(voteVal => {
                totalVotersCount++;
                if (Array.isArray(voteVal)) {
                    voteVal.forEach(idx => {
                        if (totalVotesMap[idx] !== undefined) totalVotesMap[idx]++;
                    });
                } else {
                    if (totalVotesMap[voteVal] !== undefined) totalVotesMap[voteVal]++;
                }
            });

            const sumVotes = Object.values(totalVotesMap).reduce((a, b) => a + b, 0);
            const detailLines = poll.choices.map((choiceText, idx) => {
                const count = totalVotesMap[idx] || 0;
                const percentage = sumVotes > 0 ? Math.round((count / sumVotes) * 100) : 0;
                return `**${idx + 1}.** ${choiceText} ➔ \`%${percentage}\` (\`${count} Oy\`)`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(poll.customization?.color || '#3498DB')
                .setTitle(`📊 Anket Bilgi Raporu: ${poll.question}`)
                .addFields(
                    { name: 'Anket ID / Mesaj ID', value: `\`${poll.messageId}\``, inline: true },
                    { name: 'Durum', value: poll.ended ? '🔴 Sona Erdi' : '🟢 Aktif', inline: true },
                    { name: 'Oy Kullanan Üye', value: `\`${totalVotersCount} Kişi\``, inline: true },
                    { name: 'Toplam Oy Puanı', value: `\`${sumVotes} Oy\``, inline: true },
                    { name: 'Başlatan', value: `<@${poll.hostId}>`, inline: true },
                    { name: 'Kanal', value: `<#${poll.channelId}>`, inline: true },
                    { name: 'Oy Dağılımı', value: detailLines || 'Henüz oy kullanılmadı.' }
                )
                .setTimestamp();

            const exportButton = new ButtonBuilder()
                .setCustomId(`setup_poll_export_${poll.messageId}`)
                .setLabel('Oy Kullananlar Listesini Dışa Aktar 📥')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(exportButton);

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // ─── SUBCOMMAND: SÜRE UZAT ───
        else if (subcommand === 'sure-uzat') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('mesaj_id');
            const ekSure = interaction.options.getString('ek_süre');
            const result = await pollManager.extendPoll(client, guildId, messageId, ekSure);
            if (!result.success) {
                return interaction.editReply({ content: `❌ Başarısız: ${result.reason}` });
            }
            await interaction.editReply({ content: `✅ Anket süresi başarıyla \`${ekSure}\` uzatıldı.` });
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
                    return interaction.editReply({ content: '⚠️ Kullanıcı zaten kara listede bulunuyor.' });
                }
                settings.giveawayBlacklist.push(targetUser.id);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, 'guard_settings', settings);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı anket/çekiliş kara listesine eklendi. Artık katılamaz.` });
            } 
            else if (islem === 'cikar') {
                if (!targetUser) return interaction.editReply({ content: '❌ Kullanıcı belirtmelisiniz.' });
                if (!settings.giveawayBlacklist.includes(targetUser.id)) {
                    return interaction.editReply({ content: '⚠️ Kullanıcı kara listede değil.' });
                }
                settings.giveawayBlacklist = settings.giveawayBlacklist.filter(id => id !== targetUser.id);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, 'guard_settings', settings);
                await interaction.editReply({ content: `✅ **${targetUser.tag}** kullanıcısı kara listeden çıkarıldı.` });
            } 
            else if (islem === 'liste') {
                if (settings.giveawayBlacklist.length === 0) {
                    return interaction.editReply({ content: '📄 Anket/Çekiliş kara listesi boş.' });
                }
                const listStr = settings.giveawayBlacklist.map(id => `• <@${id}> (\`${id}\`)`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('📄 Anket & Çekiliş Kara Listesi')
                    .setDescription(listStr)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },

    // ─── INITIALIZE TIMER AND GLOBAL INTERACTIONS LISTENER ───
    init(client) {
        // Start pollManager offline timer resume & auto-backup
        pollManager.init(client);

        // Listen for Setup Wizard & Export Button Interactions
        client.on('interactionCreate', async (interaction) => {
            const guildId = interaction.guild?.id;
            if (!guildId) return;

            // 1. BUTTON INTERACTIONS FOR WIZARD & EXPORT
            if (interaction.isButton()) {
                const customId = interaction.customId;

                // Handle Export Voters Button
                if (customId.startsWith('setup_poll_export_')) {
                    const messageId = customId.replace('setup_poll_export_', '');
                    const poll = pollManager.polls.find(p => p.messageId === messageId);
                    if (!poll) return interaction.reply({ content: '❌ Anket bulunamadı.', ephemeral: true });

                    let fileContent = `Slesy Anket Oy Raporu\n`;
                    fileContent += `===============================\n`;
                    fileContent += `Soru: ${poll.question}\n`;
                    fileContent += `Anket ID: ${poll.messageId}\n`;
                    fileContent += `Toplam Oy Veren: ${Object.keys(poll.votes).length}\n`;
                    fileContent += `===============================\n\n`;

                    for (const [uid, voteVal] of Object.entries(poll.votes)) {
                        let choiceText = '';
                        if (Array.isArray(voteVal)) {
                            choiceText = voteVal.map(idx => `${idx + 1}. ${poll.choices[idx]}`).join(', ');
                        } else {
                            choiceText = `${voteVal + 1}. ${poll.choices[voteVal]}`;
                        }
                        fileContent += `Kullanıcı ID: ${uid} | Seçimi: ${choiceText}\n`;
                    }

                    const buffer = Buffer.from(fileContent, 'utf-8');
                    const attachment = new AttachmentBuilder(buffer, { name: `anket_${messageId}_oylar.txt` });

                    return interaction.reply({
                        content: '📊 Anket oy raporu başarıyla oluşturuldu. Aşağıdaki dosyadan inceleyebilirsiniz.',
                        files: [attachment],
                        ephemeral: true
                    });
                }

                if (!customId.startsWith('setup_poll_')) return;

                const userId = interaction.user.id;
                const session = getPollSetupSession(guildId, userId);

                // 1.1 BASIC SETTINGS BUTTON
                if (customId === 'setup_poll_basic') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_poll_basic')
                        .setTitle('📊 Anket Temel Ayarları');

                    const questionInput = new TextInputBuilder()
                        .setCustomId('poll_question')
                        .setLabel('Anket Sorusu Nedir?')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Örn: Sunucumuzun yeni logosunu nasıl buldunuz?')
                        .setValue(session.question || '')
                        .setRequired(true);

                    const choicesInput = new TextInputBuilder()
                        .setCustomId('poll_choices')
                        .setLabel('Seçenekler (Her satıra bir tane yazın)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Başına emoji ekleyebilirsiniz. Örn:\n👍 Harika\n👎 Beğenmedim\n💬 Kararsızım')
                        .setValue(session.choicesRaw || '')
                        .setRequired(true);

                    const durationInput = new TextInputBuilder()
                        .setCustomId('poll_duration')
                        .setLabel('Anket Süresi')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 10m (dakika), 2h (saat), 1d (gün)')
                        .setValue(session.sureText || '')
                        .setRequired(true);

                    const minVotersInput = new TextInputBuilder()
                        .setCustomId('poll_min_voters')
                        .setLabel('Asgari Oy Sınırı (Katılım Barajı)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('0 = Sınırsız / Yok')
                        .setValue(session.minVoters.toString())
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(questionInput),
                        new ActionRowBuilder().addComponents(choicesInput),
                        new ActionRowBuilder().addComponents(durationInput),
                        new ActionRowBuilder().addComponents(minVotersInput)
                    );

                    await interaction.showModal(modal);
                }

                // 1.2 REQUIREMENTS BUTTON
                else if (customId === 'setup_poll_reqs') {
                    const embed = new EmbedBuilder()
                        .setColor('#E67E22')
                        .setTitle('🔒 Katılım Şartları Ayarları')
                        .setDescription('Ankete katılım şartı olarak belirlemek istediğiniz rolleri veya hesap yaş limitlerini aşağıdaki menüleri ve butonları kullanarak seçin.\n\n' +
                            `• **Gerekli Roller:** İlk menüden seçin.\n` +
                            `• **Yasaklı Rol:** İkinci menüden seçin.\n` +
                            `• **Rol Eşleşme Modu:** Üyenin bu rollerin *hepsine* mi yoksa *herhangi birine* mi sahip olması gerektiğini belirler.`);

                    const roleSelectRequired = new RoleSelectMenuBuilder()
                        .setCustomId('setup_poll_select_required_roles')
                        .setPlaceholder('🔒 Gerekli Rolleri Seçin (Çoklu Seçilebilir)')
                        .setMinValues(0)
                        .setMaxValues(10);

                    const roleSelectBlacklist = new RoleSelectMenuBuilder()
                        .setCustomId('setup_poll_select_blacklist_role')
                        .setPlaceholder('🚫 Yasaklı Rol Seçin')
                        .setMinValues(0)
                        .setMaxValues(1);

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_reqs_modal').setLabel('✍️ Hesap & Sunucu Yaşı Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
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

                // 1.3 VISUAL & ADVANCED SETTINGS BUTTON
                else if (customId === 'setup_poll_visual') {
                    const embed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setTitle('🎨 Görsel & Gelişmiş Ayarlar')
                        .setDescription('Anketin görünümünü, buton stilini, çoklu seçim modunu veya kazanan rolünü aşağıdaki menü ve butonları kullanarak özelleştirin.\n\n' +
                            `• **Kazanana Rol Verme:** Anket sonuçlandığında doğru/kazanan seçeneği işaretleyen üyelere otomatik olarak verilecek rolü seçin.`);

                    const roleSelectWinner = new RoleSelectMenuBuilder()
                        .setCustomId('setup_poll_select_winner_role')
                        .setPlaceholder('🏆 Kazanana Verilecek Rolü Seçin')
                        .setMinValues(0)
                        .setMaxValues(1);

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_visual_modal').setLabel('✍️ Renk & Banner Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_multichoice').setLabel(`Çoklu Seçim: ${session.customization.multiChoice ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_revealmode').setLabel(`Sonuç Gizleme: ${session.customization.revealMode ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_btnstyle').setLabel(`Buton Stili: ${session.customization.btnStyle}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        embeds: [embed],
                        components: [
                            new ActionRowBuilder().addComponents(roleSelectWinner),
                            buttonRow
                        ]
                    });
                }

                // 1.4 BYPASS / EXEMPT ROLES BUTTON
                else if (customId === 'setup_poll_bypass') {
                    const embed = new EmbedBuilder()
                        .setColor('#34495E')
                        .setTitle('🎟️ Muafiyet (Bypass) Rolleri Ayarı')
                        .setDescription('Sunucuda oy kullanma şartlarını (hesap yaşı, sunucuya katılım süresi vb.) es geçecek muaf rolleri seçin.');

                    const roleSelectBypass = new RoleSelectMenuBuilder()
                        .setCustomId('setup_poll_select_bypass_roles')
                        .setPlaceholder('🎟️ Şartları Es Geçecek Bypass Rollerini Seçin')
                        .setMinValues(0)
                        .setMaxValues(10);

                    const buttonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({
                        embeds: [embed],
                        components: [
                            new ActionRowBuilder().addComponents(roleSelectBypass),
                            buttonRow
                        ]
                    });
                }

                // BACK TO MAIN PANEL
                else if (customId === 'setup_poll_back_to_main') {
                    const embed = generatePollWizardEmbed(session, interaction.guild.name);
                    const buttons = generatePollWizardButtons();
                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // REQS EXTRA DETAILS MODAL OPEN
                else if (customId === 'setup_poll_reqs_modal') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_poll_reqs_details')
                        .setTitle('✍️ Yaş ve Süre Koruması');

                    const accAgeInput = new TextInputBuilder()
                        .setCustomId('poll_min_account_age')
                        .setLabel('Asgari Hesap Yaşı (Gün)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 7 (7 günden yeni hesaplar katılamaz)')
                        .setValue(session.requirements.minAccountAge.toString())
                        .setRequired(false);

                    const srvAgeInput = new TextInputBuilder()
                        .setCustomId('poll_min_server_age')
                        .setLabel('Asgari Sunucu Süresi (Gün)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: 1 (Sunucuya 24 saat önce girmiş olmalı)')
                        .setValue(session.requirements.minServerAge.toString())
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(accAgeInput),
                        new ActionRowBuilder().addComponents(srvAgeInput)
                    );

                    await interaction.showModal(modal);
                }

                // REQS TOGGLE ROLE MODE
                else if (customId === 'setup_poll_reqs_toggle_mode') {
                    session.requirements.roleMode = session.requirements.roleMode === 'OR' ? 'AND' : 'OR';
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_reqs_modal').setLabel('✍️ Hesap & Sunucu Yaşı Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
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
                else if (customId === 'setup_poll_reqs_captcha') {
                    session.useCaptcha = !session.useCaptcha;
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_reqs_modal').setLabel('✍️ Hesap & Sunucu Yaşı Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_toggle_mode').setLabel(`Eşleşme Modu: ${session.requirements.roleMode}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_reqs_captcha').setLabel(`Captcha: ${session.useCaptcha ? '🟢 Aktif' : '🔴 Pasif'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );
                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            interaction.message.components[1],
                            newBtnRow
                        ]
                    });
                }

                // VISUAL DETAILS MODAL OPEN
                else if (customId === 'setup_poll_visual_modal') {
                    const modal = new ModalBuilder()
                        .setCustomId('setup_modal_poll_visual')
                        .setTitle('🎨 Görsel Özelleştirmeler');

                    const colorInput = new TextInputBuilder()
                        .setCustomId('poll_color')
                        .setLabel('Embed Hex Rengi')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Örn: #3498DB veya #FF0000')
                        .setValue(session.customization.color)
                        .setRequired(false);

                    const bannerInput = new TextInputBuilder()
                        .setCustomId('poll_banner')
                        .setLabel('Banner Görseli URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://example.com/image.png')
                        .setValue(session.customization.banner || '')
                        .setRequired(false);

                    const thumbInput = new TextInputBuilder()
                        .setCustomId('poll_thumbnail')
                        .setLabel('Küçük Resim (Thumbnail) URL')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('https://example.com/logo.png')
                        .setValue(session.customization.thumbnail || '')
                        .setRequired(false);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(colorInput),
                        new ActionRowBuilder().addComponents(bannerInput),
                        new ActionRowBuilder().addComponents(thumbInput)
                    );

                    await interaction.showModal(modal);
                }

                // VISUAL TOGGLE MULTICHOICE
                else if (customId === 'setup_poll_toggle_multichoice') {
                    session.customization.multiChoice = !session.customization.multiChoice;
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_visual_modal').setLabel('✍️ Renk & Banner Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_multichoice').setLabel(`Çoklu Seçim: ${session.customization.multiChoice ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_revealmode').setLabel(`Sonuç Gizleme: ${session.customization.revealMode ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_btnstyle').setLabel(`Buton Stili: ${session.customization.btnStyle}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );
                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            newBtnRow
                        ]
                    });
                }

                // VISUAL TOGGLE REVEALMODE
                else if (customId === 'setup_poll_toggle_revealmode') {
                    session.customization.revealMode = !session.customization.revealMode;
                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_visual_modal').setLabel('✍️ Renk & Banner Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_multichoice').setLabel(`Çoklu Seçim: ${session.customization.multiChoice ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_revealmode').setLabel(`Sonuç Gizleme: ${session.customization.revealMode ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_btnstyle').setLabel(`Buton Stili: ${session.customization.btnStyle}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );
                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            newBtnRow
                        ]
                    });
                }

                // VISUAL TOGGLE BUTTON STYLE
                else if (customId === 'setup_poll_toggle_btnstyle') {
                    const styles = ['Primary', 'Secondary', 'Success', 'Danger'];
                    let currentIdx = styles.indexOf(session.customization.btnStyle);
                    if (currentIdx === -1) currentIdx = 0;
                    session.customization.btnStyle = styles[(currentIdx + 1) % styles.length];

                    const newBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('setup_poll_visual_modal').setLabel('✍️ Renk & Banner Ayarla').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_multichoice').setLabel(`Çoklu Seçim: ${session.customization.multiChoice ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_revealmode').setLabel(`Sonuç Gizleme: ${session.customization.revealMode ? '🟢 Açık' : '🔴 Kapalı'}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_toggle_btnstyle').setLabel(`Buton Stili: ${session.customization.btnStyle}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('setup_poll_back_to_main').setLabel('↩️ Geri').setStyle(ButtonStyle.Success)
                    );
                    await interaction.update({
                        components: [
                            interaction.message.components[0],
                            newBtnRow
                        ]
                    });
                }

                // LAUNCH POLL
                else if (customId === 'setup_poll_launch') {
                    if (!session.question || !session.sureText || !session.choices || session.choices.length < 2) {
                        return interaction.reply({
                            content: '❌ Hata: Anketi başlatabilmek için önce **Temel Ayarlar** kısmından Soru, en az 2 Seçenek ve Süre girmelisiniz!',
                            ephemeral: true
                        });
                    }

                    const duration = pollManager.parseTime(session.sureText);
                    if (!duration) {
                        return interaction.reply({
                            content: '❌ Hata: Girdiğiniz anket süresi geçersiz formatta! Örnek: `15m`, `2h`, `1d`',
                            ephemeral: true
                        });
                    }

                    const data = {
                        guildId,
                        channelId: interaction.channel.id,
                        question: session.question,
                        choices: session.choices,
                        customEmojis: session.customEmojis,
                        sureText: session.sureText,
                        minVoters: session.minVoters,
                        useCaptcha: session.useCaptcha,
                        requirements: {
                            requiredRoles: session.requirements.requiredRoles,
                            roleMode: session.requirements.roleMode,
                            blacklistRoleId: session.requirements.blacklistRoleId,
                            minAccountAge: session.requirements.minAccountAge,
                            minServerAge: session.requirements.minServerAge
                        },
                        bypassRoles: session.bypassRoles,
                        customization: {
                            color: session.customization.color,
                            banner: session.customization.banner,
                            thumbnail: session.customization.thumbnail,
                            btnStyle: session.customization.btnStyle,
                            multiChoice: session.customization.multiChoice,
                            revealMode: session.customization.revealMode,
                            winnerRole: session.customization.winnerRole
                        },
                        votes: {},
                        ended: false,
                        hostId: userId
                    };

                    const msgId = await pollManager.startPoll(client, data);
                    if (!msgId) {
                        return interaction.reply({ content: '❌ Anket başlatılırken hata oluştu.', ephemeral: true });
                    }

                    global.pollSetups.delete(`${guildId}-${userId}`);

                    await interaction.update({
                        content: `✅ **Anket başarıyla oluşturuldu ve başlatıldı!**\n[Anket Mesajı Bağlantısı](${interaction.channel.url}/${msgId})`,
                        embeds: [],
                        components: []
                    });
                }

                // CANCEL WIZARD SETUP
                else if (customId === 'setup_poll_cancel') {
                    global.pollSetups.delete(`${guildId}-${userId}`);
                    await interaction.update({
                        content: '❌ **Anket kurulum sihirbazı iptal edildi ve taslak silindi.**',
                        embeds: [],
                        components: []
                    });
                }
            }

            // 2. ROLE SELECT MENUS FOR WIZARD
            else if (interaction.isRoleSelectMenu()) {
                const customId = interaction.customId;
                if (!customId.startsWith('setup_poll_select_')) return;

                const userId = interaction.user.id;
                const session = getPollSetupSession(guildId, userId);

                // Required Roles select menu
                if (customId === 'setup_poll_select_required_roles') {
                    session.requirements.requiredRoles = interaction.values;
                    await interaction.deferUpdate();
                }
                // Blacklisted Role select menu
                else if (customId === 'setup_poll_select_blacklist_role') {
                    session.requirements.blacklistRoleId = interaction.values[0] || null;
                    await interaction.deferUpdate();
                }
                // Bypass Roles select menu
                else if (customId === 'setup_poll_select_bypass_roles') {
                    session.bypassRoles = interaction.values;
                    await interaction.deferUpdate();
                }
                // Winner Role select menu
                else if (customId === 'setup_poll_select_winner_role') {
                    session.customization.winnerRole = interaction.values[0] || null;
                    await interaction.deferUpdate();
                }
            }

            // 3. MODAL SUBMISSIONS FOR WIZARD
            else if (interaction.isModalSubmit()) {
                const customId = interaction.customId;
                if (!customId.startsWith('setup_modal_poll_')) return;

                const userId = interaction.user.id;
                const session = getPollSetupSession(guildId, userId);

                // 3.1 Basic details modal submit
                if (customId === 'setup_modal_poll_basic') {
                    const question = interaction.fields.getTextInputValue('poll_question');
                    const choicesRaw = interaction.fields.getTextInputValue('poll_choices');
                    const sureText = interaction.fields.getTextInputValue('poll_duration');
                    const minVoters = parseInt(interaction.fields.getTextInputValue('poll_min_voters')) || 0;

                    // Automatically detect emojis in options
                    const choices = [];
                    const customEmojis = [];
                    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])|<a?:[a-zA-Z0-8_]+:\d+>/;

                    const lines = choicesRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    for (const line of lines) {
                        const match = line.match(emojiRegex);
                        if (match && line.startsWith(match[0])) {
                            customEmojis.push(match[0]);
                            choices.push(line.replace(match[0], '').trim());
                        } else {
                            customEmojis.push(null);
                            choices.push(line);
                        }
                    }

                    session.question = question;
                    session.choicesRaw = choicesRaw;
                    session.choices = choices;
                    session.customEmojis = customEmojis;
                    session.sureText = sureText;
                    session.minVoters = minVoters;

                    // Re-render setup wizard panel
                    const embed = generatePollWizardEmbed(session, interaction.guild.name);
                    const buttons = generatePollWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // 3.2 Reqs Details modal submit
                else if (customId === 'setup_modal_poll_reqs_details') {
                    const accAge = parseInt(interaction.fields.getTextInputValue('poll_min_account_age')) || 0;
                    const srvAge = parseInt(interaction.fields.getTextInputValue('poll_min_server_age')) || 0;

                    session.requirements.minAccountAge = accAge;
                    session.requirements.minServerAge = srvAge;

                    // Re-render setup wizard panel
                    const embed = generatePollWizardEmbed(session, interaction.guild.name);
                    const buttons = generatePollWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }

                // 3.3 Visual settings modal submit
                else if (customId === 'setup_modal_poll_visual') {
                    const color = interaction.fields.getTextInputValue('poll_color');
                    const banner = interaction.fields.getTextInputValue('poll_banner');
                    const thumbnail = interaction.fields.getTextInputValue('poll_thumbnail');

                    if (color) session.customization.color = color.trim();
                    session.customization.banner = banner ? banner.trim() : null;
                    session.customization.thumbnail = thumbnail ? thumbnail.trim() : null;

                    // Re-render setup wizard panel
                    const embed = generatePollWizardEmbed(session, interaction.guild.name);
                    const buttons = generatePollWizardButtons();

                    await interaction.update({
                        embeds: [embed],
                        components: buttons
                    });
                }
            }
        });
    }
};
