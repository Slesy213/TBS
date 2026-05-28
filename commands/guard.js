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
    antiRoleCreate: false,
    antiRoleDelete: false,
    antiRoleUpdate: false,
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
    "antiRoleCreate", "antiRoleDelete", "antiRoleUpdate",
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
• **Kanal Oluşturma Koruması** :: ${statusEmoji("antiChannelCreate")}
• **Kanal Silme Koruması**     :: ${statusEmoji("antiChannelDelete")} \`[Kategori/İzin Kurtarmalı]\`
• **Kanal Güncelleme Koruması** :: ${statusEmoji("antiChannelUpdate")} \`[Eskiye Döndürmeli]\`

**« ROL KORUMALARI »**
• **Rol Oluşturma Koruması**   :: ${statusEmoji("antiRoleCreate")}
• **Rol Silme Koruması**       :: ${statusEmoji("antiRoleDelete")} \`[Üye Rollerini İade Etmeli]\`
• **Rol Güncelleme Koruması**   :: ${statusEmoji("antiRoleUpdate")} \`[Yetki Sınırlandırmalı]\`

**« DİĞER BÜTÜNLÜK KORUMALARI »**
• **Webhook Koruması**         :: ${statusEmoji("antiWebhookCreate")}
• **Anti Bot Ekleme**          :: ${statusEmoji("antiBotAdd")} \`[Bot & Admin Engelleyici]\`
• **Sunucu Ayarları Koruması**  :: ${statusEmoji("antiGuildUpdate")}
• **Sunucu Budama (Prune)**    :: ${statusEmoji("antiPrune")}
${divider}
*İstediğiniz korumayı açıp kapatmak için aşağıdaki seçim menüsünü kullanın.*`);
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
            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("page_server").setLabel("🖥️ Sunucu").setStyle(activePage === "server" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_chat").setLabel("💬 Sohbet").setStyle(activePage === "chat" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_raid").setLabel("👥 Giriş").setStyle(activePage === "raid" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_limits").setLabel("⚙️ Limitler").setStyle(activePage === "limits" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_logs").setLabel("📄 Roller/Log/WL").setStyle(activePage === "logs" ? ButtonStyle.Success : ButtonStyle.Primary)
            );

            const rowMainActions = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("action_autonom").setLabel("🤖 Otonom Mod").setStyle(getSetting(guildId, "autonomousMode") ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("action_open_all").setLabel("🟢 Hepsini Aç").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("action_close_all").setLabel("🔴 Hepsini Kapat").setStyle(ButtonStyle.Danger)
            );

            const rowToggles = new ActionRowBuilder();
            if (activePage === "server") {
                rowToggles.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("toggle_server")
                        .setPlaceholder("Açmak/Kapatmak istediğiniz özelliği seçin")
                        .addOptions([
                            { label: "Anti Channel Create", value: "antiChannelCreate" },
                            { label: "Anti Channel Delete", value: "antiChannelDelete" },
                            { label: "Anti Channel Update", value: "antiChannelUpdate" },
                            { label: "Anti Role Create", value: "antiRoleCreate" },
                            { label: "Anti Role Delete", value: "antiRoleDelete" },
                            { label: "Anti Role Update", value: "antiRoleUpdate" },
                            { label: "Anti Webhook Protection", value: "antiWebhookCreate" },
                            { label: "Anti Bot Add", value: "antiBotAdd" },
                            { label: "Anti Guild Update", value: "antiGuildUpdate" }
                        ])
                );
            } else if (activePage === "chat") {
                rowToggles.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("toggle_chat")
                        .setPlaceholder("Açmak/Kapatmak istediğiniz özelliği seçin")
                        .addOptions([
                            { label: "Link Engeli", value: "linkEngel" },
                            { label: "Davet Engeli", value: "inviteEngel" },
                            { label: "Küfür Engeli", value: "kufurEngel" },
                            { label: "Argo Engeli", value: "argoEngel" },
                            { label: "Caps Lock Engeli", value: "capsEngel" },
                            { label: "Emoji Spam Engeli", value: "emojiSpamEngel" },
                            { label: "Etiket Spam Engeli", value: "mentionSpamEngel" },
                            { label: "Everyone/Here Engeli", value: "everyoneHereEngel" },
                            { label: "Tekrarlanan Mesaj Engeli", value: "duplicateEngel" }
                        ])
                );
            } else if (activePage === "raid") {
                rowToggles.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("toggle_raid")
                        .setPlaceholder("Konfigüre etmek istediğiniz özelliği seçin")
                        .addOptions([
                            { label: "Hesap Yaşı Koruması (Aç/Kapat)", value: "accountAgeGuard" },
                            { label: "Avatar Koruması (Aç/Kapat)", value: "defaultAvatarGuard" },
                            { label: "Raid Koruması (Aç/Kapat)", value: "raidGuard" },
                            { label: "Kötü İsim Koruması (Aç/Kapat)", value: "usernameRegexGuard" },
                            { label: "Butonlu Doğrulama (Aç/Kapat)", value: "buttonVerification" },
                            { label: "Otomatik Karantina (Aç/Kapat)", value: "autoQuarantine" },
                            { label: "✍️ Hesap Yaşı Sınırını Belirle (Gün)", value: "custom_age" },
                            { label: "✍️ Raid Giriş Sınırını Belirle (Kişi)", value: "custom_raid" },
                            { label: "✍️ Raid Zaman Dilimini Belirle (Saniye)", value: "custom_raid_time" }
                        ])
                );
            } else if (activePage === "limits") {
                rowToggles.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("adjust_limits")
                        .setPlaceholder("Düzenlemek istediğiniz limiti seçin")
                        .addOptions([
                            { label: "✍️ Ban Limiti Değiştir", value: "banLimit" },
                            { label: "✍️ Kick Limiti Değiştir", value: "kickLimit" },
                            { label: "✍️ Kanal Silme Limiti Değiştir", value: "channelDeleteLimit" },
                            { label: "✍️ Rol Silme Limiti Değiştir", value: "roleDeleteLimit" },
                            { label: "✍️ Rol Verme Limiti Değiştir", value: "roleGiveLimit" },
                            { label: "✍️ Zaman Dilimini Değiştir (Dakika)", value: "limitTime" }
                        ])
                );
            } else if (activePage === "logs") {
                rowToggles.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select_log_action")
                        .setPlaceholder("Rol/Log/Whitelist Konfigürasyonu Seçin")
                        .addOptions([
                            { label: "Log Kanalını Güncelle", value: "ch_log" },
                            { label: "Doğrulanmış Rolünü Güncelle", value: "role_verify" },
                            { label: "Karantina Rolünü Güncelle", value: "role_quarantine" },
                            { label: "🟢 Whitelist (Tam Yetkili) Üye Ekle", value: "wl_add" },
                            { label: "🔴 Whitelist (Tam Yetkili) Üye Çıkar", value: "wl_remove" },
                            { label: "⚙️ Özel Yetki Tanımla (Granular)", value: "wl_perms" }
                        ])
                );
            }

            const rows = [rowButtons];
            if (activePage === "main") {
                rows.push(rowMainActions);
            } else {
                rows.push(rowToggles);
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

            if (i.customId === "toggle_raid") {
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

            if (i.customId.startsWith("page_")) {
                activePage = i.customId.replace("page_", "");
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
            } else if (i.customId.startsWith("toggle_")) {
                const key = i.values[0];
                const current = getSetting(guildId, key);
                await setSetting(guildId, key, !current);
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

        // 1. Channel Create Protection
        client.on("channelCreate", async channel => {
            if (!channel.guild) return;
            const guildId = channel.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiChannelCreate")) return;

            // Non-blocking action
            const deletePromise = channel.delete("Guard | İzinsiz Kanal Oluşturma").catch(() => {});

            (async () => {
                const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelCreate);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(channel.guild, executor.id, "channel")) return;

                increaseThreat(guildId, 20, `Kanal oluşturuldu: ${channel.name}`, channel.guild);
                await deletePromise;
                await punishAdmin(channel.guild, executor, "İzinsiz Kanal Oluşturma", guildId);
            })();
        });

        // 2. Channel Delete Protection
        client.on("channelDelete", async channel => {
            if (!channel.guild) return;
            const guildId = channel.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiChannelDelete")) return;

            (async () => {
                const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelDelete);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(channel.guild, executor.id, "channel")) return;

                increaseThreat(guildId, 25, `Kanal silindi: ${channel.name}`, channel.guild);

                punishAdmin(channel.guild, executor, "İzinsiz Kanal Silme", guildId);

                // Restore channel (Preserving Category and Overwrites)
                await channel.guild.channels.create({
                    name: channel.name,
                    type: channel.type,
                    parent: channel.parentId,
                    topic: channel.topic,
                    nsfw: channel.nsfw,
                    rateLimitPerUser: channel.rateLimitPerUser,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    position: channel.position,
                    permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({
                        id: o.id,
                        allow: o.allow.toArray(),
                        deny: o.deny.toArray()
                    }))
                }).catch(() => {});
            })();
        });

        // 3. Channel Update Protection
        client.on("channelUpdate", async (oldChannel, newChannel) => {
            if (!newChannel.guild) return;
            const guildId = newChannel.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiChannelUpdate")) return;

            (async () => {
                const entry = await getAuditLogEntry(newChannel.guild, AuditLogEvent.ChannelUpdate);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(newChannel.guild, executor.id, "channel")) return;

                increaseThreat(guildId, 15, `Kanal güncellendi: ${newChannel.name}`, newChannel.guild);

                punishAdmin(newChannel.guild, executor, "İzinsiz Kanal Güncelleme", guildId);

                await newChannel.edit({
                    name: oldChannel.name,
                    topic: oldChannel.topic,
                    nsfw: oldChannel.nsfw,
                    parent: oldChannel.parentId,
                    rateLimitPerUser: oldChannel.rateLimitPerUser,
                    bitrate: oldChannel.bitrate,
                    userLimit: oldChannel.userLimit,
                    permissionOverwrites: oldChannel.permissionOverwrites.cache.map(o => ({
                        id: o.id,
                        allow: o.allow.toArray(),
                        deny: o.deny.toArray()
                    }))
                }).catch(() => {});
            })();
        });

        // 4. Role Create Protection
        client.on("roleCreate", async role => {
            if (!role.guild) return;
            const guildId = role.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleCreate")) return;

            const deletePromise = role.delete("Guard | İzinsiz Rol Oluşturma").catch(() => {});

            (async () => {
                const entry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleCreate);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(role.guild, executor.id, "role")) return;

                increaseThreat(guildId, 20, `Rol oluşturuldu: ${role.name}`, role.guild);
                await deletePromise;
                await punishAdmin(role.guild, executor, "İzinsiz Rol Oluşturma", guildId);
            })();
        });

        // 5. Role Delete Protection (Ultra Restore with Member Backup)
        client.on("roleDelete", async role => {
            if (!role.guild) return;
            const guildId = role.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleDelete")) return;

            // Fetch members before deletion from role cache
            const memberIds = role.members.map(m => m.id);

            (async () => {
                const entry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleDelete);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(role.guild, executor.id, "role")) return;

                increaseThreat(guildId, 25, `Rol silindi: ${role.name}`, role.guild);

                punishAdmin(role.guild, executor, "İzinsiz Rol Silme", guildId);

                // Restore role
                const newRole = await role.guild.roles.create({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    mentionable: role.mentionable,
                    permissions: role.permissions,
                    position: role.position
                }).catch(() => null);

                // Restore members role mapping in rate-limit safe queue
                if (newRole && memberIds.length > 0) {
                    await restoreRoleMembers(role.guild, newRole, memberIds, guildId);
                }
            })();
        });

        // 6. Role Update Protection (Dangerous Permissions safety)
        client.on("roleUpdate", async (oldRole, newRole) => {
            if (!newRole.guild) return;
            const guildId = newRole.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleUpdate")) return;

            (async () => {
                const entry = await getAuditLogEntry(newRole.guild, AuditLogEvent.RoleUpdate);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(newRole.guild, executor.id, "role")) return;

                // Check if dangerous permissions are added to a non-whitelist role
                const dangerousPerms = [
                    PermissionFlagsBits.Administrator,
                    PermissionFlagsBits.BanMembers,
                    PermissionFlagsBits.KickMembers,
                    PermissionFlagsBits.ManageGuild,
                    PermissionFlagsBits.ManageRoles,
                    PermissionFlagsBits.ManageChannels
                ];

                const hadDangerous = oldRole.permissions.has(dangerousPerms);
                const hasDangerous = newRole.permissions.has(dangerousPerms);

                const permChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
                const nameChanged = oldRole.name !== newRole.name;

                if (permChanged || nameChanged) {
                    let actionText = `Rol güncellendi: ${newRole.name}`;
                    if (hasDangerous && !hadDangerous) {
                        actionText = `Yönetici yetkileri verildi: ${newRole.name}`;
                    }

                    increaseThreat(guildId, 20, actionText, newRole.guild);
                    punishAdmin(newRole.guild, executor, "İzinsiz Rol Güncelleme", guildId);

                    await newRole.edit({
                        name: oldRole.name,
                        color: oldRole.color,
                        hoist: oldRole.hoist,
                        mentionable: oldRole.mentionable,
                        permissions: oldRole.permissions
                    }).catch(() => {});
                }
            })();
        });

        // 7. Webhook & Integration Protections
        client.on("webhookUpdate", async channel => {
            if (!channel.guild) return;
            const guildId = channel.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            (async () => {
                const logs = await channel.guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
                if (!logs) return;
                const entry = logs.entries.first();
                if (!entry || (Date.now() - entry.createdTimestamp) > 8000) return;

                let actionType = "";
                if (entry.action === AuditLogEvent.WebhookCreate && isFeatureEnabled(guildId, "antiWebhookCreate")) actionType = "Webhook Oluşturma";
                else if (entry.action === AuditLogEvent.WebhookDelete && isFeatureEnabled(guildId, "antiWebhookDelete")) actionType = "Webhook Silme";
                else if (entry.action === AuditLogEvent.WebhookUpdate && isFeatureEnabled(guildId, "antiWebhookUpdate")) actionType = "Webhook Güncelleme";

                if (!actionType) return;

                const executor = entry.executor;
                if (isWhitelisted(channel.guild, executor.id, "channel")) return;

                increaseThreat(guildId, 15, `Webhook ihlali: ${actionType}`, channel.guild);

                punishAdmin(channel.guild, executor, `İzinsiz ${actionType}`, guildId);

                if (entry.action === AuditLogEvent.WebhookCreate) {
                    const webhooks = await channel.fetchWebhooks().catch(() => null);
                    if (webhooks) {
                        const target = webhooks.first();
                        if (target) await target.delete().catch(() => {});
                    }
                }
            })();
        });

        // 8. Bot Ekleme, Karantina & Giriş Korumaları
        client.on("guildMemberAdd", async member => {
            if (!member.guild) return;
            const guildId = member.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            // Anti-Bot Ekleme
            if (member.user.bot && isFeatureEnabled(guildId, "antiBotAdd")) {
                const kickPromise = member.kick("Guard | İzinsiz Bot").catch(() => {});

                (async () => {
                    const entry = await getAuditLogEntry(member.guild, AuditLogEvent.BotAdd);
                    if (!entry) return;
                    const executor = entry.executor;
                    if (!isWhitelisted(member.guild, executor.id, "channel")) {
                        increaseThreat(guildId, 30, `Sunucuya izinsiz bot eklendi: ${member.user.tag}`, member.guild);
                        await kickPromise;
                        await punishAdmin(member.guild, executor, "İzinsiz Bot Ekleme", guildId);
                    }
                })();
            }

            // Normal Üye Girişleri
            if (!member.user.bot) {
                increaseThreat(guildId, 6, "Üye Girişi", member.guild);

                // Hesap Yaşı
                if (isFeatureEnabled(guildId, "accountAgeGuard")) {
                    const ageLimitDays = getSetting(guildId, "accountAgeLimit");
                    const createdDate = member.user.createdAt;
                    const diffDays = Math.ceil((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < ageLimitDays) {
                        increaseThreat(guildId, 12, "Yeni Hesap Katılımı", member.guild);
                        sendGuardLog(member.guild, member.user, null, `Yeni Hesap Koruması (${diffDays} günlük hesap)`, "Sunucudan Atıldı", guildId);
                        member.kick("Guard | Yeni Hesap Koruması").catch(() => {});
                        return;
                    }
                }

                // Varsayılan Avatar
                if (isFeatureEnabled(guildId, "defaultAvatarGuard") && !member.user.avatar) {
                    increaseThreat(guildId, 10, "Avatar Olmayan Hesap Katılımı", member.guild);
                    sendGuardLog(member.guild, member.user, null, "Varsayılan Avatar Koruması", "Sunucudan Atıldı", guildId);
                    member.kick("Guard | Varsayılan Avatar Koruması").catch(() => {});
                    return;
                }

                // Kötü İsim Koruması
                if (isFeatureEnabled(guildId, "usernameRegexGuard")) {
                    const badNameRegex = /(https?:\/\/|discord\.gg\/|www\.)/gi;
                    if (badNameRegex.test(member.user.username) || badNameRegex.test(member.user.displayName)) {
                        increaseThreat(guildId, 15, "Reklamlı İsim Katılımı", member.guild);
                        sendGuardLog(member.guild, member.user, null, "Profil İsim Koruması (Reklam/Link)", "Sunucudan Atıldı", guildId);
                        member.kick("Guard | Kötü Profil Adı").catch(() => {});
                        return;
                    }
                }

                // Karantina veya Doğrulama Rolü Verme
                if (isFeatureEnabled(guildId, "buttonVerification") || isFeatureEnabled(guildId, "autoQuarantine")) {
                    const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                    if (quarantineRolId) {
                        member.roles.add(quarantineRolId).catch(() => {});
                        if (isFeatureEnabled(guildId, "autoQuarantine")) {
                            sendGuardLog(member.guild, member.user, null, "Otomatik Karantina", "Karantina Rolü Verildi", guildId);
                        }
                    }
                }
            }
        });

        // 9. Sunucu Güncelleme Koruması
        client.on("guildUpdate", async (oldGuild, newGuild) => {
            if (!newGuild) return;
            const guildId = newGuild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiGuildUpdate")) return;

            (async () => {
                const entry = await getAuditLogEntry(newGuild, AuditLogEvent.GuildUpdate);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(newGuild, executor.id, "channel")) return;

                increaseThreat(guildId, 30, "Sunucu ayarları güncellendi", newGuild);

                punishAdmin(newGuild, executor, "İzinsiz Sunucu Ayarları Güncelleme", guildId);

                await newGuild.edit({
                    name: oldGuild.name,
                    icon: oldGuild.iconURL(),
                    banner: oldGuild.bannerURL(),
                    splash: oldGuild.splashURL()
                }).catch(() => {});
            })();
        });

        // 10. Audit Log Üye Yasaklama Limitleri
        client.on("guildBanAdd", async ban => {
            const guildId = ban.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            const limitMax = getSetting(guildId, "banLimit");
            const limitMinutes = getSetting(guildId, "limitTime") || 5;

            (async () => {
                const entry = await getAuditLogEntry(ban.guild, AuditLogEvent.MemberBanAdd);
                if (!entry) return;
                const executor = entry.executor;
                if (isWhitelisted(ban.guild, executor.id, "limitBypass")) return;

                const exceeded = checkRateLimit(guildId, executor.id, "banLimit", limitMax, limitMinutes);
                if (exceeded) {
                    increaseThreat(guildId, 40, `Yönetici ban limitini aştı: ${executor.tag}`, ban.guild);
                    punishAdmin(ban.guild, executor, `Yönetici Ban Limitini Aşma (Limit: ${limitMax})`, guildId);
                    await ban.guild.members.unban(ban.user.id, "Guard | Limit Aşımı Koruması").catch(() => {});
                }
            })();
        });

        // 11. Sohbet Filtreleri ve İletiler
        client.on("messageCreate", async message => {
            if (!message.guild) return;
            const guildId = message.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (message.author.bot) return;

            if (isWhitelisted(message.guild, message.author.id, "chat")) return;

            // Link & Davet Engel
            const linkRegex = /(https?:\/\/|www\.)/gi;
            const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/gi;

            let shouldDelete = false;
            let reason = "";
            let threatPoints = 0;

            if (isFeatureEnabled(guildId, "inviteEngel") && inviteRegex.test(message.content)) {
                shouldDelete = true;
                reason = "Davet Linki Paylaşımı";
                threatPoints = 12;
            } else if (isFeatureEnabled(guildId, "linkEngel") && linkRegex.test(message.content)) {
                shouldDelete = true;
                reason = "Link Paylaşımı";
                threatPoints = 8;
            }

            // Küfür & Argo Filtreleri
            const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
            const argolar = ["lan", "gerizekalı", "aptal", "salak"];

            if (!shouldDelete && isFeatureEnabled(guildId, "kufurEngel")) {
                const words = message.content.toLowerCase().split(/\s+/);
                if (words.some(w => kufurler.includes(w))) {
                    shouldDelete = true;
                    reason = "Küfürlü İleti";
                    threatPoints = 5;
                }
            }

            if (!shouldDelete && isFeatureEnabled(guildId, "argoEngel")) {
                const words = message.content.toLowerCase().split(/\s+/);
                if (words.some(w => argolar.includes(w))) {
                    shouldDelete = true;
                    reason = "Argo İleti";
                    threatPoints = 3;
                }
            }

            // Caps Lock Engeli (>70% uppercase)
            if (!shouldDelete && isFeatureEnabled(guildId, "capsEngel") && message.content.length > 5) {
                const upperCount = message.content.replace(/[^A-ZĞÜŞİÖÇ]/g, "").length;
                if ((upperCount / message.content.length) > 0.7) {
                    shouldDelete = true;
                    reason = "Aşırı Büyük Harf (Caps Lock)";
                    threatPoints = 3;
                }
            }

            // Etiket Spami
            if (!shouldDelete && isFeatureEnabled(guildId, "mentionSpamEngel")) {
                const mentions = message.mentions.users.size + message.mentions.roles.size;
                if (mentions > 4) {
                    shouldDelete = true;
                    reason = "Etiket Spami";
                    threatPoints = 10;
                }
            }

            // Emoji Spami
            if (!shouldDelete && isFeatureEnabled(guildId, "emojiSpamEngel")) {
                const emojiRegex = /<a?:.+?:\d+>|[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g;
                const emojis = message.content.match(emojiRegex);
                if (emojis && emojis.length > 5) {
                    shouldDelete = true;
                    reason = "Emoji Spami";
                    threatPoints = 4;
                }
            }

            // Everyone / Here Engeli
            if (!shouldDelete && isFeatureEnabled(guildId, "everyoneHereEngel") && (message.content.includes("@everyone") || message.content.includes("@here"))) {
                if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
                    shouldDelete = true;
                    reason = "Yetkisiz Everyone/Here Etiketi";
                    threatPoints = 15;
                }
            }

            if (shouldDelete) {
                increaseThreat(guildId, threatPoints, reason, message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **${reason}** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | ${reason}`).catch(() => {});
            }
        });
    }
};
