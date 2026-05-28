const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AuditLogEvent,
    ChannelType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const { updateSetting } = require("../db.js");

// Declarations
global.guardDurums = global.guardDurums || new Map();
global.guvenliListes = global.guvenliListes || new Map();
global.spamMap = global.spamMap || new Map();
global.guardSettings = global.guardSettings || new Map();

// Session map to track who is currently editing which user's whitelist permissions
global.editingWhitelistUser = global.editingWhitelistUser || new Map();

// Threat Level Tracker
global.guildThreatLevels = global.guildThreatLevels || new Map(); // guildId -> number (0 - 100)

// Rate limit trackers
global.banTracker = global.banTracker || new Map();
global.kickTracker = global.kickTracker || new Map();
global.channelDeleteTracker = global.channelDeleteTracker || new Map();
global.roleDeleteTracker = global.roleDeleteTracker || new Map();
global.roleGiveTracker = global.roleGiveTracker || new Map();

const defaultSettings = {
    // Category 1: Server Integrity
    antiChannelCreate: false,
    antiChannelDelete: false,
    antiChannelUpdate: false,
    antiChannelOverwriteClear: false,
    antiChannelClone: false,
    antiCategoryDelete: false,
    antiChannelSlowmodeChange: false,
    antiNSFWDisable: false,
    antiChannelNameSpam: false,
    antiVoiceBitrateSpam: false,
    antiVoiceLimitChange: false,
    antiStageChannelSpam: false,
    antiAnnouncementFollow: false,

    antiRoleCreate: false,
    antiRoleDelete: false,
    antiRoleUpdate: false,
    antiEveryoneAdminGive: false,
    antiRoleColorChange: false,
    antiRoleNameSpam: false,
    antiRoleHoistDisable: false,
    antiRoleMentionableEnable: false,
    antiBotRoleModify: false,
    antiRolePositionChange: false,
    antiAdminRoleGiveLimit: false,
    antiOnboardingRoleSpam: false,
    antiIntegrationRoleDelete: false,

    antiWebhookCreate: false,
    antiWebhookDelete: false,
    antiWebhookUpdate: false,
    antiEmojiCreate: false,
    antiEmojiDelete: false,
    antiEmojiUpdate: false,
    antiStickerCreate: false,
    antiStickerDelete: false,
    antiStickerUpdate: false,
    antiGuildUpdate: false,
    antiBotAdd: false,
    antiIntegrationCreate: false,
    antiPrune: false,

    // Category 2: Chat & Content Security
    linkEngel: false,
    inviteEngel: false,
    kufurEngel: false,
    argoEngel: false,
    capsEngel: false,
    emojiSpamEngel: false,
    mentionSpamEngel: false,
    everyoneHereEngel: false,
    mediaSpamEngel: false,
    selfBotEngel: false,
    duplicateEngel: false,
    lineLimitEngel: false,
    lengthLimitEngel: false,

    // Category 3: Anti-Raid & Verification
    accountAgeGuard: false,
    accountAgeLimit: 3, // days
    defaultAvatarGuard: false,
    raidGuard: false,
    raidLimit: 5, // joins
    raidTime: 10, // seconds
    usernameRegexGuard: false,
    autoQuarantine: false,
    buttonVerification: false,
    verifyRoleId: null,
    quarantineRoleId: null,

    // Category 4: Admin Limits
    banLimit: 3,
    kickLimit: 3,
    channelDeleteLimit: 2,
    roleDeleteLimit: 2,
    roleGiveLimit: 3,
    limitTime: 5, // minutes

    // Category 5: Logs
    logChannelId: null,

    // Autonomous Mode
    autonomousMode: false,

    // Whitelist Permissions: userId -> { full: bool, channel: bool, role: bool, chat: bool, limitBypass: bool }
    whitelistPerms: {}
};

const booleanKeys = [
    "antiChannelCreate", "antiChannelDelete", "antiChannelUpdate",
    "antiChannelOverwriteClear", "antiChannelClone", "antiCategoryDelete",
    "antiChannelSlowmodeChange", "antiNSFWDisable", "antiChannelNameSpam",
    "antiVoiceBitrateSpam", "antiVoiceLimitChange", "antiStageChannelSpam",
    "antiAnnouncementFollow",
    "antiRoleCreate", "antiRoleDelete", "antiRoleUpdate",
    "antiEveryoneAdminGive", "antiRoleColorChange", "antiRoleNameSpam",
    "antiRoleHoistDisable", "antiRoleMentionableEnable", "antiBotRoleModify",
    "antiRolePositionChange", "antiAdminRoleGiveLimit", "antiOnboardingRoleSpam",
    "antiIntegrationRoleDelete",
    "antiWebhookCreate", "antiWebhookDelete", "antiWebhookUpdate",
    "antiEmojiCreate", "antiEmojiDelete", "antiEmojiUpdate",
    "antiStickerCreate", "antiStickerDelete", "antiStickerUpdate",
    "antiGuildUpdate", "antiBotAdd", "antiIntegrationCreate", "antiPrune",
    "linkEngel", "inviteEngel", "kufurEngel", "argoEngel", "capsEngel",
    "emojiSpamEngel", "mentionSpamEngel", "everyoneHereEngel", "mediaSpamEngel",
    "selfBotEngel", "duplicateEngel", "lineLimitEngel", "lengthLimitEngel",
    "accountAgeGuard", "defaultAvatarGuard", "raidGuard", "usernameRegexGuard",
    "buttonVerification", "autoQuarantine"
];

function getSetting(guildId, key) {
    const settings = global.guardSettings.get(guildId) || {};
    return settings[key] !== undefined ? settings[key] : defaultSettings[key];
}

async function setSetting(guildId, key, value) {
    const settings = global.guardSettings.get(guildId) || {};
    settings[key] = value;
    global.guardSettings.set(guildId, settings);
    await updateSetting(guildId, "guard_settings", settings);
}

// Unified granular whitelist check
function isWhitelisted(guild, userId, category) {
    if (userId === guild.ownerId) return true;
    if (userId === guild.client.user.id) return true;

    // Full whitelist fallback (Legacy array support)
    const guvenliListe = global.guvenliListes.get(guild.id) || [];
    if (guvenliListe.includes(userId)) return true;

    const settings = global.guardSettings.get(guild.id) || {};
    const whitelistPerms = settings.whitelistPerms || {};
    const userPerms = whitelistPerms[userId];

    if (userPerms) {
        if (userPerms.full) return true;
        if (category && userPerms[category]) return true;
    }

    return false;
}

// Autonomous Mode check
function isFeatureEnabled(guildId, featureKey) {
    if (getSetting(guildId, "autonomousMode")) {
        const threat = global.guildThreatLevels.get(guildId) || 0;

        // Level 3 (Attack/Raid): > 70
        if (threat >= 70) {
            if ([
                "raidGuard", "buttonVerification", "antiChannelCreate", "antiRoleCreate",
                "linkEngel", "inviteEngel", "everyoneHereEngel", "autoQuarantine"
            ].includes(featureKey)) {
                return true;
            }
        }

        // Level 2 (Suspicious Activity): > 35
        if (threat >= 35) {
            if ([
                "linkEngel", "inviteEngel", "kufurEngel", "argoEngel",
                "emojiSpamEngel", "mentionSpamEngel"
            ].includes(featureKey)) {
                return true;
            }
        }
    }
    return getSetting(guildId, featureKey);
}

function increaseThreat(guildId, points, reason, guild) {
    if (!getSetting(guildId, "autonomousMode")) return;

    let threat = global.guildThreatLevels.get(guildId) || 0;
    const oldThreat = threat;
    threat = Math.min(100, threat + points);
    global.guildThreatLevels.set(guildId, threat);

    if (oldThreat < 35 && threat >= 35) {
        sendGuardLog(guild, { id: "SYSTEM", tag: "Otonom Koruma" }, null, `Şüpheli Aktivite: ${reason} (Tehdit: %${threat})`, "Orta Seviye Korumalar Devrede", guildId);
    } else if (oldThreat < 70 && threat >= 70) {
        sendGuardLog(guild, { id: "SYSTEM", tag: "Otonom Koruma" }, null, `Saldırı/Raid Girişimi: ${reason} (Tehdit: %${threat})`, "Üst Seviye Karantina Korumaları Devrede", guildId);
        sendOwnerAlert(guild, `⚠️ **Sunucunuz Tehdit Altında!**\nSaldırı/Raid algılandı ve Tehdit Seviyesi kritik **%${threat}** değerine ulaştı! Butonlu doğrulama, karantina ve kanal korumaları otonom olarak devreye sokuldu.`, guildId);
    }
}

// Get Audit Log Entry with Retries (Ensures correct log retrieval under latency)
async function getAuditLogEntry(guild, actionType, retries = 3, delayMs = 500) {
    for (let i = 0; i < retries; i++) {
        const logs = await guild.fetchAuditLogs({ type: actionType, limit: 1 }).catch(() => null);
        if (logs) {
            const entry = logs.entries.first();
            if (entry && (Date.now() - entry.createdTimestamp) < 8000) {
                return entry;
            }
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return null;
}

// Alert Guild Owner via DM
async function sendOwnerAlert(guild, content, guildId) {
    try {
        const ownerId = guild.ownerId;
        const owner = await guild.members.fetch(ownerId).catch(() => null);
        if (owner) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("🚨 Slesy Guard | Sunucu Sahibi Bildirimi")
                .setDescription(content)
                .setTimestamp();
            await owner.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (e) {
        console.error("Owner alert DM failed:", e);
    }
}

async function sendGuardLog(guild, executor, target, action, punishment, guildId) {
    const logChannelId = getSetting(guildId, "logChannelId");
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🛡️ Slesy Guard | Güvenlik İhlali!")
        .addFields(
            { name: "👤 Fail", value: executor.tag ? `${executor.tag} (\`${executor.id}\`)` : `${executor} (\`${executor.id}\`)`, inline: true },
            { name: "📂 Eylem", value: action, inline: true },
            { name: "⚡ İşlem", value: punishment, inline: true }
        )
        .setTimestamp();

    if (target) {
        embed.addFields({ name: "🎯 Hedef", value: `${target}`, inline: true });
    }

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function punishAdmin(guild, user, reason, guildId) {
    const me = guild.members.me;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Check if the user is the owner (Owner cannot be punished)
    if (user.id === guild.ownerId) {
        await sendGuardLog(guild, { id: "SYSTEM", tag: "Koruma Es Geçildi" }, user, `${reason} - Sunucu Sahibi Eylemi.`, "Cezalandırma Atlandı", guildId);
        return;
    }

    // Hierarchy check: ensure the bot can modify the target admin
    if (me.roles.highest.position <= member.roles.highest.position) {
        await sendGuardLog(guild, { id: "SYSTEM", tag: "Koruma Hatası" }, user, `${reason} - Rol hiyerarşisi engeli!`, "Ceza Uygulanamadı", guildId);
        await sendOwnerAlert(guild, `⚠️ **Ceza Uygulanamadı (Rol Hiyerarşisi):** ${user.tag} (\`${user.id}\`) adlı yönetici "${reason}" nedeniyle cezalandırılmak istendi fakat en yüksek rolü botunkinden daha üstün olduğu için işlem yapılamadı! Lütfen botun rolünü en üste taşıyın.`, guildId);
        return;
    }

    if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
        await sendGuardLog(guild, { id: "SYSTEM", tag: "Koruma Hatası" }, user, `${reason} - Botun banlama yetkisi eksik!`, "Ceza Uygulanamadı", guildId);
        await sendOwnerAlert(guild, `⚠️ **Ceza Uygulanamadı (Yetki Eksikliği):** Botun "Üyeleri Yasakla" yetkisi olmadığı için ${user.tag} kullanıcısı banlanamadı!`, guildId);
        return;
    }

    await sendGuardLog(guild, user, null, reason, "Yetkileri Alındı & Yasaklandı", guildId);

    // Strip roles asynchronously
    if (me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await member.roles.set([]).catch(() => {});
    }

    // Ban member
    await member.ban({ reason: `Guard | ${reason}` }).catch(() => {});

    // DM alert to Owner
    await sendOwnerAlert(guild, `🚨 **Yönetici Cezalandırıldı:** Sunucuda bir güvenlik ihlali algılandı ve yetkili uzaklaştırıldı.\n\n**Yetkili:** ${user.tag} (\`${user.id}\`)\n**Sebep:** ${reason}`, guildId);
}

function checkRateLimit(guildId, adminId, limitKey, limitMax, limitMinutes) {
    let trackerMap = null;
    if (limitKey === "banLimit") trackerMap = global.banTracker;
    else if (limitKey === "kickLimit") trackerMap = global.kickTracker;
    else if (limitKey === "channelDeleteLimit") trackerMap = global.channelDeleteTracker;
    else if (limitKey === "roleDeleteLimit") trackerMap = global.roleDeleteTracker;
    else if (limitKey === "roleGiveLimit") trackerMap = global.roleGiveTracker;

    if (!trackerMap) return false;

    let guildMap = trackerMap.get(guildId) || new Map();
    let timestamps = guildMap.get(adminId) || [];
    const now = Date.now();

    timestamps = timestamps.filter(t => now - t < limitMinutes * 60 * 1000);
    timestamps.push(now);

    guildMap.set(adminId, timestamps);
    trackerMap.set(guildId, guildMap);

    return timestamps.length > limitMax;
}

// Rate-limit safe queue to restore members of a deleted role
async function restoreRoleMembers(guild, newRole, memberIds, guildId) {
    if (!memberIds || memberIds.length === 0) return;

    sendGuardLog(guild, { id: "SYSTEM", tag: "Rol Kurtarma" }, null, `Rol üyeleri geri yükleme işlemi başlatıldı: **${newRole.name}**\nToplam kurtarılacak üye: \`${memberIds.length}\` adet.`, "Üye Rolleri Eşitleniyor...", guildId);

    const chunkSize = 5;
    const delayMs = 1500;

    for (let i = 0; i < memberIds.length; i += chunkSize) {
        const chunk = memberIds.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (memberId) => {
            try {
                const member = await guild.members.fetch(memberId).catch(() => null);
                if (member && !member.roles.cache.has(newRole.id)) {
                    await member.roles.add(newRole).catch(() => {});
                }
            } catch (err) {
                // Ignore single member errors
            }
        }));

        if (i + chunkSize < memberIds.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    sendGuardLog(guild, { id: "SYSTEM", tag: "Rol Kurtarma" }, null, `Rol üyeleri geri yükleme işlemi başarıyla tamamlandı: **${newRole.name}**`, `\`${memberIds.length}\` üyeye rolü iade edildi.`, guildId);
}

async function showLimitModal(interaction, key, label) {
    const modal = new ModalBuilder()
        .setCustomId(`modal_limit_${key}`)
        .setTitle("Değeri Özelleştir");

    const limitInput = new TextInputBuilder()
        .setCustomId("limit_value")
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Sayısal bir değer girin")
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(limitInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

module.exports = {

    data: new SlashCommandBuilder()
        .setName("guard")
        .setDescription("Guard sistemini yönetir")

        .addStringOption(option =>
            option
                .setName("işlem")
                .setDescription("İşlem seç (Panel için boş bırakın)")
                .setRequired(false)
                .addChoices(
                    { name: "Aç", value: "ac" },
                    { name: "Kapat", value: "kapat" },
                    { name: "Güvenli Ekle", value: "guvenli-ekle" },
                    { name: "Güvenli Çıkar", value: "guvenli-cikar" },
                    { name: "Güvenli Liste", value: "liste" }
                )
        )

        .addUserOption(option =>
            option
                .setName("kullanici")
                .setDescription("Güvenli eklenecek/çıkarılacak kullanıcı")
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {
        const islem = interaction.options.getString("işlem");
        const kullanici = interaction.options.getUser("kullanici");
        const guildId = interaction.guild.id;

        // Legacy text-based actions support
        if (islem === "ac") {
            global.guardDurums.set(guildId, true);
            await updateSetting(guildId, "guard_durum", true);
            return interaction.reply({ content: "🛡️ Guard sistemi aktif edildi." });
        }

        if (islem === "kapat") {
            global.guardDurums.set(guildId, false);
            await updateSetting(guildId, "guard_durum", false);
            return interaction.reply({ content: "❌ Guard sistemi kapatıldı." });
        }

        if (islem === "guvenli-ekle") {
            if (!kullanici) return interaction.reply({ content: "❌ Kullanıcı belirt.", ephemeral: true });
            let list = global.guvenliListes.get(guildId) || [];
            if (list.includes(kullanici.id)) return interaction.reply({ content: "⚠️ Zaten güvenli listede.", ephemeral: true });
            list.push(kullanici.id);
            global.guvenliListes.set(guildId, list);
            await updateSetting(guildId, "guvenli_liste", list);
            return interaction.reply({ content: `✅ ${kullanici.tag} güvenli listeye eklendi.` });
        }

        if (islem === "guvenli-cikar") {
            if (!kullanici) return interaction.reply({ content: "❌ Kullanıcı belirt.", ephemeral: true });
            let list = global.guvenliListes.get(guildId) || [];
            list = list.filter(id => id !== kullanici.id);
            global.guvenliListes.set(guildId, list);
            await updateSetting(guildId, "guvenli_liste", list);
            return interaction.reply({ content: `✅ ${kullanici.tag} güvenli listeden çıkarıldı.` });
        }

        if (islem === "liste") {
            const list = global.guvenliListes.get(guildId) || [];
            if (list.length <= 0) return interaction.reply({ content: "📄 Güvenli liste boş." });
            const listStr = list.map(id => `<@${id}>`).join("\n");
            return interaction.reply({ content: `🛡️ Güvenli Liste:\n\n${listStr}` });
        }

        // ============================================
        // INTERACTIVE CONTROL PANEL (REDESIGNED)
        // ============================================
        let activePage = "main";

        const generateEmbed = () => {
            const statusEmoji = (key) => isFeatureEnabled(guildId, key) ? "🟢 **AKTİF**" : "🔴 **PASİF**";
            const mainStatus = global.guardDurums.get(guildId) ? "🟢 **AKTİF**" : "🔴 **DEVRE DIŞI**";
            const autoStatus = getSetting(guildId, "autonomousMode") ? "🟢 **AKTİF**" : "🔴 **PASİF**";
            const threatVal = global.guildThreatLevels.get(guildId) || 0;

            let bar = "";
            const blocks = Math.round(threatVal / 10);
            for(let i=0; i<10; i++) {
                bar += i < blocks ? "█" : "░";
            }

            let threatColor = "🟢 **GÜVENLİ**";
            if (threatVal >= 70) threatColor = "🔴 **KRİTİK / RAID SALDIRISI**";
            else if (threatVal >= 35) threatColor = "🟡 **ŞÜPHELİ HAREKET**";

            const divider = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

            if (activePage === "main") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🛡️ Slesy Guard | Sistem Kontrol Paneli")
                    .setDescription(`
${divider}
**« SİSTEM DURUMU »**
• **Ana Koruma Modu** :: ${mainStatus}
• **Otonom Koruma**  :: ${autoStatus}

**« TEHDİT SEVİYESİ »**
• **Sunucu Durumu**  :: ${threatColor}
• **Tehdit Göstergesi**:: \`[${bar}] %${threatVal}\`

**« SUNUCU DETAYLARI »**
• **Toplam Üye**     :: \`${interaction.guild.memberCount}\`
• **Toplam Kanal**    :: \`${interaction.guild.channels.cache.size}\`
• **Toplam Rol**      :: \`${interaction.guild.roles.cache.size}\`
${divider}
*Farklı koruma kategorilerini yönetmek veya whitelist işlemlerini gerçekleştirmek için aşağıdaki menüleri ve butonları kullanın.*`)
                    .setTimestamp()
                    .setFooter({ text: "Slesy Global Security Systems Solutions" });
            }

            if (activePage === "server") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🖥️ Sunucu Bütünlüğü Korumaları")
                    .setDescription(`
${divider}
**« KANAL KORUMALARI »**
• **Kanal Oluşturma**        :: ${statusEmoji("antiChannelCreate")}
• **Kanal Silme**            :: ${statusEmoji("antiChannelDelete")} \`[Kategori/İzin Kurtarmalı]\`
• **Kanal Güncelleme**       :: ${statusEmoji("antiChannelUpdate")} \`[Eskiye Döndürmeli]\`
• **İzin Sıfırlama Engeli**  :: ${statusEmoji("antiChannelOverwriteClear")}
• **Kanal Klonlama Engeli**  :: ${statusEmoji("antiChannelClone")}
• **Kategori Silme Engeli**  :: ${statusEmoji("antiCategoryDelete")}
• **Yavaş Mod Koruması**     :: ${statusEmoji("antiChannelSlowmodeChange")}
• **NSFW Kapatma Engeli**     :: ${statusEmoji("antiNSFWDisable")}
• **Kanal Adı Koruması**     :: ${statusEmoji("antiChannelNameSpam")}
• **Bitrate Koruması**       :: ${statusEmoji("antiVoiceBitrateSpam")}
• **Kanal Üye Sınırı Koruması**:: ${statusEmoji("antiVoiceLimitChange")}
• **Kürsü Kanalı Engeli**    :: ${statusEmoji("antiStageChannelSpam")}

**« ROL KORUMALARI »**
• **Rol Oluşturma**          :: ${statusEmoji("antiRoleCreate")}
• **Rol Silme**              :: ${statusEmoji("antiRoleDelete")} \`[Üye Rollerini İade Etmeli]\`
• **Rol Güncelleme**         :: ${statusEmoji("antiRoleUpdate")} \`[Yetki Sınırlandırmalı]\`
• **Everyone Yetki Engeli**  :: ${statusEmoji("antiEveryoneAdminGive")}
• **Renk Değişim Engeli**    :: ${statusEmoji("antiRoleColorChange")}
• **Rol Adı Koruması**       :: ${statusEmoji("antiRoleNameSpam")}
• **Hoist Kapatma Engeli**   :: ${statusEmoji("antiRoleHoistDisable")}
• **Etiketlenebilme Engeli** :: ${statusEmoji("antiRoleMentionableEnable")}
• **Bot Rolü Düzenleme**     :: ${statusEmoji("antiBotRoleModify")}
• **Hiyerarşi Değişikliği**  :: ${statusEmoji("antiRolePositionChange")}
• **Yetkili Rol Verme Sınırı**:: ${statusEmoji("antiAdminRoleGiveLimit")}
• **Kayıt Rol İstismarı**    :: ${statusEmoji("antiOnboardingRoleSpam")}
• **Entegrasyon Rolü Silme** :: ${statusEmoji("antiIntegrationRoleDelete")}

**« DİĞER SİSTEM KORUMALARI »**
• **Webhook Koruması**       :: ${statusEmoji("antiWebhookCreate")}
• **Anti Bot Ekleme**        :: ${statusEmoji("antiBotAdd")} \`[Bot & Admin Engelleyici]\`
• **Sunucu Ayarları Koruması**:: ${statusEmoji("antiGuildUpdate")}
• **Sunucu Budama (Prune)**  :: ${statusEmoji("antiPrune")}
${divider}
*İstediğiniz koruma kategorisini yapılandırmak için aşağıdaki açılır menüleri kullanın.*`);
            }

            if (activePage === "chat") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("💬 Sohbet & İçerik Korumaları")
                    .setDescription(`
${divider}
**« İÇERİK ENGELLERİ »**
• **Tüm Link Engeli**          :: ${statusEmoji("linkEngel")}
• **Davet Link Engeli**        :: ${statusEmoji("inviteEngel")} \`[Discord Davetleri]\`
• **Küfür Engeli**             :: ${statusEmoji("kufurEngel")}
• **Argo Sözcük Engeli**       :: ${statusEmoji("argoEngel")}

**« BİÇİM & SPAM FİLTRELERİ »**
• **Büyük Harf (Caps Lock)**   :: ${statusEmoji("capsEngel")} \`[>%70 Oran]\`
• **Tekrarlanan Mesaj Engeli** :: ${statusEmoji("duplicateEngel")}
• **Satır Sınırı Engeli**      :: ${statusEmoji("lineLimitEngel")}
• **Karakter Sınırı Engeli**   :: ${statusEmoji("lengthLimitEngel")}

**« DETAYLI SPAM KORUMALARI »**
• **Emoji Spami Engeli**       :: ${statusEmoji("emojiSpamEngel")} \`[>5 Emoji]\`
• **Etiket Spami Engeli**      :: ${statusEmoji("mentionSpamEngel")} \`[>4 Etiket]\`
• **Mass Tag (@everyone)**     :: ${statusEmoji("everyoneHereEngel")}
• **Medya Spami Engeli**       :: ${statusEmoji("mediaSpamEngel")}
${divider}
*İstediğiniz sohbet filtresini açıp kapatmak veya düzenlemek için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "raid") {
                const limitDays = getSetting(guildId, "accountAgeLimit");
                const limitRejoins = getSetting(guildId, "raidLimit");
                const limitTime = getSetting(guildId, "raidTime");
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("👥 Giriş Güvenliği & Raid Koruması")
                    .setDescription(`
${divider}
**« HESAP VE GİRİŞ KORUMALARI »**
• **Yeni Hesap Koruması**      :: ${statusEmoji("accountAgeGuard")} \`(Sınır: ${limitDays} Gün)\`
• **Varsayılan Avatar Koruması**:: ${statusEmoji("defaultAvatarGuard")}
• **Anti-Raid Giriş Koruması**  :: ${statusEmoji("raidGuard")} \`(Sınır: ${limitRejoins} Giriş / ${limitTime} Sn)\`
• **Reklamlı İsim Koruması**    :: ${statusEmoji("usernameRegexGuard")}

**« DOĞRULAMA & KARANTİNA »**
• **Butonlu Doğrulama**        :: ${statusEmoji("buttonVerification")}
• **Otomatik Karantina**        :: ${statusEmoji("autoQuarantine")}
${divider}
*Doğrulama ve Karantina rollerini ayarlamak, yaş veya giriş limitlerini özelleştirmek için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "limits") {
                const limitTime = getSetting(guildId, "limitTime");
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("⚙️ Yönetici Hız Limitleri")
                    .setDescription(`
${divider}
Bir yöneticinin belirlenen zaman dilimi (\`${limitTime} Dakika\`) içinde yapabileceği maksimum eylem limitleri. Limit aşıldığında yetkili banlanır ve tüm rolleri alınır.

**« İŞLEM EŞİKLERİ »**
• **Banlama Sınırı**           :: \`${getSetting(guildId, "banLimit")} Adet\`
• **Kullanıcı Atma (Kick)**    :: \`${getSetting(guildId, "kickLimit")} Adet\`
• **Kanal Silme Sınırı**       :: \`${getSetting(guildId, "channelDeleteLimit")} Adet\`
• **Rol Silme Sınırı**         :: \`${getSetting(guildId, "roleDeleteLimit")} Adet\`
• **Rol Verme Sınırı**         :: \`${getSetting(guildId, "roleGiveLimit")} Adet\`
${divider}
*Zaman aralıklarını ve adet sınırlarını özelleştirmek için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "logs") {
                const logCh = getSetting(guildId, "logChannelId") ? `<#${getSetting(guildId, "logChannelId")}>` : "🔴 Ayarlanmamış";
                const verifyRol = getSetting(guildId, "verifyRoleId") ? `<@&${getSetting(guildId, "verifyRoleId")}>` : "🔴 Ayarlanmamış";
                const quarantineRol = getSetting(guildId, "quarantineRoleId") ? `<@&${getSetting(guildId, "quarantineRoleId")}>` : "🔴 Ayarlanmamış";

                const list = global.guvenliListes.get(guildId) || [];
                const fullWl = list.length > 0 ? list.map(id => `<@${id}>`).join(", ") : "🔴 Liste Boş";

                const settings = global.guardSettings.get(guildId) || {};
                const whitelistPerms = settings.whitelistPerms || {};
                let specialWlStr = "";
                for (const [id, perms] of Object.entries(whitelistPerms)) {
                    const activeP = [];
                    if (perms.channel) activeP.push("Kanal 🟢");
                    if (perms.role) activeP.push("Rol 🟢");
                    if (perms.chat) activeP.push("Sohbet 🟢");
                    if (perms.limitBypass) activeP.push("Limit 🟢");

                    specialWlStr += `• <@${id}> :: [${activeP.length > 0 ? activeP.join(", ") : "Yetki Yok 🔴"}]\n`;
                }
                if (!specialWlStr) specialWlStr = "🔴 Kayıtlı Özel Yetkili Yok";

                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("📄 Sistem Konfigürasyonu & Whitelist Yetkileri")
                    .setDescription(`
${divider}
**« SİSTEM KANALLARI & ROLLERİ »**
• **Log Kanalı**               :: ${logCh}
• **Doğrulama Rolü**           :: ${verifyRol}
• **Karantina Rolü**           :: ${quarantineRol}

**« TAM GÜVENLİ LİSTE (FULL BYPASS) »**
${fullWl}

**« ÖZEL YETKİLİLER VE GÜVENLİ LİSTELERİ »**
${specialWlStr}
${divider}
*Log kanallarını, doğrulama rollerini ve whitelist yetkilendirmelerini yapılandırmak için aşağıdaki seçim menüsünü kullanın.*`);
            }
        };

        const generateComponents = () => {
            // Navigation dropdown (Row 1) - Shown on all pages
            const rowNav = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select_page")
                    .setPlaceholder("📂 Gitmek istediğiniz kategoriyi seçin")
                    .addOptions([
                        { label: "🛡️ Ana Sayfa / Genel Durum", value: "page_main", description: "Genel sunucu ve otonom koruma durumu.", default: activePage === "main" },
                        { label: "🖥️ Sunucu Bütünlüğü Korumaları", value: "page_server", description: "Kanal, rol ve webhook korumaları.", default: activePage === "server" },
                        { label: "💬 Sohbet & İçerik Korumaları", value: "page_chat", description: "Küfür, link ve spam engelleri.", default: activePage === "chat" },
                        { label: "👥 Giriş Güvenliği & Raid", value: "page_raid", description: "Hesap yaşı, anti-raid ve karantina.", default: activePage === "raid" },
                        { label: "⚙️ Yönetici Hız Limitleri", value: "page_limits", description: "Yöneticilerin eylem eşik sınırları.", default: activePage === "limits" },
                        { label: "📄 Sistem Ayarları & Whitelist", value: "page_logs", description: "Log kanalı, roller ve whitelist.", default: activePage === "logs" }
                    ])
            );

            const rows = [rowNav];

            if (activePage === "main") {
                const rowMainActions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("action_autonom").setLabel("🤖 Otonom Mod").setStyle(getSetting(guildId, "autonomousMode") ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("action_open_all").setLabel("🟢 Hepsini Aç").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("action_close_all").setLabel("🔴 Hepsini Kapat").setStyle(ButtonStyle.Danger)
                );
                rows.push(rowMainActions);
            } else if (activePage === "server") {
                const selectChannels = new StringSelectMenuBuilder()
                    .setCustomId("toggle_channels")
                    .setPlaceholder("🖥️ Kanal Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(13)
                    .addOptions([
                        { label: "Kanal Oluşturma Koruması", value: "antiChannelCreate", description: "Kanal açılınca siler & engeller.", default: getSetting(guildId, "antiChannelCreate") },
                        { label: "Kanal Silme Koruması", value: "antiChannelDelete", description: "Silinen kanalı kurtarır & engeller.", default: getSetting(guildId, "antiChannelDelete") },
                        { label: "Kanal Güncelleme Koruması", value: "antiChannelUpdate", description: "Kanal değişimini geri alır & engeller.", default: getSetting(guildId, "antiChannelUpdate") },
                        { label: "Kanal İzin Sıfırlama Engeli", value: "antiChannelOverwriteClear", description: "Kanal izin sıfırlamalarını geri yükler.", default: getSetting(guildId, "antiChannelOverwriteClear") },
                        { label: "Kanal Klonlama Engeli", value: "antiChannelClone", description: "Kanal klonlamalarını engeller.", default: getSetting(guildId, "antiChannelClone") },
                        { label: "Kategori Silme Engeli", value: "antiCategoryDelete", description: "Silinen kategorileri ve alt kanalları kurtarır.", default: getSetting(guildId, "antiCategoryDelete") },
                        { label: "Yavaş Mod Koruması", value: "antiChannelSlowmodeChange", description: "Yavaş mod değişimlerini geri yükler.", default: getSetting(guildId, "antiChannelSlowmodeChange") },
                        { label: "NSFW Kapatma Engeli", value: "antiNSFWDisable", description: "NSFW kapatmalarını geri açar.", default: getSetting(guildId, "antiNSFWDisable") },
                        { label: "Kanal Adı Koruması", value: "antiChannelNameSpam", description: "Kanal isim değişikliklerini engeller.", default: getSetting(guildId, "antiChannelNameSpam") },
                        { label: "Bitrate Koruması", value: "antiVoiceBitrateSpam", description: "Ses bitrate değişimlerini geri yükler.", default: getSetting(guildId, "antiVoiceBitrateSpam") },
                        { label: "Kanal Üye Sınırı Koruması", value: "antiVoiceLimitChange", description: "Ses üye sınırı değişimlerini engeller.", default: getSetting(guildId, "antiVoiceLimitChange") },
                        { label: "Kürsü Kanalı Engeli", value: "antiStageChannelSpam", description: "Stage kürsü kanalı istismarını engeller.", default: getSetting(guildId, "antiStageChannelSpam") }
                    ]);

                const selectRoles = new StringSelectMenuBuilder()
                    .setCustomId("toggle_roles")
                    .setPlaceholder("🛡️ Rol Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(13)
                    .addOptions([
                        { label: "Rol Oluşturma Koruması", value: "antiRoleCreate", description: "Rol açılınca siler & engeller.", default: getSetting(guildId, "antiRoleCreate") },
                        { label: "Rol Silme Koruması", value: "antiRoleDelete", description: "Silinen rolü ve üyelerini kurtarır.", default: getSetting(guildId, "antiRoleDelete") },
                        { label: "Rol Güncelleme Koruması", value: "antiRoleUpdate", description: "Rol yetki değişimini geri alır.", default: getSetting(guildId, "antiRoleUpdate") },
                        { label: "Everyone Yetki Engeli", value: "antiEveryoneAdminGive", description: "@everyone rolüne yetki verilmesini engeller.", default: getSetting(guildId, "antiEveryoneAdminGive") },
                        { label: "Renk Değişim Engeli", value: "antiRoleColorChange", description: "Yetkili rol renk değişimlerini engeller.", default: getSetting(guildId, "antiRoleColorChange") },
                        { label: "Rol Adı Koruması", value: "antiRoleNameSpam", description: "Rol isim değişikliklerini engeller.", default: getSetting(guildId, "antiRoleNameSpam") },
                        { label: "Hoist Kapatma Engeli", value: "antiRoleHoistDisable", description: "Rollerin sağda gösterimini geri açar.", default: getSetting(guildId, "antiRoleHoistDisable") },
                        { label: "Etiketlenebilme Engeli", value: "antiRoleMentionableEnable", description: "Rol etiketleme açılmasını engeller.", default: getSetting(guildId, "antiRoleMentionableEnable") },
                        { label: "Bot Rolü Düzenleme Engeli", value: "antiBotRoleModify", description: "Entegrasyon bot rollerini korur.", default: getSetting(guildId, "antiBotRoleModify") },
                        { label: "Hiyerarşi Değişiklik Engeli", value: "antiRolePositionChange", description: "Rol sıralama değişikliklerini geri alır.", default: getSetting(guildId, "antiRolePositionChange") },
                        { label: "Yetkili Rol Verme Sınırı", value: "antiAdminRoleGiveLimit", description: "Adet/Süre bazlı yönetici rol verme sınırı.", default: getSetting(guildId, "antiAdminRoleGiveLimit") },
                        { label: "Kayıt Rol İstismarı Koruması", value: "antiOnboardingRoleSpam", description: "İzinsiz kayıt/üye rol vermelerini engeller.", default: getSetting(guildId, "antiOnboardingRoleSpam") },
                        { label: "Entegrasyon Rolü Silme", value: "antiIntegrationRoleDelete", description: "Silinen entegrasyon rollerini kurtarır.", default: getSetting(guildId, "antiIntegrationRoleDelete") }
                    ]);

                const selectOther = new StringSelectMenuBuilder()
                    .setCustomId("toggle_server_other")
                    .setPlaceholder("⚙️ Diğer Sistem Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(4)
                    .addOptions([
                        { label: "Webhook Koruması", value: "antiWebhookCreate", description: "Webhook açılınca siler & engeller.", default: getSetting(guildId, "antiWebhookCreate") },
                        { label: "Anti-Bot Ekleme", value: "antiBotAdd", description: "İzinsiz botları atar & ekleyeni engeller.", default: getSetting(guildId, "antiBotAdd") },
                        { label: "Sunucu Ayarları Koruması", value: "antiGuildUpdate", description: "Sunucu ayarlarını geri yükler.", default: getSetting(guildId, "antiGuildUpdate") },
                        { label: "Sunucu Budama (Prune) Engeli", value: "antiPrune", description: "Toplu üye budamalarını engeller.", default: getSetting(guildId, "antiPrune") }
                    ]);

                rows.push(new ActionRowBuilder().addComponents(selectChannels));
                rows.push(new ActionRowBuilder().addComponents(selectRoles));
                rows.push(new ActionRowBuilder().addComponents(selectOther));
            } else if (activePage === "chat") {
                const selectChat = new StringSelectMenuBuilder()
                    .setCustomId("toggle_chat")
                    .setPlaceholder("💬 Filtreleri Seçin / Düzenleyin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(10)
                    .addOptions([
                        { label: "Tüm Linkleri Engelle", value: "linkEngel", description: "Tüm web adreslerini engeller.", default: getSetting(guildId, "linkEngel") },
                        { label: "Davet Linklerini Engelle", value: "inviteEngel", description: "Discord davet linklerini engeller.", default: getSetting(guildId, "inviteEngel") },
                        { label: "Küfür Filtresi", value: "kufurEngel", description: "Küfürlü kelimeleri engeller.", default: getSetting(guildId, "kufurEngel") },
                        { label: "Argo Filtresi", value: "argoEngel", description: "Argo kelimeleri engeller.", default: getSetting(guildId, "argoEngel") },
                        { label: "Caps Lock Filtresi", value: "capsEngel", description: "Aşırı büyük harf kullanımını engeller.", default: getSetting(guildId, "capsEngel") },
                        { label: "Emoji Spam Filtresi", value: "emojiSpamEngel", description: "Çok fazla emoji kullanımını engeller.", default: getSetting(guildId, "emojiSpamEngel") },
                        { label: "Etiket Spam Filtresi", value: "mentionSpamEngel", description: "Çok fazla etiket kullanımını engeller.", default: getSetting(guildId, "mentionSpamEngel") },
                        { label: "Toplu Etiket Engeli", value: "everyoneHereEngel", description: "Yetkisiz @everyone ve @here engeller.", default: getSetting(guildId, "everyoneHereEngel") },
                        { label: "Medya Spam Filtresi", value: "mediaSpamEngel", description: "Arka arkaya görsel paylaşımını engeller.", default: getSetting(guildId, "mediaSpamEngel") },
                        { label: "Tekrarlanan Mesaj Engeli", value: "duplicateEngel", description: "Aynı mesajların gönderimini engeller.", default: getSetting(guildId, "duplicateEngel") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectChat));
            } else if (activePage === "raid") {
                const selectRaidBools = new StringSelectMenuBuilder()
                    .setCustomId("toggle_raid_bools")
                    .setPlaceholder("👥 Giriş Güvenliklerini Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(6)
                    .addOptions([
                        { label: "Yeni Hesap Koruması", value: "accountAgeGuard", description: "Yeni açılmış hesapları sunucudan atar.", default: getSetting(guildId, "accountAgeGuard") },
                        { label: "Varsayılan Avatar Koruması", value: "defaultAvatarGuard", description: "Profil resmi olmayan hesapları atar.", default: getSetting(guildId, "defaultAvatarGuard") },
                        { label: "Anti-Raid Koruması", value: "raidGuard", description: "Saldırı anında girişleri engeller.", default: getSetting(guildId, "raidGuard") },
                        { label: "Reklamlı İsim Koruması", value: "usernameRegexGuard", description: "İsminde link olan hesapları atar.", default: getSetting(guildId, "usernameRegexGuard") },
                        { label: "Butonlu Doğrulama Sistemi", value: "buttonVerification", description: "Yeni üyeleri butonla doğrulatır.", default: getSetting(guildId, "buttonVerification") },
                        { label: "Otomatik Karantina", value: "autoQuarantine", description: "Yeni üyeleri direkt karantinaya alır.", default: getSetting(guildId, "autoQuarantine") }
                    ]);
                const selectRaidLimits = new StringSelectMenuBuilder()
                    .setCustomId("adjust_raid_numbers")
                    .setPlaceholder("✍️ Sayısal limitleri ayarlayın")
                    .addOptions([
                        { label: "Hesap Yaş Sınırını Belirle (Gün)", value: "custom_age" },
                        { label: "Raid Giriş Sınırını Belirle (Kişi)", value: "custom_raid" },
                        { label: "Raid Zaman Dilimini Belirle (Saniye)", value: "custom_raid_time" }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectRaidBools));
                rows.push(new ActionRowBuilder().addComponents(selectRaidLimits));
            } else if (activePage === "limits") {
                const selectLimits = new StringSelectMenuBuilder()
                    .setCustomId("adjust_limits")
                    .setPlaceholder("⚙️ Eşik sınırlarını ve süreleri düzenleyin")
                    .addOptions([
                        { label: "Ban Limiti Değiştir", value: "banLimit" },
                        { label: "Kick Limiti Değiştir", value: "kickLimit" },
                        { label: "Kanal Silme Limiti Değiştir", value: "channelDeleteLimit" },
                        { label: "Rol Silme Limiti Değiştir", value: "roleDeleteLimit" },
                        { label: "Rol Verme Limiti Değiştir", value: "roleGiveLimit" },
                        { label: "Zaman Dilimini Değiştir (Dakika)", value: "limitTime" }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectLimits));
            } else if (activePage === "logs") {
                const selectLogs = new StringSelectMenuBuilder()
                    .setCustomId("select_log_action")
                    .setPlaceholder("📄 Rol/Log/Whitelist Ayarları")
                    .addOptions([
                        { label: "Log Kanalını Güncelle", value: "ch_log" },
                        { label: "Doğrulanmış Rolünü Güncelle", value: "role_verify" },
                        { label: "Karantina Rolünü Güncelle", value: "role_quarantine" },
                        { label: "Whitelist Üye Ekle (Bypass)", value: "wl_add" },
                        { label: "Whitelist Üye Çıkar", value: "wl_remove" },
                        { label: "Özel Yetkilendirmeleri Düzenle", value: "wl_perms" }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectLogs));
            }

            return rows;
        };

        const response = await interaction.reply({
            embeds: [generateEmbed()],
            components: generateComponents(),
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 600000
        });

        collector.on("collect", async (i) => {
            // Check Modal requirements first
            if (i.customId === "adjust_limits") {
                const key = i.values[0];
                const labels = {
                    banLimit: "Ban Limiti (Adet)",
                    kickLimit: "Kick Limiti (Adet)",
                    channelDeleteLimit: "Kanal Silme Limiti (Adet)",
                    roleDeleteLimit: "Rol Silme Limiti (Adet)",
                    roleGiveLimit: "Rol Verme Limiti (Adet)",
                    limitTime: "Zaman Dilimi (Dakika)"
                };
                return await showLimitModal(i, key, labels[key]);
            }

            if (i.customId === "adjust_raid_numbers") {
                const val = i.values[0];
                if (val === "custom_age") {
                    return await showLimitModal(i, "accountAgeLimit", "Hesap Yaş Sınırı (Gün)");
                }
                if (val === "custom_raid") {
                    return await showLimitModal(i, "raidLimit", "Raid Giriş Sınırı (Kişi)");
                }
                if (val === "custom_raid_time") {
                     return await showLimitModal(i, "raidTime", "Raid Zaman Aralığı (Saniye)");
                }
            }

            // Normal Flow: Defer update
            if (!i.customId.startsWith("wl_perms_toggle_") && i.customId !== "add_whitelist_member" && i.customId !== "remove_whitelist_member" && i.customId !== "select_perms_user") {
                await i.deferUpdate();
            }

            if (i.customId === "select_page") {
                activePage = i.values[0].replace("page_", "");
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "action_autonom") {
                const current = getSetting(guildId, "autonomousMode");
                await setSetting(guildId, "autonomousMode", !current);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "action_open_all") {
                const settings = global.guardSettings.get(guildId) || {};
                booleanKeys.forEach(k => settings[k] = true);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "action_close_all") {
                const settings = global.guardSettings.get(guildId) || {};
                booleanKeys.forEach(k => settings[k] = false);
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_channels") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiChannelCreate", "antiChannelDelete", "antiChannelUpdate",
                    "antiChannelOverwriteClear", "antiChannelClone", "antiCategoryDelete",
                    "antiChannelSlowmodeChange", "antiNSFWDisable", "antiChannelNameSpam",
                    "antiVoiceBitrateSpam", "antiVoiceLimitChange", "antiStageChannelSpam"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_roles") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiRoleCreate", "antiRoleDelete", "antiRoleUpdate",
                    "antiEveryoneAdminGive", "antiRoleColorChange", "antiRoleNameSpam",
                    "antiRoleHoistDisable", "antiRoleMentionableEnable", "antiBotRoleModify",
                    "antiRolePositionChange", "antiAdminRoleGiveLimit", "antiOnboardingRoleSpam",
                    "antiIntegrationRoleDelete"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_server_other") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiWebhookCreate", "antiBotAdd", "antiGuildUpdate", "antiPrune"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_chat") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "linkEngel", "inviteEngel", "kufurEngel", "argoEngel", "capsEngel",
                    "emojiSpamEngel", "mentionSpamEngel", "everyoneHereEngel", "mediaSpamEngel",
                    "duplicateEngel"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_raid_bools") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "accountAgeGuard", "defaultAvatarGuard", "raidGuard", "usernameRegexGuard",
                    "buttonVerification", "autoQuarantine"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "select_log_action") {
                const action = i.values[0];

                let selectRow;
                if (action === "ch_log") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new ChannelSelectMenuBuilder()
                            .setCustomId("set_channel_log")
                            .setPlaceholder("Log kanalını seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                } else if (action === "role_verify") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId("set_role_verify")
                            .setPlaceholder("Doğrulama rolünü seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                } else if (action === "role_quarantine") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId("set_role_quarantine")
                            .setPlaceholder("Karantina rolünü seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                } else if (action === "wl_add") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new UserSelectMenuBuilder()
                            .setCustomId("add_whitelist_member")
                            .setPlaceholder("Güvenli listeye eklenecek üyeyi seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                } else if (action === "wl_remove") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new UserSelectMenuBuilder()
                            .setCustomId("remove_whitelist_member")
                            .setPlaceholder("Güvenli listeden çıkarılacak üyeyi seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                } else if (action === "wl_perms") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new UserSelectMenuBuilder()
                            .setCustomId("select_perms_user")
                            .setPlaceholder("Özel yetki atanacak üyeyi seçin")
                    );
                    await interaction.editReply({
                        components: [generateComponents()[0], selectRow]
                    });
                }
            } else if (i.customId === "add_whitelist_member") {
                await i.deferUpdate();
                const targetUser = i.users.first();
                if (targetUser) {
                    let list = global.guvenliListes.get(guildId) || [];
                    if (!list.includes(targetUser.id)) {
                        list.push(targetUser.id);
                        global.guvenliListes.set(guildId, list);
                        await updateSetting(guildId, "guvenli_liste", list);
                    }
                }
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "remove_whitelist_member") {
                await i.deferUpdate();
                const targetUser = i.users.first();
                if (targetUser) {
                    let list = global.guvenliListes.get(guildId) || [];
                    list = list.filter(id => id !== targetUser.id);
                    global.guvenliListes.set(guildId, list);
                    await updateSetting(guildId, "guvenli_liste", list);

                    // Also remove granular perms
                    const settings = global.guardSettings.get(guildId) || {};
                    if (settings.whitelistPerms && settings.whitelistPerms[targetUser.id]) {
                        delete settings.whitelistPerms[targetUser.id];
                        await setSetting(guildId, "whitelistPerms", settings.whitelistPerms);
                    }
                }
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "select_perms_user") {
                await i.deferUpdate();
                const targetUser = i.users.first();
                if (targetUser) {
                    global.editingWhitelistUser.set(guildId, targetUser.id);

                    // Ensure record exists
                    const settings = global.guardSettings.get(guildId) || {};
                    settings.whitelistPerms = settings.whitelistPerms || {};
                    if (!settings.whitelistPerms[targetUser.id]) {
                        settings.whitelistPerms[targetUser.id] = {
                            full: false,
                            channel: false,
                            role: false,
                            chat: false,
                            limitBypass: false
                        };
                        await setSetting(guildId, "whitelistPerms", settings.whitelistPerms);
                    }

                    const showWlPermsMenu = async () => {
                        const targetId = global.editingWhitelistUser.get(guildId);
                        const userPerms = settings.whitelistPerms[targetId];

                        const rowPerms = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId("wl_perms_toggle_channel").setLabel(`Kanal: ${userPerms.channel ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId("wl_perms_toggle_role").setLabel(`Rol: ${userPerms.role ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId("wl_perms_toggle_chat").setLabel(`Sohbet: ${userPerms.chat ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId("wl_perms_toggle_limit").setLabel(`Limit: ${userPerms.limitBypass ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId("wl_perms_back").setLabel("↩️ Geri").setStyle(ButtonStyle.Primary)
                        );

                        await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x2B2D31)
                                    .setTitle(`🛡️ Özel Güvenlik Yetkilendirmesi`)
                                    .setDescription(`
Şu an yetkilendirmesi düzenlenen üye: <@${targetId}> (\`${targetId}\`)
İstediğiniz kategori yetkisini açmak veya kapatmak için aşağıdaki butonları kullanın.`)
                            ],
                            components: [rowPerms]
                        });
                    };

                    await showWlPermsMenu();
                }
            } else if (i.customId.startsWith("wl_perms_toggle_")) {
                await i.deferUpdate();
                const permKey = i.customId.replace("wl_perms_toggle_", "");
                const targetId = global.editingWhitelistUser.get(guildId);

                if (targetId) {
                    const settings = global.guardSettings.get(guildId) || {};
                    settings.whitelistPerms = settings.whitelistPerms || {};
                    const currentPerm = settings.whitelistPerms[targetId][permKey];

                    settings.whitelistPerms[targetId][permKey] = !currentPerm;
                    await setSetting(guildId, "whitelistPerms", settings.whitelistPerms);

                    // Re-render menu
                    const userPerms = settings.whitelistPerms[targetId];
                    const rowPerms = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("wl_perms_toggle_channel").setLabel(`Kanal: ${userPerms.channel ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId("wl_perms_toggle_role").setLabel(`Rol: ${userPerms.role ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId("wl_perms_toggle_chat").setLabel(`Sohbet: ${userPerms.chat ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId("wl_perms_toggle_limit").setLabel(`Limit: ${userPerms.limitBypass ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId("wl_perms_back").setLabel("↩️ Geri").setStyle(ButtonStyle.Primary)
                    );

                    await interaction.editReply({
                        components: [rowPerms]
                    });
                }
            } else if (i.customId === "wl_perms_back") {
                global.editingWhitelistUser.delete(guildId);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "set_channel_log") {
                const chId = i.values[0];
                await setSetting(guildId, "logChannelId", chId);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "set_role_verify") {
                const rId = i.values[0];
                await setSetting(guildId, "verifyRoleId", rId);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "set_role_quarantine") {
                const rId = i.values[0];
                await setSetting(guildId, "quarantineRoleId", rId);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            }
        });
    },

    // Modal submit response handler triggered from index.js
    async handleLimitModal(interaction) {
        const key = interaction.customId.replace("modal_limit_", "");
        const val = parseInt(interaction.fields.getTextInputValue("limit_value"));
        const guildId = interaction.guild.id;

        if (isNaN(val) || val < 0) {
            return interaction.reply({ content: "❌ Geçersiz sayı girdiniz! Lütfen pozitif bir tam sayı girin.", ephemeral: true });
        }

        await setSetting(guildId, key, val);
        await interaction.reply({ content: `✅ Değer başarıyla güncellendi! Yeni değer: **${val}**`, ephemeral: true });
    },

    // ============================================
    // AUDIT LOG EVENTS & CHAT FILTERS (REFACTORED)
    // ============================================
    init(client) {
        // Periodic decay of threat levels (5 points every 30 seconds)
        setInterval(() => {
            for (const [guildId, threat] of global.guildThreatLevels.entries()) {
                if (threat > 0) {
                    global.guildThreatLevels.set(guildId, Math.max(0, threat - 5));
                }
            }
        }, 30000);

        // Load split guard modules
        require("./guards/channels.js")(client);
        require("./guards/roles.js")(client);
        require("./guards/joins.js")(client);
        require("./guards/limits.js")(client);
        require("./guards/chat.js")(client);
    }
};

// Export helpers for sub-modules
module.exports.getSetting = getSetting;
module.exports.setSetting = setSetting;
module.exports.isFeatureEnabled = isFeatureEnabled;
module.exports.increaseThreat = increaseThreat;
module.exports.getAuditLogEntry = getAuditLogEntry;
module.exports.sendOwnerAlert = sendOwnerAlert;
module.exports.sendGuardLog = sendGuardLog;
module.exports.punishAdmin = punishAdmin;
module.exports.checkRateLimit = checkRateLimit;
module.exports.restoreRoleMembers = restoreRoleMembers;
module.exports.isWhitelisted = isWhitelisted;
