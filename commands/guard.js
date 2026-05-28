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
    webhookSpamEngel: false,
    webhookTokenLeakGuard: false,
    webhookNameFilter: false,
    webhookChannelLock: false,
    webhookAvatarLock: false,
    webhookLimitPerChannel: false,
    webhookWhitelistOnly: false,
    webhookImpersonationGuard: false,
    webhookLinkEngel: false,
    webhookKufurEngel: false,
    webhookEveryoneEngel: false,
    webhookAutonomousLock: false,
    webhookMessageEditMonitor: false,
    webhookIpBanList: false,
    webhookAttachmentGuard: false,
    webhookContentLengthLimit: false,
    webhookEmbedSpamGuard: false,
    webhookThreadPostGuard: false,
    webhookRoleMentionGuard: false,

    antiEmojiCreate: false,
    antiEmojiDelete: false,
    antiEmojiUpdate: false,
    antiStickerCreate: false,
    antiStickerDelete: false,
    antiStickerUpdate: false,
    antiGuildUpdate: false,
    antiBotAdd: false,
    antiBotLimitAdd: false,
    antiBotRequireVerify: false,
    antiBotLockdown: false,
    antiBotBlockUnverified: false,
    antiBotLimitPermissions: false,
    antiBotRestrictRoles: false,
    antiBotQuarantine: false,
    antiBotActionKickAddExecutor: false,
    antiBotActionBanAddExecutor: false,
    antiBotLogAddedDetails: false,
    antiBotCheckCreationDate: false,
    antiBotBlockPublicBots: false,
    antiBotScanCommandNameSpam: false,
    antiBotAuditLogCompare: false,
    antiBotAutonomousBypass: false,
    antiBotAdminRoleAlert: false,
    antiBotBlockTokenLeaks: false,
    antiBotChannelRestriction: false,
    antiBotIntegrityLogs: false,
    antiIntegrationCreate: false,
    antiPrune: false,
    antiGuildNameUpdate: false,
    antiGuildIconUpdate: false,
    antiGuildBannerUpdate: false,
    antiGuildSplashUpdate: false,
    antiGuildVerificationLevelUpdate: false,
    antiGuildContentFilterUpdate: false,
    antiGuildWidgetUpdate: false,
    antiGuildSystemChannelUpdate: false,
    antiGuildRulesChannelUpdate: false,
    antiGuildUpdatesChannelUpdate: false,
    antiGuildMfaLevelUpdate: false,
    antiGuildVanityUrlUpdate: false,
    antiGuildFeatureRevertLock: false,
    antiGuildActionOwnerAlert: false,

    antiPruneBlockAll: false,
    antiPruneLimitDays: false,
    antiPruneMinRoles: false,
    antiPruneActionBanExecutor: false,
    antiPruneActionKickExecutor: false,
    antiPruneActionStripRoles: false,
    antiPruneLockdownOnPrune: false,
    antiPruneThreatMax: false,
    antiPruneOwnerNotification: false,
    antiPruneLogStaff: false,
    antiPruneRoleRecoveryTracker: false,
    antiPruneTimeLimit: false,
    antiPruneAuditDoubleCheck: false,
    antiPruneIntegrityQuarantine: false,

    spamBlockAll: false,
    spamDuplicateLimit: false,
    spamMaxMessages: false,
    spamMinTimeBetweenMessages: false,
    spamCapsPercentage: false,
    spamMaxEmojis: false,
    spamMaxMentions: false,
    spamMaxLines: false,
    spamMaxLength: false,
    spamRoleMentions: false,
    spamFastReact: false,
    spamLinkCount: false,
    spamActionDelete: false,
    spamActionWarn: false,
    spamActionMute: false,
    spamActionKick: false,
    spamActionBan: false,
    spamActionStaffLog: false,
    spamAllowStaff: false,
    spamBypassChannels: false,

    // Category 2: Chat & Content Security
    linkBlockAll: false,
    linkBlockInvites: false,
    linkBlockHttpsOnly: false,
    linkBlockHttpOnly: false,
    linkBlockIPLinks: false,
    linkBlockSubdomains: false,
    linkBlockShorteners: false,
    linkBlockPhishing: false,
    linkBlockIpLoggers: false,
    linkBlockAdultContent: false,
    linkBlockDownloads: false,
    linkBlockMalware: false,
    linkBlockSocialMedia: false,
    linkBlockVideoSites: false,
    linkBlockCryptocurrency: false,
    linkBlockFileSharing: false,
    linkBlockCustomBlacklist: false,
    linkBlockBypassPatterns: false,
    linkBlockNonStandardTLDs: false,
    linkBlockRichEmbedUrls: false,
    linkAllowDiscordOfficial: false,
    linkAllowYoutubeOfficial: false,
    linkAllowSpotifyOfficial: false,
    linkAllowGithubOfficial: false,
    linkAllowGoogleOfficial: false,
    linkAllowImagesOnly: false,
    linkAllowCustomWhitelist: false,
    linkScanStatusChecks: false,
    linkScanRedirectLimit: false,
    linkScanContentMinimizer: false,
    linkScanCapsRatio: false,
    linkScanLengthLimit: false,
    linkScanChannelWhitelist: false,
    linkScanRoleWhitelist: false,
    linkActionDelete: false,
    linkActionWarn: false,
    linkActionTimeout: false,
    linkActionKick: false,
    linkActionBan: false,
    linkActionStaffLog: false,
    kufurBlockAll: false,
    kufurBlockFamily: false,
    kufurBlockSexual: false,
    kufurBlockReligious: false,
    kufurBlockRacist: false,
    kufurBlockPolitical: false,
    kufurBlockArgo: false,
    kufurBlockAbbreviations: false,
    kufurBlockHomophobic: false,
    kufurBlockSpamInsults: false,
    kufurBlockThreats: false,
    kufurBlockAdmins: false,
    kufurBlockForeign: false,
    kufurBlockPhonetic: false,
    kufurBlockSpaced: false,
    kufurBlockHomoglyphs: false,
    kufurBlockCustomBlacklist: false,
    kufurBlockEmojis: false,
    kufurBlockNicknames: false,
    kufurBlockRichEmbedTexts: false,
    kufurAllowWhitelistedChannels: false,
    kufurAllowStaff: false,
    kufurAllowSelfCorrect: false,
    kufurAllowQuotes: false,
    kufurAllowCustomWhitelist: false,
    kufurAllowRoleWhitelist: false,
    kufurAllowAutonomousBypass: false,
    kufurScanLevensthein: false,
    kufurScanRegexBypass: false,
    kufurScanCapsInsult: false,
    kufurScanZalgo: false,
    kufurScanLengthRatio: false,
    kufurScanSpoilers: false,
    kufurScanAttachments: false,
    kufurActionDelete: false,
    kufurActionWarn: false,
    kufurActionMute: false,
    kufurActionKick: false,
    kufurActionBan: false,
    kufurActionStaffLog: false,
    argoEngel: false,
    capsEngel: false,
    emojiSpamEngel: false,
    mentionSpamEngel: false,
    everyoneHereEngel: false,
    mediaSpamEngel: false,
    selfBotEngel: false,


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
    "webhookSpamEngel", "webhookTokenLeakGuard", "webhookNameFilter",
    "webhookChannelLock", "webhookAvatarLock", "webhookLimitPerChannel",
    "webhookWhitelistOnly", "webhookImpersonationGuard", "webhookLinkEngel",
    "webhookKufurEngel", "webhookEveryoneEngel", "webhookAutonomousLock",
    "webhookMessageEditMonitor", "webhookIpBanList", "webhookAttachmentGuard",
    "webhookContentLengthLimit", "webhookEmbedSpamGuard", "webhookThreadPostGuard",
    "webhookRoleMentionGuard",
    "antiEmojiCreate", "antiEmojiDelete", "antiEmojiUpdate",
    "antiStickerCreate", "antiStickerDelete", "antiStickerUpdate",
    "antiGuildUpdate", "antiBotAdd", "antiBotLimitAdd", "antiBotRequireVerify", "antiBotLockdown",
    "antiBotBlockUnverified", "antiBotLimitPermissions", "antiBotRestrictRoles", "antiBotQuarantine",
    "antiBotActionKickAddExecutor", "antiBotActionBanAddExecutor", "antiBotLogAddedDetails", "antiBotCheckCreationDate",
    "antiBotBlockPublicBots", "antiBotScanCommandNameSpam", "antiBotAuditLogCompare", "antiBotAutonomousBypass",
    "antiBotAdminRoleAlert", "antiBotBlockTokenLeaks", "antiBotChannelRestriction", "antiBotIntegrityLogs",
    "antiIntegrationCreate", "antiPrune",
    "antiGuildNameUpdate", "antiGuildIconUpdate", "antiGuildBannerUpdate", "antiGuildSplashUpdate",
    "antiGuildVerificationLevelUpdate", "antiGuildContentFilterUpdate", "antiGuildWidgetUpdate", "antiGuildSystemChannelUpdate",
    "antiGuildRulesChannelUpdate", "antiGuildUpdatesChannelUpdate", "antiGuildMfaLevelUpdate", "antiGuildVanityUrlUpdate",
    "antiGuildFeatureRevertLock", "antiGuildActionOwnerAlert",
    "antiPruneBlockAll", "antiPruneLimitDays", "antiPruneMinRoles", "antiPruneActionBanExecutor",
    "antiPruneActionKickExecutor", "antiPruneActionStripRoles", "antiPruneLockdownOnPrune", "antiPruneThreatMax",
    "antiPruneOwnerNotification", "antiPruneLogStaff", "antiPruneRoleRecoveryTracker", "antiPruneTimeLimit",
    "antiPruneAuditDoubleCheck", "antiPruneIntegrityQuarantine",
    "spamBlockAll", "spamDuplicateLimit", "spamMaxMessages", "spamMinTimeBetweenMessages",
    "spamCapsPercentage", "spamMaxEmojis", "spamMaxMentions", "spamMaxLines",
    "spamMaxLength", "spamRoleMentions", "spamFastReact", "spamLinkCount",
    "spamActionDelete", "spamActionWarn", "spamActionMute", "spamActionKick",
    "spamActionBan", "spamActionStaffLog", "spamAllowStaff", "spamBypassChannels",
    "linkBlockAll", "linkBlockInvites", "linkBlockHttpsOnly", "linkBlockHttpOnly",
    "linkBlockIPLinks", "linkBlockSubdomains", "linkBlockShorteners", "linkBlockPhishing",
    "linkBlockIpLoggers", "linkBlockAdultContent", "linkBlockDownloads", "linkBlockMalware",
    "linkBlockSocialMedia", "linkBlockVideoSites", "linkBlockCryptocurrency", "linkBlockFileSharing",
    "linkBlockCustomBlacklist", "linkBlockBypassPatterns", "linkBlockNonStandardTLDs", "linkBlockRichEmbedUrls",
    "linkAllowDiscordOfficial", "linkAllowYoutubeOfficial", "linkAllowSpotifyOfficial", "linkAllowGithubOfficial",
    "linkAllowGoogleOfficial", "linkAllowImagesOnly", "linkAllowCustomWhitelist", "linkScanStatusChecks",
    "linkScanRedirectLimit", "linkScanContentMinimizer", "linkScanCapsRatio", "linkScanLengthLimit",
    "linkScanChannelWhitelist", "linkScanRoleWhitelist", "linkActionDelete", "linkActionWarn",
    "linkActionTimeout", "linkActionKick", "linkActionBan", "linkActionStaffLog",
    "kufurBlockAll", "kufurBlockFamily", "kufurBlockSexual", "kufurBlockReligious",
    "kufurBlockRacist", "kufurBlockPolitical", "kufurBlockArgo", "kufurBlockAbbreviations",
    "kufurBlockHomophobic", "kufurBlockSpamInsults", "kufurBlockThreats", "kufurBlockAdmins",
    "kufurBlockForeign", "kufurBlockPhonetic", "kufurBlockSpaced", "kufurBlockHomoglyphs",
    "kufurBlockCustomBlacklist", "kufurBlockEmojis", "kufurBlockNicknames", "kufurBlockRichEmbedTexts",
    "kufurAllowWhitelistedChannels", "kufurAllowStaff", "kufurAllowSelfCorrect", "kufurAllowQuotes",
    "kufurAllowCustomWhitelist", "kufurAllowRoleWhitelist", "kufurAllowAutonomousBypass", "kufurScanLevensthein",
    "kufurScanRegexBypass", "kufurScanCapsInsult", "kufurScanZalgo", "kufurScanLengthRatio",
    "kufurScanSpoilers", "kufurScanAttachments", "kufurActionDelete", "kufurActionWarn",
    "kufurActionMute", "kufurActionKick", "kufurActionBan", "kufurActionStaffLog",
    "argoEngel", "capsEngel",
    "emojiSpamEngel", "mentionSpamEngel", "everyoneHereEngel", "mediaSpamEngel",
    "selfBotEngel",
    "accountAgeGuard", "defaultAvatarGuard", "raidGuard", "usernameRegexGuard",
    "buttonVerification", "autoQuarantine"
];

function getSetting(guildId, key) {
    const settings = global.guardSettings.get(guildId) || {};
    // Configuration Migrations
    if (key === "linkBlockAll" && settings.linkBlockAll === undefined && settings.linkEngel !== undefined) {
        settings.linkBlockAll = settings.linkEngel;
    }
    if (key === "linkBlockInvites" && settings.linkBlockInvites === undefined && settings.inviteEngel !== undefined) {
        settings.linkBlockInvites = settings.inviteEngel;
    }
    if (key === "kufurBlockAll" && settings.kufurBlockAll === undefined && settings.kufurEngel !== undefined) {
        settings.kufurBlockAll = settings.kufurEngel;
    }
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
                "linkBlockAll", "linkBlockInvites", "everyoneHereEngel", "autoQuarantine"
            ].includes(featureKey)) {
                return true;
            }
        }

        // Level 2 (Suspicious Activity): > 35
        if (threat >= 35) {
            if ([
                "linkBlockAll", "linkBlockInvites", "kufurBlockAll", "argoEngel",
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
• **Anti-Bot Koruması**      :: \`[/guard -> Anti-Bot Koruması (20 Özellik)]\`
• **Sunucu Ayarları Koruması**:: \`[/guard -> Sunucu Ayarları (15 Özellik)]\`
• **Prune / Budama Koruması**:: \`[/guard -> Budama Koruması (15 Özellik)]\`

**« WEBHOOK KORUMALARI (22 ÖZELLİK) »**
• **Webhook Oluşturma**      :: ${statusEmoji("antiWebhookCreate")}
• **Webhook Güncelleme**      :: ${statusEmoji("antiWebhookUpdate")}
• **Webhook Silme**           :: ${statusEmoji("antiWebhookDelete")}
• **Mesaj Spami Engeli**      :: ${statusEmoji("webhookSpamEngel")}
• **Token Sızıntı Koruması**  :: ${statusEmoji("webhookTokenLeakGuard")}
• **İsim Filtresi**           :: ${statusEmoji("webhookNameFilter")}
• **Kanal Kilidi**            :: ${statusEmoji("webhookChannelLock")}
• **Avatar Kilidi**           :: ${statusEmoji("webhookAvatarLock")}
• **Kanal Başı Limit**        :: ${statusEmoji("webhookLimitPerChannel")}
• **Yalnızca Güvenli Liste**  :: ${statusEmoji("webhookWhitelistOnly")}
• **Taklit (İmmitasyon) Engeli**:: ${statusEmoji("webhookImpersonationGuard")}
• **Link Engeli**             :: ${statusEmoji("webhookLinkEngel")}
• **Küfür Engeli**            :: ${statusEmoji("webhookKufurEngel")}
• **Everyone Engeli**         :: ${statusEmoji("webhookEveryoneEngel")}
• **Otonom Kilit**            :: ${statusEmoji("webhookAutonomousLock")}
• **Düzenleme Takibi**        :: ${statusEmoji("webhookMessageEditMonitor")}
• **Şüpheli Link/IP Engeli**   :: ${statusEmoji("webhookIpBanList")}
• **Zararlı Ek Koruması**     :: ${statusEmoji("webhookAttachmentGuard")}
• **Karakter Sınırı**         :: ${statusEmoji("webhookContentLengthLimit")}
• **Embed İstismar Engeli**   :: ${statusEmoji("webhookEmbedSpamGuard")}
• **Başlık Koruması**         :: ${statusEmoji("webhookThreadPostGuard")}
• **Rol Etiket Engeli**       :: ${statusEmoji("webhookRoleMentionGuard")}
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
• **Argo Sözcük Engeli (Basit Motor)** :: ${statusEmoji("argoEngel")}

**« BİÇİM FİLTRELERİ »**
• **Büyük Harf (Caps Lock)**   :: ${statusEmoji("capsEngel")} \`[>%70 Oran]\`

**« İÇERİK KORUMALARI »**
• **Mass Tag (@everyone)**     :: ${statusEmoji("everyoneHereEngel")}
• **Medya Spami Engeli**       :: ${statusEmoji("mediaSpamEngel")}
${divider}
*Emoji, etiket, tekrar, satır ve karakter sınırları artık **Spam Engel** modülünde yönetilmektedir. İstediğiniz sohbet filtresini açıp kapatmak için aşağıdaki menüyü kullanın.*`);
            }

            if (activePage === "links") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🔗 Link Engel Koruması (40 Özellik)")
                    .setDescription(`
${divider}
**« LİNK ENGELLERİ (TÜRLER VE BLACKLIST) »**
• **Genel Engel**            :: ${statusEmoji("linkBlockAll")}
• **Davet Kodu Engeli**       :: ${statusEmoji("linkBlockInvites")}
• **Https Bağlantı Engeli**   :: ${statusEmoji("linkBlockHttpsOnly")}
• **Http Bağlantı Engeli**    :: ${statusEmoji("linkBlockHttpOnly")}
• **IP Adresi Engeli**        :: ${statusEmoji("linkBlockIPLinks")}
• **Alt Alan Adı (Subdomain)**:: ${statusEmoji("linkBlockSubdomains")}
• **Kısaltıcı Servis Engeli** :: ${statusEmoji("linkBlockShorteners")}
• **Phishing (Oltalama)**     :: ${statusEmoji("linkBlockPhishing")}
• **IP Logger Koruması**      :: ${statusEmoji("linkBlockIpLoggers")}
• **Yetişkin İçerik Engeli**  :: ${statusEmoji("linkBlockAdultContent")}
• **Dosya İndirme Engeli**    :: ${statusEmoji("linkBlockDownloads")}
• **Zararlı Yazılım (Malware)**:: ${statusEmoji("linkBlockMalware")}
• **Sosyal Medya Engeli**     :: ${statusEmoji("linkBlockSocialMedia")}
• **Video Siteleri Engeli**   :: ${statusEmoji("linkBlockVideoSites")}
• **Kripto Siteleri Engeli**  :: ${statusEmoji("linkBlockCryptocurrency")}
• **Dosya Paylaşım Engeli**   :: ${statusEmoji("linkBlockFileSharing")}
• **Özel Blacklist Engeli**   :: ${statusEmoji("linkBlockCustomBlacklist")}
• **Homoglif/Bypass Engeli**  :: ${statusEmoji("linkBlockBypassPatterns")}
• **Ucuz/Şüpheli TLD Engeli**  :: ${statusEmoji("linkBlockNonStandardTLDs")}
• **Kullanıcı Embed Linki**   :: ${statusEmoji("linkBlockRichEmbedUrls")}

**« MUAFİYETLER, TARAMA VE CEZALANDIRMALAR »**
• **Discord Resmi Muafiyeti** :: ${statusEmoji("linkAllowDiscordOfficial")}
• **YouTube Muafiyeti**       :: ${statusEmoji("linkAllowYoutubeOfficial")}
• **Spotify Muafiyeti**       :: ${statusEmoji("linkAllowSpotifyOfficial")}
• **GitHub Muafiyeti**        :: ${statusEmoji("linkAllowGithubOfficial")}
• **Google Muafiyeti**        :: ${statusEmoji("linkAllowGoogleOfficial")}
• **Görsel Linki Muafiyeti**  :: ${statusEmoji("linkAllowImagesOnly")}
• **Özel Whitelist Muafiyeti**:: ${statusEmoji("linkAllowCustomWhitelist")}
• **Link Durum Kontrolü**     :: ${statusEmoji("linkScanStatusChecks")}
• **Yönlendirme Sınırı**      :: ${statusEmoji("linkScanRedirectLimit")}
• **Kısaltılmış Link Analizi** :: ${statusEmoji("linkScanContentMinimizer")}
• **Rastgelelik (Caps) Oranı**:: ${statusEmoji("linkScanCapsRatio")}
• **Karakter Sınırı Engeli**   :: ${statusEmoji("linkScanLengthLimit")}
• **Kanal Muafiyetleri**      :: ${statusEmoji("linkScanChannelWhitelist")}
• **Rol Muafiyetleri**        :: ${statusEmoji("linkScanRoleWhitelist")}
• **Mesajı Silme Cezası**     :: ${statusEmoji("linkActionDelete")}
• **Uyarı Gönderme Cezası**   :: ${statusEmoji("linkActionWarn")}
• **Susturma Cezası**         :: ${statusEmoji("linkActionTimeout")}
• **Sunucudan Atma Cezası**   :: ${statusEmoji("linkActionKick")}
• **Sunucudan Yasaklama**     :: ${statusEmoji("linkActionBan")}
• **Yetkili Log Bildirimi**   :: ${statusEmoji("linkActionStaffLog")}
${divider}
*İstediğiniz link engelleme filtresini veya tarama davranışını yapılandırmak için aşağıdaki açılır menüleri kullanın.*`);
            }

            if (activePage === "kufur") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🤬 Küfür Engel Koruması (40 Özellik)")
                    .setDescription(`
${divider}
**« KÜFÜR FİLTRELERİ VE KATEGORİLER »**
• **Genel Engel**            :: ${statusEmoji("kufurBlockAll")}
• **Ailevi Hakaret Engeli**   :: ${statusEmoji("kufurBlockFamily")}
• **Cinsel İçerik Engeli**    :: ${statusEmoji("kufurBlockSexual")}
• **Dini Değerlere Küfür**    :: ${statusEmoji("kufurBlockReligious")}
• **Irkçı Hakaret Engeli**    :: ${statusEmoji("kufurBlockRacist")}
• **Siyasi Taciz Engeli**     :: ${statusEmoji("kufurBlockPolitical")}
• **Argo Sözcük Engeli (Gelişmiş Motor)** :: ${statusEmoji("kufurBlockArgo")}
• **Kısaltmalar Koruması**    :: ${statusEmoji("kufurBlockAbbreviations")}
• **Cinsiyetçi Taciz Engeli** :: ${statusEmoji("kufurBlockHomophobic")}
• **Hakaret Spami Engeli**    :: ${statusEmoji("kufurBlockSpamInsults")}
• **Şiddet / Tehdit Engeli**  :: ${statusEmoji("kufurBlockThreats")}
• **Yetkiliye Hakaret Engeli**:: ${statusEmoji("kufurBlockAdmins")}
• **Yabancı Dil Küfürler**    :: ${statusEmoji("kufurBlockForeign")}
• **Fonetik Karakter Engeli** :: ${statusEmoji("kufurBlockPhonetic")}
• **Boşluklu Yazım Engeli**   :: ${statusEmoji("kufurBlockSpaced")}
• **Homoglif/Bypass Engeli**  :: ${statusEmoji("kufurBlockHomoglyphs")}
• **Özel Blacklist Engeli**   :: ${statusEmoji("kufurBlockCustomBlacklist")}
• **Uygunsuz Emoji İsimleri** :: ${statusEmoji("kufurBlockEmojis")}
• **Kullanıcı İsmi Koruması** :: ${statusEmoji("kufurBlockNicknames")}
• **Kullanıcı Embed Metinleri**:: ${statusEmoji("kufurBlockRichEmbedTexts")}

**« MUAFİYETLER, TARAMA VE CEZALANDIRMALAR »**
• **Kanal Muafiyetleri**      :: ${statusEmoji("kufurAllowWhitelistedChannels")}
• **Yetkili Muafiyeti**       :: ${statusEmoji("kufurAllowStaff")}
• **Hatalı Yazım Düzeltme**   :: ${statusEmoji("kufurAllowSelfCorrect")}
• **Alıntı Küfür İzni**       :: ${statusEmoji("kufurAllowQuotes")}
• **Özel Kelime Whitelisti**  :: ${statusEmoji("kufurAllowCustomWhitelist")}
• **Rol Muafiyetleri**        :: ${statusEmoji("kufurAllowRoleWhitelist")}
• **Otonom Susturma Bypassı** :: ${statusEmoji("kufurAllowAutonomousBypass")}
• **Levensthein (Yakınlık)**  :: ${statusEmoji("kufurScanLevensthein")}
• **Gelişmiş Regex Taraması** :: ${statusEmoji("kufurScanRegexBypass")}
• **Büyük Harfli Küfür Filtresi**:: ${statusEmoji("kufurScanCapsInsult")}
• **Zalgo/Bozuk Harf Filtresi**:: ${statusEmoji("kufurScanZalgo")}
• **Yoğunluk Sınırı Engeli**  :: ${statusEmoji("kufurScanLengthRatio")}
• **Spoiler İçerik Koruması** :: ${statusEmoji("kufurScanSpoilers")}
• **Dosya Adı Koruması**      :: ${statusEmoji("kufurScanAttachments")}
• **Mesajı Silme Cezası**     :: ${statusEmoji("kufurActionDelete")}
• **Kullanıcıyı Uyarma**      :: ${statusEmoji("kufurActionWarn")}
• **Susturma (Mute) Cezası**  :: ${statusEmoji("kufurActionMute")}
• **Sunucudan Atma (Kick)**   :: ${statusEmoji("kufurActionKick")}
• **Sunucudan Yasaklama**     :: ${statusEmoji("kufurActionBan")}
• **Yetkili Log Bildirimi**   :: ${statusEmoji("kufurActionStaffLog")}
${divider}
*İstediğiniz küfür/hakaret filtresini veya tarama davranışını yapılandırmak için aşağıdaki açılır menüleri kullanın.*`);
            }

            if (activePage === "antibot") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🤖 Anti-Bot Koruması (20 Özellik)")
                    .setDescription(`
${divider}
**« SİSTEM KİLİTLERİ VE FİLTRELER »**
• **Genel Engel**            :: ${statusEmoji("antiBotAdd")}
• **Yeni Bot Limit Sınırı**   :: ${statusEmoji("antiBotLimitAdd")} \`[Maks 1 Bot / Saat]\`
• **Bot Onaylama İzni**      :: ${statusEmoji("antiBotRequireVerify")}
• **Tam Karantina Kilidi**    :: ${statusEmoji("antiBotLockdown")}
• **Doğrulanmamış Bot Engeli**:: ${statusEmoji("antiBotBlockUnverified")}
• **Özel Bot Filtresi**       :: ${statusEmoji("antiBotBlockPublicBots")}
• **Yeni Bot Yaş Sınırı**     :: ${statusEmoji("antiBotCheckCreationDate")} \`[Maks 15 Günlük]\`
• **Şüpheli Komut Taraması**  :: ${statusEmoji("antiBotScanCommandNameSpam")}

**« YETKİ VE ROL SINIRLANDIRMALARI »**
• **Yetki Temizleme Modu**    :: ${statusEmoji("antiBotLimitPermissions")} \`[Yönetici İzni Siler]\`
• **Rol Verme Engeli**        :: ${statusEmoji("antiBotRestrictRoles")} \`[Yetkili Rol Alamaz]\`
• **Karantina Kanalı**        :: ${statusEmoji("antiBotQuarantine")}
• **Sunucu Kanalları Kilidi** :: ${statusEmoji("antiBotChannelRestriction")} \`[Sadece Test Kanalı]\`
• **Rol Verme Bildirimi**     :: ${statusEmoji("antiBotAdminRoleAlert")} \`[Sahibe DM Bildirimi]\`
• **İstikrar Denetimi**       :: ${statusEmoji("antiBotIntegrityLogs")} \`[24 Saat Takip]\`

**« DENETİM VE CEZALANDIRMALAR »**
• **Ekleyeni Sunucudan At**    :: ${statusEmoji("antiBotActionKickAddExecutor")}
• **Ekleyeni Sunucudan Banla** :: ${statusEmoji("antiBotActionBanAddExecutor")}
• **Gelişmiş Detay Günlüğü**  :: ${statusEmoji("antiBotLogAddedDetails")}
• **Çift Denetim Modu**       :: ${statusEmoji("antiBotAuditLogCompare")}
• **Otonom Susturma Bypassı** :: ${statusEmoji("antiBotAutonomousBypass")}
• **Token Sızıntı Koruması**  :: ${statusEmoji("antiBotBlockTokenLeaks")}
${divider}
*İstediğiniz anti-bot korumasını veya denetim davranışını yapılandırmak için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "guild") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🖥️ Sunucu Ayarları Koruması (15 Özellik)")
                    .setDescription(`
${divider}
**« TEMEL GÖRSEL KİLİTLERİ »**
• **Genel Engel**            :: ${statusEmoji("antiGuildUpdate")}
• **Sunucu İsmi Koruması**    :: ${statusEmoji("antiGuildNameUpdate")}
• **Sunucu İkon Koruması**    :: ${statusEmoji("antiGuildIconUpdate")}
• **Banner Resmi Koruması**   :: ${statusEmoji("antiGuildBannerUpdate")}
• **Giriş Resmi Koruması**    :: ${statusEmoji("antiGuildSplashUpdate")}

**« GÜVENLİK VE DENETİM DÜZEYLERİ »**
• **Doğrulama Düzeyi Koruması**:: ${statusEmoji("antiGuildVerificationLevelUpdate")}
• **Medya Filtresi Koruması** :: ${statusEmoji("antiGuildContentFilterUpdate")}
• **Sunucu Widget Koruması**  :: ${statusEmoji("antiGuildWidgetUpdate")}
• **MFA İki Faktör Kilidi**   :: ${statusEmoji("antiGuildMfaLevelUpdate")}

**« KANALLAR VE ÖZEL URL KORUMALARI »**
• **Sistem Kanalı Koruması**  :: ${statusEmoji("antiGuildSystemChannelUpdate")}
• **Kurallar Kanalı Koruması**:: ${statusEmoji("antiGuildRulesChannelUpdate")}
• **Güncellemeler Kanalı**    :: ${statusEmoji("antiGuildUpdatesChannelUpdate")}
• **Özel Davet URL Koruması** :: ${statusEmoji("antiGuildVanityUrlUpdate")} \`[Vanity Hijacking Engeli]\`

**« KİLİTLEME VE BİLDİRİMLER »**
• **Çoklu Değişim Kilidi**    :: ${statusEmoji("antiGuildFeatureRevertLock")} \`[Maks 3 Eylem / 5 Sn]\`
• **Detaylı Sahip Bildirimi** :: ${statusEmoji("antiGuildActionOwnerAlert")} \`[Sahibe DM Gönderir]\`
${divider}
*Sunucu ayarlarını korumak ve izinsiz değişiklikleri geri döndürmek için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "prune") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle(" Budama & Prune Koruması (15 Özellik)")
                    .setDescription(`
${divider}
**« SİSTEM KİLİTLERİ VE FİLTRELER »**
• **Genel Engel**            :: ${statusEmoji("antiPrune")}
• **Prune İşlemi Bloklama**   :: ${statusEmoji("antiPruneBlockAll")}
• **Budama Gün Sınırı**       :: ${statusEmoji("antiPruneLimitDays")} \`[Maks 30 Gün]\`
• **Budama Rol Filtresi**     :: ${statusEmoji("antiPruneMinRoles")} \`[Rol Seçimi Zorunlu]\`
• **Süre Kısıtlaması**        :: ${statusEmoji("antiPruneTimeLimit")} \`[Gece Saldırı Koruması]\`

**« DENETİM VE KİLİT SİSTEMLERİ »**
• **Sunucu Kanalları Kilidi** :: ${statusEmoji("antiPruneLockdownOnPrune")}
• **Tehdit Derecesi Karantina**:: ${statusEmoji("antiPruneThreatMax")} \`[Tehdit Seviyesi %100]\`
• **Karantina Alt Yetkililer**:: ${statusEmoji("antiPruneIntegrityQuarantine")} \`[Yetkilileri Dondurur]\`
• **Çift Denetim Modu**       :: ${statusEmoji("antiPruneAuditDoubleCheck")}
• **Rol Silme Bypass Taraması**:: ${statusEmoji("antiPruneRoleRecoveryTracker")}

**« CEZALANDIRMA VE BİLDİRİMLER »**
• **Ekleyeni Sunucudan At**    :: ${statusEmoji("antiPruneActionKickExecutor")}
• **Ekleyeni Sunucudan Banla** :: ${statusEmoji("antiPruneActionBanExecutor")}
• **Rolleri Temizleme Modu**  :: ${statusEmoji("antiPruneActionStripRoles")}
• **Detaylı Sahip Bildirimi** :: ${statusEmoji("antiPruneOwnerNotification")} \`[Sahibe DM Gönderir]\`
• **Gelişmiş Rapor Günlüğü**  :: ${statusEmoji("antiPruneLogStaff")}
${divider}
*Mass prune (budama) saldırılarını engellemek ve izinsiz tetikleyen yöneticileri engellemek için aşağıdaki seçim menüsünü kullanın.*`);
            }

            if (activePage === "spam") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("💬 Spam Engel Koruması (20 Özellik)")
                    .setDescription(`
${divider}
**« SİSTEM KONTROLLERİ VE SINIRLARI »**
• **Genel Engel**            :: ${statusEmoji("spamBlockAll")}
• **Tekrarlanan Mesaj Engeli** :: ${statusEmoji("spamDuplicateLimit")} \`[Maks 15 Sn]\`
• **Mesaj Hız Sınırı**        :: ${statusEmoji("spamMaxMessages")} \`[Maks 5 Mesaj / 3 Sn]\`
• **Min Mesaj Aralığı**       :: ${statusEmoji("spamMinTimeBetweenMessages")} \`[500 Ms Bekleme]\`
• **Süre Kısıtlaması (React)**:: ${statusEmoji("spamFastReact")} \`[Maks 5 Reaksiyon / 3 Sn]\`

**« BİÇİM VE METRİK FİLTRELERİ »**
• **Büyük Harf Koruması**    :: ${statusEmoji("spamCapsPercentage")} \`[>%70 Oran]\`
• **Emoji Yoğunluk Sınırı**   :: ${statusEmoji("spamMaxEmojis")} \`[Maks 5 Emoji]\`
• **Etiket Yoğunluk Sınırı**  :: ${statusEmoji("spamMaxMentions")} \`[Maks 4 Etiket]\`
• **Rol Etiket Kısıtlaması**  :: ${statusEmoji("spamRoleMentions")} \`[Maks 2 Rol]\`
• **Satır Sınırı Koruması**   :: ${statusEmoji("spamMaxLines")} \`[Maks 5 Satır]\`
• **Karakter Uzunluk Sınırı**  :: ${statusEmoji("spamMaxLength")} \`[Maks 800 Karakter]\`
• **Çoklu Link Filtresi**     :: ${statusEmoji("spamLinkCount")} \`[Maks 2 Link]\`

**« YAPTIRIMLAR VE CEZALANDIRMALAR »**
• **Mesajı Silme Cezası**     :: ${statusEmoji("spamActionDelete")}
• **Uyarı Gönderme Cezası**   :: ${statusEmoji("spamActionWarn")}
• **Susturma (Mute) Cezası**  :: ${statusEmoji("spamActionMute")} \`[5 Dakika Susturur]\`
• **Sunucudan Atma (Kick)**   :: ${statusEmoji("spamActionKick")}
• **Sunucudan Yasaklama (Ban)** :: ${statusEmoji("spamActionBan")} \`[Mass Raid Koruması]\`
• **Yetkili Rapor Bildirimi**  :: ${statusEmoji("spamActionStaffLog")}

**« MUAFİYETLER VE BÖLGELER »**
• **Yetkili Muafiyeti**       :: ${statusEmoji("spamAllowStaff")}
• **Kanal Muafiyetleri**      :: ${statusEmoji("spamBypassChannels")}
${divider}
*Spam saldırılarını engellemek ve sohbet akışını korumak için aşağıdaki seçim menüsünü kullanın.*`);
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
                        { label: "🖥️ Sunucu Ayarları (15 Özellik)", value: "page_guild", description: "Sunucu ismi, resmi, ban/vanity ayarları.", default: activePage === "guild" },
                        { label: " Prune / Budama (15 Özellik)", value: "page_prune", description: "Toplu üye budama ve engelleme limitleri.", default: activePage === "prune" },
                        { label: "💬 Sohbet & İçerik Korumaları", value: "page_chat", description: "Küfür, link ve spam engelleri.", default: activePage === "chat" },
                        { label: "🔗 Link Engel Koruması (40 Özellik)", value: "page_links", description: "Link türleri, muafiyetler ve cezalar.", default: activePage === "links" },
                        { label: "🤬 Küfür Engel Koruması (40 Özellik)", value: "page_kufur", description: "Küfür, hakaret ve bypass engelleri.", default: activePage === "kufur" },
                        { label: "💬 Spam Engel Koruması (20 Özellik)", value: "page_spam", description: "Mesaj hızı, tekrarlı mesaj, emoji ve harf engeli.", default: activePage === "spam" },
                        { label: "🤖 Anti-Bot Koruması (20 Özellik)", value: "page_antibot", description: "Bot engelleme, izin sınırları ve denetim.", default: activePage === "antibot" },
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
                    .setMaxValues(12)
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

                const selectWebhooks = new StringSelectMenuBuilder()
                    .setCustomId("toggle_webhooks")
                    .setPlaceholder("⚡ Webhook Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(22)
                    .addOptions([
                        { label: "Webhook Oluşturma Engeli", value: "antiWebhookCreate", description: "İzinsiz webhook açılmasını engeller & siler.", default: getSetting(guildId, "antiWebhookCreate") },
                        { label: "Webhook Güncelleme Engeli", value: "antiWebhookUpdate", description: "Webhook ayarlarının değiştirilmesini engeller & geri döndürür.", default: getSetting(guildId, "antiWebhookUpdate") },
                        { label: "Webhook Silme Engeli", value: "antiWebhookDelete", description: "Silinen webhookları otomatik olarak geri açar.", default: getSetting(guildId, "antiWebhookDelete") },
                        { label: "Mesaj Spami Engeli", value: "webhookSpamEngel", description: "Webhook hızlı mesaj spamlerini siler & durdurur.", default: getSetting(guildId, "webhookSpamEngel") },
                        { label: "Token Sızıntı Koruması", value: "webhookTokenLeakGuard", description: "Leaked webhook tokenlarını discorddan silerek iptal eder.", default: getSetting(guildId, "webhookTokenLeakGuard") },
                        { label: "İsim Filtresi", value: "webhookNameFilter", description: "Webhook isimlerindeki küfür/reklamları engeller.", default: getSetting(guildId, "webhookNameFilter") },
                        { label: "Kanal Kilidi", value: "webhookChannelLock", description: "Webhookların farklı kanallarda paylaşım yapmasını engeller.", default: getSetting(guildId, "webhookChannelLock") },
                        { label: "Avatar Kilidi", value: "webhookAvatarLock", description: "Boş avatar veya avatar değişimlerini engeller.", default: getSetting(guildId, "webhookAvatarLock") },
                        { label: "Kanal Başı Limit", value: "webhookLimitPerChannel", description: "Kanal başına webhook sınırını aşanları siler.", default: getSetting(guildId, "webhookLimitPerChannel") },
                        { label: "Yalnızca Güvenli Liste", value: "webhookWhitelistOnly", description: "Güvenli listede olmayanların webhooklarını engeller.", default: getSetting(guildId, "webhookWhitelistOnly") },
                        { label: "Taklit (İmmitasyon) Engeli", value: "webhookImpersonationGuard", description: "Yetkili/Bot isimlerini taklit eden webhookları engeller.", default: getSetting(guildId, "webhookImpersonationGuard") },
                        { label: "Link Engeli", value: "webhookLinkEngel", description: "Webhook mesajlarındaki linkleri engeller.", default: getSetting(guildId, "webhookLinkEngel") },
                        { label: "Küfür Engeli", value: "webhookKufurEngel", description: "Webhook mesajlarındaki küfürleri engeller.", default: getSetting(guildId, "webhookKufurEngel") },
                        { label: "Everyone Engeli", value: "webhookEveryoneEngel", description: "Webhookların @everyone / @here etiketlerini engeller.", default: getSetting(guildId, "webhookEveryoneEngel") },
                        { label: "Otonom Kilit", value: "webhookAutonomousLock", description: "Saldırı/Raid anında tüm webhookları kilitler.", default: getSetting(guildId, "webhookAutonomousLock") },
                        { label: "Düzenleme Takibi", value: "webhookMessageEditMonitor", description: "Düzenlenen webhook mesajlarını tekrar filtreler.", default: getSetting(guildId, "webhookMessageEditMonitor") },
                        { label: "Şüpheli Link/IP Engeli", value: "webhookIpBanList", description: "Phishing ve IP Logger linklerini engeller.", default: getSetting(guildId, "webhookIpBanList") },
                        { label: "Zararlı Ek Koruması", value: "webhookAttachmentGuard", description: "Zararlı dosyaları (.exe, .scr) ve aşırı ekleri engeller.", default: getSetting(guildId, "webhookAttachmentGuard") },
                        { label: "Karakter Sınırı", value: "webhookContentLengthLimit", description: "Wall-of-text ve çoklu satır spamlerini engeller.", default: getSetting(guildId, "webhookContentLengthLimit") },
                        { label: "Embed İstismar Engeli", value: "webhookEmbedSpamGuard", description: "Aşırı zengin içerik/embed spamlerini engeller.", default: getSetting(guildId, "webhookEmbedSpamGuard") },
                        { label: "Başlık Koruması", value: "webhookThreadPostGuard", description: "Alt forum başlıklarında webhook kullanımını engeller.", default: getSetting(guildId, "webhookThreadPostGuard") },
                        { label: "Rol Etiket Engeli", value: "webhookRoleMentionGuard", description: "Yetkili ve staff rollerini etiketlemesini engeller.", default: getSetting(guildId, "webhookRoleMentionGuard") }
                    ]);

                const selectOther = new StringSelectMenuBuilder()
                    .setCustomId("toggle_server_other")
                    .setPlaceholder("⚙️ Diğer Sistem Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(2)
                    .addOptions([
                        { label: "Sunucu Ayarları Koruması", value: "antiGuildUpdate", description: "Sunucu ayarlarını geri yükler.", default: getSetting(guildId, "antiGuildUpdate") },
                        { label: "Sunucu Budama (Prune) Engeli", value: "antiPrune", description: "Toplu üye budamalarını engeller.", default: getSetting(guildId, "antiPrune") }
                    ]);

                rows.push(new ActionRowBuilder().addComponents(selectChannels));
                rows.push(new ActionRowBuilder().addComponents(selectRoles));
                rows.push(new ActionRowBuilder().addComponents(selectWebhooks));
                rows.push(new ActionRowBuilder().addComponents(selectOther));
            } else if (activePage === "chat") {
                const selectChat = new StringSelectMenuBuilder()
                    .setCustomId("toggle_chat")
                    .setPlaceholder("💬 Filtreleri Seçin / Düzenleyin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(4)
                    .addOptions([
                        { label: "Argo Filtresi (Basit Motor)", value: "argoEngel", description: "Argo kelimeleri engeller.", default: getSetting(guildId, "argoEngel") },
                        { label: "Caps Lock Filtresi", value: "capsEngel", description: "Aşırı büyük harf kullanımını engeller.", default: getSetting(guildId, "capsEngel") },
                        { label: "Toplu Etiket Engeli", value: "everyoneHereEngel", description: "Yetkisiz @everyone ve @here engeller.", default: getSetting(guildId, "everyoneHereEngel") },
                        { label: "Medya Spam Filtresi", value: "mediaSpamEngel", description: "Arka arkaya görsel paylaşımını engeller.", default: getSetting(guildId, "mediaSpamEngel") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectChat));
            } else if (activePage === "links") {
                const selectLinks1 = new StringSelectMenuBuilder()
                    .setCustomId("toggle_links_1")
                    .setPlaceholder("🔗 Link Türleri & Engelleri (Menü 1)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Genel Engel", value: "linkBlockAll", description: "Tüm linkleri tamamen engeller.", default: getSetting(guildId, "linkBlockAll") },
                        { label: "Davet Kodu Engeli", value: "linkBlockInvites", description: "Discord davet kodlarını engeller.", default: getSetting(guildId, "linkBlockInvites") },
                        { label: "Https Bağlantı Engeli", value: "linkBlockHttpsOnly", description: "Güvenli https bağlantılarını engeller.", default: getSetting(guildId, "linkBlockHttpsOnly") },
                        { label: "Http Bağlantı Engeli", value: "linkBlockHttpOnly", description: "Güvensiz http bağlantılarını engeller.", default: getSetting(guildId, "linkBlockHttpOnly") },
                        { label: "IP Adresi Engeli", value: "linkBlockIPLinks", description: "Doğrudan IP linklerini engeller.", default: getSetting(guildId, "linkBlockIPLinks") },
                        { label: "Alt Alan Adı Engeli", value: "linkBlockSubdomains", description: "Subdomain içeren linkleri engeller.", default: getSetting(guildId, "linkBlockSubdomains") },
                        { label: "Kısaltıcı Servis Engeli", value: "linkBlockShorteners", description: "Kısaltılmış linkleri engeller.", default: getSetting(guildId, "linkBlockShorteners") },
                        { label: "Phishing Engeli", value: "linkBlockPhishing", description: "Oltalama/Sahte site bağlantılarını engeller.", default: getSetting(guildId, "linkBlockPhishing") },
                        { label: "IP Logger Koruması", value: "linkBlockIpLoggers", description: "Bilgi çalıcı ip loggers sitelerini engeller.", default: getSetting(guildId, "linkBlockIpLoggers") },
                        { label: "Yetişkin İçerik Engeli", value: "linkBlockAdultContent", description: "Nsfw/Yetişkin içerikli siteleri engeller.", default: getSetting(guildId, "linkBlockAdultContent") },
                        { label: "Dosya İndirme Engeli", value: "linkBlockDownloads", description: "Doğrudan indirme bağlantılarını (.exe, .zip) engeller.", default: getSetting(guildId, "linkBlockDownloads") },
                        { label: "Zararlı Yazılım Engeli", value: "linkBlockMalware", description: "Zararlı yazılım indirme sitelerini engeller.", default: getSetting(guildId, "linkBlockMalware") },
                        { label: "Sosyal Medya Engeli", value: "linkBlockSocialMedia", description: "Sosyal ağ platform linklerini engeller.", default: getSetting(guildId, "linkBlockSocialMedia") },
                        { label: "Video Siteleri Engeli", value: "linkBlockVideoSites", description: "Youtube vb. video linklerini engeller.", default: getSetting(guildId, "linkBlockVideoSites") },
                        { label: "Kripto Siteleri Engeli", value: "linkBlockCryptocurrency", description: "Kripto borsa/satış linklerini engeller.", default: getSetting(guildId, "linkBlockCryptocurrency") },
                        { label: "Dosya Paylaşım Engeli", value: "linkBlockFileSharing", description: "Google Drive, Mega vb. paylaşım linklerini engeller.", default: getSetting(guildId, "linkBlockFileSharing") },
                        { label: "Özel Blacklist Engeli", value: "linkBlockCustomBlacklist", description: "Sunucu kara listesindeki domainleri engeller.", default: getSetting(guildId, "linkBlockCustomBlacklist") },
                        { label: "Homoglif/Bypass Engeli", value: "linkBlockBypassPatterns", description: "Gizleme/boşluklu link yazımlarını engeller.", default: getSetting(guildId, "linkBlockBypassPatterns") },
                        { label: "Ucuz/Şüpheli TLD Engeli", value: "linkBlockNonStandardTLDs", description: ".xyz, .club vb. TLD'leri engeller.", default: getSetting(guildId, "linkBlockNonStandardTLDs") },
                        { label: "Kullanıcı Embed Linki", value: "linkBlockRichEmbedUrls", description: "Zengin içerikli embed linklerini engeller.", default: getSetting(guildId, "linkBlockRichEmbedUrls") }
                    ]);

                const selectLinks2 = new StringSelectMenuBuilder()
                    .setCustomId("toggle_links_2")
                    .setPlaceholder("⚙️ Muafiyetler, Tarama ve Cezalar (Menü 2)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Discord Resmi Muafiyeti", value: "linkAllowDiscordOfficial", description: "Discord resmi linklerine izin verir.", default: getSetting(guildId, "linkAllowDiscordOfficial") },
                        { label: "YouTube Muafiyeti", value: "linkAllowYoutubeOfficial", description: "YouTube linklerine izin verir.", default: getSetting(guildId, "linkAllowYoutubeOfficial") },
                        { label: "Spotify Muafiyeti", value: "linkAllowSpotifyOfficial", description: "Spotify müzik linklerine izin verir.", default: getSetting(guildId, "linkAllowSpotifyOfficial") },
                        { label: "GitHub Muafiyeti", value: "linkAllowGithubOfficial", description: "GitHub proje linklerine izin verir.", default: getSetting(guildId, "linkAllowGithubOfficial") },
                        { label: "Google Muafiyeti", value: "linkAllowGoogleOfficial", description: "Google servislerine ait linklere izin verir.", default: getSetting(guildId, "linkAllowGoogleOfficial") },
                        { label: "Görsel Linki Muafiyeti", value: "linkAllowImagesOnly", description: "Sadece görsel uzantılı linklere izin verir.", default: getSetting(guildId, "linkAllowImagesOnly") },
                        { label: "Özel Whitelist Muafiyeti", value: "linkAllowCustomWhitelist", description: "Sunucu whitelistindeki domainlere izin verir.", default: getSetting(guildId, "linkAllowCustomWhitelist") },
                        { label: "Link Durum Kontrolü", value: "linkScanStatusChecks", description: "Bozuk veya hata döndüren linkleri engeller.", default: getSetting(guildId, "linkScanStatusChecks") },
                        { label: "Yönlendirme Sınırı", value: "linkScanRedirectLimit", description: "Çoklu yönlendirme yapan linkleri engeller.", default: getSetting(guildId, "linkScanRedirectLimit") },
                        { label: "Kısaltılmış Link Analizi", value: "linkScanContentMinimizer", description: "Kısaltılmış linkleri açıp analiz eder.", default: getSetting(guildId, "linkScanContentMinimizer") },
                        { label: "Rastgelelik (Caps) Oranı", value: "linkScanCapsRatio", description: "Caps/Rastgele kodlu linkleri engeller.", default: getSetting(guildId, "linkScanCapsRatio") },
                        { label: "Karakter Sınırı Engeli", value: "linkScanLengthLimit", description: "Aşırı uzun (100+ karakter) linkleri engeller.", default: getSetting(guildId, "linkScanLengthLimit") },
                        { label: "Kanal Muafiyetleri", value: "linkScanChannelWhitelist", description: "İzin verilen kanallarda filtreleri devre dışı bırakır.", default: getSetting(guildId, "linkScanChannelWhitelist") },
                        { label: "Rol Muafiyetleri", value: "linkScanRoleWhitelist", description: "İzin verilen rollerde filtreleri devre dışı bırakır.", default: getSetting(guildId, "linkScanRoleWhitelist") },
                        { label: "Mesajı Silme Cezası", value: "linkActionDelete", description: "Kural ihlalinde mesajı otomatik siler.", default: getSetting(guildId, "linkActionDelete") },
                        { label: "Uyarı Gönderme Cezası", value: "linkActionWarn", description: "Kural ihlalinde kullanıcıyı uyarır.", default: getSetting(guildId, "linkActionWarn") },
                        { label: "Susturma Cezası", value: "linkActionTimeout", description: "Kural ihlalinde susturma cezası uygular.", default: getSetting(guildId, "linkActionTimeout") },
                        { label: "Sunucudan Atma Cezası", value: "linkActionKick", description: "Kural ihlalinde sunucudan atar.", default: getSetting(guildId, "linkActionKick") },
                        { label: "Sunucudan Yasaklama", value: "linkActionBan", description: "Phishing/Logger ihlalinde direkt banlar.", default: getSetting(guildId, "linkActionBan") },
                        { label: "Yetkili Log Bildirimi", value: "linkActionStaffLog", description: "İhlal raporlarını yetkili kanalına gönderir.", default: getSetting(guildId, "linkActionStaffLog") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectLinks1));
                rows.push(new ActionRowBuilder().addComponents(selectLinks2));
            } else if (activePage === "kufur") {
                const selectKufur1 = new StringSelectMenuBuilder()
                    .setCustomId("toggle_kufur_1")
                    .setPlaceholder("🤬 Küfür Filtreleri & Kategoriler (Menü 1)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Genel Engel", value: "kufurBlockAll", description: "Tüm küfür ve hakaretleri engeller.", default: getSetting(guildId, "kufurBlockAll") },
                        { label: "Ailevi Hakaret Engeli", value: "kufurBlockFamily", description: "Ailevi hakaretleri engeller.", default: getSetting(guildId, "kufurBlockFamily") },
                        { label: "Cinsel İçerik Engeli", value: "kufurBlockSexual", description: "Cinsel içerikli kelimeleri engeller.", default: getSetting(guildId, "kufurBlockSexual") },
                        { label: "Dini Değerlere Küfür", value: "kufurBlockReligious", description: "Dini değerlere küfürleri engeller.", default: getSetting(guildId, "kufurBlockReligious") },
                        { label: "Irkçı Hakaret Engeli", value: "kufurBlockRacist", description: "Irkçı hakaretleri engeller.", default: getSetting(guildId, "kufurBlockRacist") },
                        { label: "Siyasi Taciz Engeli", value: "kufurBlockPolitical", description: "Siyasi taciz ve hakaretleri engeller.", default: getSetting(guildId, "kufurBlockPolitical") },
                        { label: "Argo Sözcük Engeli (Gelişmiş Motor)", value: "kufurBlockArgo", description: "Argo ve kaba kelimeleri engeller.", default: getSetting(guildId, "kufurBlockArgo") },
                        { label: "Kısaltmalar Koruması", value: "kufurBlockAbbreviations", description: "Kısaltılmış küfürleri engeller (amk, aq, vb.).", default: getSetting(guildId, "kufurBlockAbbreviations") },
                        { label: "Cinsiyetçi Taciz Engeli", value: "kufurBlockHomophobic", description: "Homofobik ve cinsiyetçi kelimeleri engeller.", default: getSetting(guildId, "kufurBlockHomophobic") },
                        { label: "Hakaret Spami Engeli", value: "kufurBlockSpamInsults", description: "Aynı hakareti tekrarlamayı engeller.", default: getSetting(guildId, "kufurBlockSpamInsults") },
                        { label: "Şiddet / Tehdit Engeli", value: "kufurBlockThreats", description: "Tehdit ve şiddet içeren kelimeleri engeller.", default: getSetting(guildId, "kufurBlockThreats") },
                        { label: "Yetkiliye Hakaret Engeli", value: "kufurBlockAdmins", description: "Yetkililere yönelik hakaretleri engeller.", default: getSetting(guildId, "kufurBlockAdmins") },
                        { label: "Yabancı Dil Küfürler", value: "kufurBlockForeign", description: "İngilizce vb. yabancı küfürleri engeller.", default: getSetting(guildId, "kufurBlockForeign") },
                        { label: "Fonetik Karakter Engeli", value: "kufurBlockPhonetic", description: "Harf aralarına işaret koymayı engeller.", default: getSetting(guildId, "kufurBlockPhonetic") },
                        { label: "Boşluklu Yazım Engeli", value: "kufurBlockSpaced", description: "Boşluklu küfür yazımlarını engeller.", default: getSetting(guildId, "kufurBlockSpaced") },
                        { label: "Homoglif/Bypass Engeli", value: "kufurBlockHomoglyphs", description: "Farklı alfabeden harf değişimlerini engeller.", default: getSetting(guildId, "kufurBlockHomoglyphs") },
                        { label: "Özel Blacklist Engeli", value: "kufurBlockCustomBlacklist", description: "Özel kara listedeki kelimeleri engeller.", default: getSetting(guildId, "kufurBlockCustomBlacklist") },
                        { label: "Uygunsuz Emoji İsimleri", value: "kufurBlockEmojis", description: "Uygunsuz isimli emojileri engeller.", default: getSetting(guildId, "kufurBlockEmojis") },
                        { label: "Kullanıcı İsmi Koruması", value: "kufurBlockNicknames", description: "Kullanıcı adlarında küfürü engeller.", default: getSetting(guildId, "kufurBlockNicknames") },
                        { label: "Kullanıcı Embed Metinleri", value: "kufurBlockRichEmbedTexts", description: "Zengin içerikli embed metinlerini tarar.", default: getSetting(guildId, "kufurBlockRichEmbedTexts") }
                    ]);

                const selectKufur2 = new StringSelectMenuBuilder()
                    .setCustomId("toggle_kufur_2")
                    .setPlaceholder("⚙️ Muafiyetler, Tarama ve Cezalar (Menü 2)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Kanal Muafiyetleri", value: "kufurAllowWhitelistedChannels", description: "Muaf kanallarda filtreyi kapatır.", default: getSetting(guildId, "kufurAllowWhitelistedChannels") },
                        { label: "Yetkili Muafiyeti", value: "kufurAllowStaff", description: "Yönetici ve yetkilileri muaf tutar.", default: getSetting(guildId, "kufurAllowStaff") },
                        { label: "Hatalı Yazım Düzeltme", value: "kufurAllowSelfCorrect", description: "Hatalı yazımda 3 saniye silme izni verir.", default: getSetting(guildId, "kufurAllowSelfCorrect") },
                        { label: "Alıntı Küfür İzni", value: "kufurAllowQuotes", description: "Alıntı işaretli küfürlere izin verir.", default: getSetting(guildId, "kufurAllowQuotes") },
                        { label: "Özel Kelime Whitelisti", value: "kufurAllowCustomWhitelist", description: "Güvenli kelimelere izin verir.", default: getSetting(guildId, "kufurAllowCustomWhitelist") },
                        { label: "Rol Muafiyetleri", value: "kufurAllowRoleWhitelist", description: "Muaf rollerde filtreyi kapatır.", default: getSetting(guildId, "kufurAllowRoleWhitelist") },
                        { label: "Otonom Susturma Bypassı", value: "kufurAllowAutonomousBypass", description: "Otonom susturmayı duruma göre yumuşatır.", default: getSetting(guildId, "kufurAllowAutonomousBypass") },
                        { label: "Levensthein (Yakınlık)", value: "kufurScanLevensthein", description: "Benzer yazılmış küfürleri algılar.", default: getSetting(guildId, "kufurScanLevensthein") },
                        { label: "Gelişmiş Regex Taraması", value: "kufurScanRegexBypass", description: "Regex kullanarak bypassları arar.", default: getSetting(guildId, "kufurScanRegexBypass") },
                        { label: "Büyük Harfli Küfür Filtresi", value: "kufurScanCapsInsult", description: "Caps Lock ile yazılmış küfürleri tarar.", default: getSetting(guildId, "kufurScanCapsInsult") },
                        { label: "Zalgo/Bozuk Harf Filtresi", value: "kufurScanZalgo", description: "Zalgo/bozuk karakterleri temizler.", default: getSetting(guildId, "kufurScanZalgo") },
                        { label: "Yoğunluk Sınırı Engeli", value: "kufurScanLengthRatio", description: "Mesajdaki küfür oranı %50+ ise engeller.", default: getSetting(guildId, "kufurScanLengthRatio") },
                        { label: "Spoiler İçerik Koruması", value: "kufurScanSpoilers", description: "Spoiler içindeki küfürleri tarar.", default: getSetting(guildId, "kufurScanSpoilers") },
                        { label: "Dosya Adı Koruması", value: "kufurScanAttachments", description: "Görsel ve dosya isimlerini tarar.", default: getSetting(guildId, "kufurScanAttachments") },
                        { label: "Mesajı Silme Cezası", value: "kufurActionDelete", description: "Küfür edildiğinde mesajı siler.", default: getSetting(guildId, "kufurActionDelete") },
                        { label: "Kullanıcıyı Uyarma", value: "kufurActionWarn", description: "Kullanıcıyı chatte uyarır.", default: getSetting(guildId, "kufurActionWarn") },
                        { label: "Susturma (Mute) Cezası", value: "kufurActionMute", description: "5 dakika susturma cezası verir.", default: getSetting(guildId, "kufurActionMute") },
                        { label: "Sunucudan Atma (Kick)", value: "kufurActionKick", description: "Tekrarlı ihlalde sunucudan atar.", default: getSetting(guildId, "kufurActionKick") },
                        { label: "Sunucudan Yasaklama", value: "kufurActionBan", description: "Kritik ihlalde sunucudan banlar.", default: getSetting(guildId, "kufurActionBan") },
                        { label: "Yetkili Log Bildirimi", value: "kufurActionStaffLog", description: "İhlali yetkili kanalına loglar.", default: getSetting(guildId, "kufurActionStaffLog") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectKufur1));
                rows.push(new ActionRowBuilder().addComponents(selectKufur2));
            } else if (activePage === "antibot") {
                const selectAntiBot = new StringSelectMenuBuilder()
                    .setCustomId("toggle_antibot")
                    .setPlaceholder("🤖 Anti-Bot Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Genel Bot Engeli", value: "antiBotAdd", description: "İzinsiz bot eklenmesini engeller.", default: getSetting(guildId, "antiBotAdd") },
                        { label: "Ekleme Limit Koruması", value: "antiBotLimitAdd", description: "Yöneticilerin saatte maks 1 bot eklemesine izin verir.", default: getSetting(guildId, "antiBotLimitAdd") },
                        { label: "Onaylama Mekanizması", value: "antiBotRequireVerify", description: "Botların yetkili onayından sonra açılmasını sağlar.", default: getSetting(guildId, "antiBotRequireVerify") },
                        { label: "Tam Kilit Modu", value: "antiBotLockdown", description: "Herkes için bot eklemeyi geçici kapatır.", default: getSetting(guildId, "antiBotLockdown") },
                        { label: "Doğrulanmamış Bot Engeli", value: "antiBotBlockUnverified", description: "Sadece doğrulanmış resmi botlara izin verir.", default: getSetting(guildId, "antiBotBlockUnverified") },
                        { label: "Yetki Temizleme Modu", value: "antiBotLimitPermissions", description: "Yeni botların Yönetici yetkilerini sıfırlar.", default: getSetting(guildId, "antiBotLimitPermissions") },
                        { label: "Rol Kısıtlama Modu", value: "antiBotRestrictRoles", description: "Yeni botların yetkili rol almasını engeller.", default: getSetting(guildId, "antiBotRestrictRoles") },
                        { label: "Karantina Filtresi", value: "antiBotQuarantine", description: "Botları onaylanana kadar karantinada tutar.", default: getSetting(guildId, "antiBotQuarantine") },
                        { label: "Ekleyeni At (Kick)", value: "antiBotActionKickAddExecutor", description: "İzinsiz bot ekleyen yöneticiyi sunucudan atar.", default: getSetting(guildId, "antiBotActionKickAddExecutor") },
                        { label: "Ekleyeni Yasakla (Ban)", value: "antiBotActionBanAddExecutor", description: "İzinsiz bot ekleyen yöneticiyi banlar.", default: getSetting(guildId, "antiBotActionBanAddExecutor") },
                        { label: "Detay Günlük Kaydı", value: "antiBotLogAddedDetails", description: "Bot hakkında teknik detayları loglar.", default: getSetting(guildId, "antiBotLogAddedDetails") },
                        { label: "Bot Yaş Koruması", value: "antiBotCheckCreationDate", description: "15 günden yeni açılmış botları engeller.", default: getSetting(guildId, "antiBotCheckCreationDate") },
                        { label: "Genel Bot Engel Koruması", value: "antiBotBlockPublicBots", description: "Sadece özel botlara izin verir, genel botları engeller.", default: getSetting(guildId, "antiBotBlockPublicBots") },
                        { label: "Şüpheli Komut Kontrolü", value: "antiBotScanCommandNameSpam", description: "Tehlikeli komut içeren botları engeller.", default: getSetting(guildId, "antiBotScanCommandNameSpam") },
                        { label: "Çift Denetim Modu", value: "antiBotAuditLogCompare", description: "Gecikmeli log bypasslarını engeller.", default: getSetting(guildId, "antiBotAuditLogCompare") },
                        { label: "Otonom Susturma Bypassı", value: "antiBotAutonomousBypass", description: "Tehdit seviyesine göre kuralları gevşetir.", default: getSetting(guildId, "antiBotAutonomousBypass") },
                        { label: "Rol Atama Uyarısı", value: "antiBotAdminRoleAlert", description: "Bota yönetici rolü verilince sahibe DM atar.", default: getSetting(guildId, "antiBotAdminRoleAlert") },
                        { label: "Token İptal Koruması", value: "antiBotBlockTokenLeaks", description: "Kanalda bot tokenı sızarsa tokenı iptal eder.", default: getSetting(guildId, "antiBotBlockTokenLeaks") },
                        { label: "Kanal Erişim Sınırı", value: "antiBotChannelRestriction", description: "Bota sadece test kanallarını gösterir.", default: getSetting(guildId, "antiBotChannelRestriction") },
                        { label: "İstikrar Günlüğü", value: "antiBotIntegrityLogs", description: "Botun ilk 24 saatteki hareketlerini takip eder.", default: getSetting(guildId, "antiBotIntegrityLogs") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectAntiBot));
            } else if (activePage === "guild") {
                const selectGuild = new StringSelectMenuBuilder()
                    .setCustomId("toggle_guild_settings")
                    .setPlaceholder("🖥️ Sunucu Ayarları Korumalarını Seçin")
                    .setMinValues(0)
                    .setMaxValues(15)
                    .addOptions([
                        { label: "Genel Engel", value: "antiGuildUpdate", description: "Ayarların değiştirilmesini engeller.", default: getSetting(guildId, "antiGuildUpdate") },
                        { label: "Sunucu İsmi Koruması", value: "antiGuildNameUpdate", description: "İsim değişikliklerini eskiye döndürür.", default: getSetting(guildId, "antiGuildNameUpdate") },
                        { label: "Sunucu İkon Koruması", value: "antiGuildIconUpdate", description: "Profil ikon değişikliklerini geri alır.", default: getSetting(guildId, "antiGuildIconUpdate") },
                        { label: "Banner Resmi Koruması", value: "antiGuildBannerUpdate", description: "Banner resminin değiştirilmesini geri alır.", default: getSetting(guildId, "antiGuildBannerUpdate") },
                        { label: "Splash Resmi Koruması", value: "antiGuildSplashUpdate", description: "Davet arka plan resmini geri yükler.", default: getSetting(guildId, "antiGuildSplashUpdate") },
                        { label: "Doğrulama Seviyesi", value: "antiGuildVerificationLevelUpdate", description: "Doğrulama düzeyi değişimlerini engeller.", default: getSetting(guildId, "antiGuildVerificationLevelUpdate") },
                        { label: "Medya İçerik Filtresi", value: "antiGuildContentFilterUpdate", description: "Aşırı görsel tarayıcı değişimini engeller.", default: getSetting(guildId, "antiGuildContentFilterUpdate") },
                        { label: "Widget Koruması", value: "antiGuildWidgetUpdate", description: "Sunucu widget değişimlerini geri alır.", default: getSetting(guildId, "antiGuildWidgetUpdate") },
                        { label: "Sistem Kanalı Koruması", value: "antiGuildSystemChannelUpdate", description: "Sistem kanalı değişimini engeller.", default: getSetting(guildId, "antiGuildSystemChannelUpdate") },
                        { label: "Kurallar Kanalı Koruması", value: "antiGuildRulesChannelUpdate", description: "Kurallar kanalı değişimini geri alır.", default: getSetting(guildId, "antiGuildRulesChannelUpdate") },
                        { label: "Topluluk Güncelleme Kanalı", value: "antiGuildUpdatesChannelUpdate", description: "Community updates kanalı değişimini engeller.", default: getSetting(guildId, "antiGuildUpdatesChannelUpdate") },
                        { label: "MFA Yetki Kilidi", value: "antiGuildMfaLevelUpdate", description: "İki faktörlü kimlik doğrulama değişimlerini engeller.", default: getSetting(guildId, "antiGuildMfaLevelUpdate") },
                        { label: "Özel URL (Vanity) Koruması", value: "antiGuildVanityUrlUpdate", description: "Custom URL çalınmalarını anında geri alır.", default: getSetting(guildId, "antiGuildVanityUrlUpdate") },
                        { label: "Çoklu Eylem Kilidi", value: "antiGuildFeatureRevertLock", description: "Hızlı yapılan spam değişimlerde kilit atar.", default: getSetting(guildId, "antiGuildFeatureRevertLock") },
                        { label: "Sahip DM Bildirimi", value: "antiGuildActionOwnerAlert", description: "Değişikliklerin diff raporunu sahibe DM atar.", default: getSetting(guildId, "antiGuildActionOwnerAlert") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectGuild));
            } else if (activePage === "prune") {
                const selectPrune = new StringSelectMenuBuilder()
                    .setCustomId("toggle_prune_settings")
                    .setPlaceholder(" Budama (Prune) Korumalarını Seçin")
                    .setMinValues(0)
                    .setMaxValues(15)
                    .addOptions([
                        { label: "Genel Engel", value: "antiPrune", description: "Budama işlemlerini durdurur.", default: getSetting(guildId, "antiPrune") },
                        { label: "Budama İşlemi Engeli", value: "antiPruneBlockAll", description: "Her türlü budama işlemini tamamen yasaklar.", default: getSetting(guildId, "antiPruneBlockAll") },
                        { label: "Budama Gün Sınırı", value: "antiPruneLimitDays", description: "30 günden eski budamaları engeller.", default: getSetting(guildId, "antiPruneLimitDays") },
                        { label: "Budama Rol Sınırı", value: "antiPruneMinRoles", description: "Rol seçimi yapılmayan genel budamaları engeller.", default: getSetting(guildId, "antiPruneMinRoles") },
                        { label: "Saat Sınırı Koruması", value: "antiPruneTimeLimit", description: "Şüpheli gece saatlerinde budamayı engeller.", default: getSetting(guildId, "antiPruneTimeLimit") },
                        { label: "Yetki Kilidi (Kanal)", value: "antiPruneLockdownOnPrune", description: "Budama anında tüm kanalları kilitler.", default: getSetting(guildId, "antiPruneLockdownOnPrune") },
                        { label: "Karantina Tehdidi", value: "antiPruneThreatMax", description: "Budama anında tehdit seviyesini %100 yapar.", default: getSetting(guildId, "antiPruneThreatMax") },
                        { label: "Aktif Yetkili Karantinası", value: "antiPruneIntegrityQuarantine", description: "Saldırı anında diğer yetkilileri dondurur.", default: getSetting(guildId, "antiPruneIntegrityQuarantine") },
                        { label: "Çift Audit Kontrolü", value: "antiPruneAuditDoubleCheck", description: "Gecikmeli denetim kaydı bypasslarını önler.", default: getSetting(guildId, "antiPruneAuditDoubleCheck") },
                        { label: "Rol Silme Taraması", value: "antiPruneRoleRecoveryTracker", description: "Budama öncesi kasıtlı rol silmelerini algılar.", default: getSetting(guildId, "antiPruneRoleRecoveryTracker") },
                        { label: "Yetkiliyi At (Kick)", value: "antiPruneActionKickExecutor", description: "Budama başlatan yöneticiyi atar.", default: getSetting(guildId, "antiPruneActionKickExecutor") },
                        { label: "Yetkiliyi Yasakla (Ban)", value: "antiPruneActionBanExecutor", description: "Budama başlatan yöneticiyi banlar.", default: getSetting(guildId, "antiPruneActionBanExecutor") },
                        { label: "Rolleri Temizleme", value: "antiPruneActionStripRoles", description: "Budama başlatanın yetkili rollerini sıfırlar.", default: getSetting(guildId, "antiPruneActionStripRoles") },
                        { label: "Sahip DM Bildirimi", value: "antiPruneOwnerNotification", description: "Budama detaylarını sunucu sahibine DM atar.", default: getSetting(guildId, "antiPruneOwnerNotification") },
                        { label: "Gelişmiş Rapor Günlüğü", value: "antiPruneLogStaff", description: "Budama verilerini yetkili loguna raporlar.", default: getSetting(guildId, "antiPruneLogStaff") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectPrune));
            } else if (activePage === "spam") {
                const selectSpam = new StringSelectMenuBuilder()
                    .setCustomId("toggle_spam_settings")
                    .setPlaceholder("💬 Spam Korumalarını Seçin (Çoklu Seçim)")
                    .setMinValues(0)
                    .setMaxValues(20)
                    .addOptions([
                        { label: "Genel Engel", value: "spamBlockAll", description: "Tüm spam filtreleme sistemini aktif eder.", default: getSetting(guildId, "spamBlockAll") },
                        { label: "Tekrarlanan Mesaj Engeli", value: "spamDuplicateLimit", description: "Son 15 saniyede gönderilen aynı mesajları siler.", default: getSetting(guildId, "spamDuplicateLimit") },
                        { label: "Mesaj Hız Sınırı", value: "spamMaxMessages", description: "3 saniyede 5'ten fazla mesaj gönderilmesini engeller.", default: getSetting(guildId, "spamMaxMessages") },
                        { label: "Min Mesaj Aralığı", value: "spamMinTimeBetweenMessages", description: "Mesajlar arasında 500ms bekleme zorunluluğu getirir.", default: getSetting(guildId, "spamMinTimeBetweenMessages") },
                        { label: "Büyük Harf Koruması", value: "spamCapsPercentage", description: "Mesajdaki büyük harf oranı %70'ten fazla ise engeller.", default: getSetting(guildId, "spamCapsPercentage") },
                        { label: "Emoji Yoğunluk Sınırı", value: "spamMaxEmojis", description: "Tek mesajda maksimum 5 emoji kullanımına izin verir.", default: getSetting(guildId, "spamMaxEmojis") },
                        { label: "Etiket Yoğunluk Sınırı", value: "spamMaxMentions", description: "Tek mesajda maksimum 4 etiket kullanımına izin verir.", default: getSetting(guildId, "spamMaxMentions") },
                        { label: "Rol Etiket Kısıtlaması", value: "spamRoleMentions", description: "Tek mesajda maksimum 2 rol etiketlemesine izin verir.", default: getSetting(guildId, "spamRoleMentions") },
                        { label: "Satır Sınırı Koruması", value: "spamMaxLines", description: "Mesajlardaki maksimum satır sayısını 5 ile sınırlar.", default: getSetting(guildId, "spamMaxLines") },
                        { label: "Karakter Uzunluk Sınırı", value: "spamMaxLength", description: "Mesajlardaki maksimum karakter sayısını 800 ile sınırlar.", default: getSetting(guildId, "spamMaxLength") },
                        { label: "Süre Kısıtlaması (React)", value: "spamFastReact", description: "Çok hızlı tepki (reaction) spamlarını engeller.", default: getSetting(guildId, "spamFastReact") },
                        { label: "Çoklu Link Filtresi", value: "spamLinkCount", description: "Tek mesajda maksimum 2 bağlantı paylaşımına izin verir.", default: getSetting(guildId, "spamLinkCount") },
                        { label: "Mesajı Silme Cezası", value: "spamActionDelete", description: "Spam tespit edildiğinde mesajı otomatik olarak siler.", default: getSetting(guildId, "spamActionDelete") },
                        { label: "Uyarı Gönderme Cezası", value: "spamActionWarn", description: "Spam tespit edildiğinde kullanıcıyı kanalda uyarır.", default: getSetting(guildId, "spamActionWarn") },
                        { label: "Susturma (Mute) Cezası", value: "spamActionMute", description: "Spam yapan kullanıcıyı 5 dakika boyunca susturur.", default: getSetting(guildId, "spamActionMute") },
                        { label: "Sunucudan Atma (Kick)", value: "spamActionKick", description: "Spam yapmaya devam eden kullanıcıyı sunucudan atar.", default: getSetting(guildId, "spamActionKick") },
                        { label: "Sunucudan Yasaklama (Ban)", value: "spamActionBan", description: "Ciddi spam raidlerinde kullanıcıyı doğrudan banlar.", default: getSetting(guildId, "spamActionBan") },
                        { label: "Yetkili Rapor Bildirimi", value: "spamActionStaffLog", description: "Spam ihlal detaylarını yetkili log kanalına raporlar.", default: getSetting(guildId, "spamActionStaffLog") },
                        { label: "Yetkili Muafiyeti", value: "spamAllowStaff", description: "Yöneticileri ve yetkilileri spam engeline karşı muaf tutar.", default: getSetting(guildId, "spamAllowStaff") },
                        { label: "Kanal Muafiyetleri", value: "spamBypassChannels", description: "Spam serbest kanalları veya bot komut kanallarını muaf tutar.", default: getSetting(guildId, "spamBypassChannels") }
                    ]);
                rows.push(new ActionRowBuilder().addComponents(selectSpam));
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
            } else if (i.customId === "toggle_webhooks") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiWebhookCreate", "antiWebhookDelete", "antiWebhookUpdate",
                    "webhookSpamEngel", "webhookTokenLeakGuard", "webhookNameFilter",
                    "webhookChannelLock", "webhookAvatarLock", "webhookLimitPerChannel",
                    "webhookWhitelistOnly", "webhookImpersonationGuard", "webhookLinkEngel",
                    "webhookKufurEngel", "webhookEveryoneEngel", "webhookAutonomousLock",
                    "webhookMessageEditMonitor", "webhookIpBanList", "webhookAttachmentGuard",
                    "webhookContentLengthLimit", "webhookEmbedSpamGuard", "webhookThreadPostGuard",
                    "webhookRoleMentionGuard"
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
                    "antiBotAdd", "antiGuildUpdate", "antiPrune"
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
                    "argoEngel", "capsEngel",
                    "everyoneHereEngel", "mediaSpamEngel"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_links_1") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "linkBlockAll", "linkBlockInvites", "linkBlockHttpsOnly", "linkBlockHttpOnly",
                    "linkBlockIPLinks", "linkBlockSubdomains", "linkBlockShorteners", "linkBlockPhishing",
                    "linkBlockIpLoggers", "linkBlockAdultContent", "linkBlockDownloads", "linkBlockMalware",
                    "linkBlockSocialMedia", "linkBlockVideoSites", "linkBlockCryptocurrency", "linkBlockFileSharing",
                    "linkBlockCustomBlacklist", "linkBlockBypassPatterns", "linkBlockNonStandardTLDs", "linkBlockRichEmbedUrls"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_links_2") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "linkAllowDiscordOfficial", "linkAllowYoutubeOfficial", "linkAllowSpotifyOfficial", "linkAllowGithubOfficial",
                    "linkAllowGoogleOfficial", "linkAllowImagesOnly", "linkAllowCustomWhitelist", "linkScanStatusChecks",
                    "linkScanRedirectLimit", "linkScanContentMinimizer", "linkScanCapsRatio", "linkScanLengthLimit",
                    "linkScanChannelWhitelist", "linkScanRoleWhitelist", "linkActionDelete", "linkActionWarn",
                    "linkActionTimeout", "linkActionKick", "linkActionBan", "linkActionStaffLog"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_kufur_1") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "kufurBlockAll", "kufurBlockFamily", "kufurBlockSexual", "kufurBlockReligious",
                    "kufurBlockRacist", "kufurBlockPolitical", "kufurBlockArgo", "kufurBlockAbbreviations",
                    "kufurBlockHomophobic", "kufurBlockSpamInsults", "kufurBlockThreats", "kufurBlockAdmins",
                    "kufurBlockForeign", "kufurBlockPhonetic", "kufurBlockSpaced", "kufurBlockHomoglyphs",
                    "kufurBlockCustomBlacklist", "kufurBlockEmojis", "kufurBlockNicknames", "kufurBlockRichEmbedTexts"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_kufur_2") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "kufurAllowWhitelistedChannels", "kufurAllowStaff", "kufurAllowSelfCorrect", "kufurAllowQuotes",
                    "kufurAllowCustomWhitelist", "kufurAllowRoleWhitelist", "kufurAllowAutonomousBypass", "kufurScanLevensthein",
                    "kufurScanRegexBypass", "kufurScanCapsInsult", "kufurScanZalgo", "kufurScanLengthRatio",
                    "kufurScanSpoilers", "kufurScanAttachments", "kufurActionDelete", "kufurActionWarn",
                    "kufurActionMute", "kufurActionKick", "kufurActionBan", "kufurActionStaffLog"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_antibot") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiBotAdd", "antiBotLimitAdd", "antiBotRequireVerify", "antiBotLockdown",
                    "antiBotBlockUnverified", "antiBotLimitPermissions", "antiBotRestrictRoles", "antiBotQuarantine",
                    "antiBotActionKickAddExecutor", "antiBotActionBanAddExecutor", "antiBotLogAddedDetails", "antiBotCheckCreationDate",
                    "antiBotBlockPublicBots", "antiBotScanCommandNameSpam", "antiBotAuditLogCompare", "antiBotAutonomousBypass",
                    "antiBotAdminRoleAlert", "antiBotBlockTokenLeaks", "antiBotChannelRestriction", "antiBotIntegrityLogs"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_guild_settings") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiGuildUpdate", "antiGuildNameUpdate", "antiGuildIconUpdate", "antiGuildBannerUpdate", "antiGuildSplashUpdate",
                    "antiGuildVerificationLevelUpdate", "antiGuildContentFilterUpdate", "antiGuildWidgetUpdate", "antiGuildSystemChannelUpdate",
                    "antiGuildRulesChannelUpdate", "antiGuildUpdatesChannelUpdate", "antiGuildMfaLevelUpdate", "antiGuildVanityUrlUpdate",
                    "antiGuildFeatureRevertLock", "antiGuildActionOwnerAlert"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_prune_settings") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "antiPrune", "antiPruneBlockAll", "antiPruneLimitDays", "antiPruneMinRoles", "antiPruneTimeLimit",
                    "antiPruneLockdownOnPrune", "antiPruneThreatMax", "antiPruneIntegrityQuarantine", "antiPruneAuditDoubleCheck",
                    "antiPruneRoleRecoveryTracker", "antiPruneActionKickExecutor", "antiPruneActionBanExecutor", "antiPruneActionStripRoles",
                    "antiPruneOwnerNotification", "antiPruneLogStaff"
                ];
                keys.forEach(k => settings[k] = i.values.includes(k));
                global.guardSettings.set(guildId, settings);
                await updateSetting(guildId, "guard_settings", settings);
                await interaction.editReply({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } else if (i.customId === "toggle_spam_settings") {
                const settings = global.guardSettings.get(guildId) || {};
                const keys = [
                    "spamBlockAll", "spamDuplicateLimit", "spamMaxMessages", "spamMinTimeBetweenMessages",
                    "spamCapsPercentage", "spamMaxEmojis", "spamMaxMentions", "spamMaxLines",
                    "spamMaxLength", "spamRoleMentions", "spamFastReact", "spamLinkCount",
                    "spamActionDelete", "spamActionWarn", "spamActionMute", "spamActionKick",
                    "spamActionBan", "spamActionStaffLog", "spamAllowStaff", "spamBypassChannels"
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
                            new ButtonBuilder().setCustomId("wl_perms_toggle_limitBypass").setLabel(`Limit: ${userPerms.limitBypass ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
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
                        new ButtonBuilder().setCustomId("wl_perms_toggle_limitBypass").setLabel(`Limit: ${userPerms.limitBypass ? "🟢 Evet" : "🔴 Hayır"}`).setStyle(ButtonStyle.Secondary),
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
        require("./guards/prune.js")(client);
        require("./guards/spam.js")(client);
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
