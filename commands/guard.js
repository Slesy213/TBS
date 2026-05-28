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
    autonomousMode: false
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
    await sendGuardLog(guild, user, null, reason, "Yetkileri Alındı & Yasaklandı", guildId);

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Strip roles
    await member.roles.set([]).catch(() => {});

    // Ban
    await member.ban({ reason: `Guard | ${reason}` }).catch(() => {});
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
        // INTERACTIVE CONTROL PANEL
        // ============================================
        let activePage = "main";

        const generateEmbed = () => {
            const ansiStatus = (key) => isFeatureEnabled(guildId, key) 
                ? "\u001b[1;32m✔ AKTİF\u001b[0m" 
                : "\u001b[1;31m✖ PASİF\u001b[0m";

            const mainStatus = global.guardDurums.get(guildId) 
                ? "\u001b[1;32mAKTİF\u001b[0m" 
                : "\u001b[1;31mDEVRE DIŞI\u001b[0m";

            const autoStatus = getSetting(guildId, "autonomousMode") 
                ? "\u001b[1;32mAKTİF\u001b[0m" 
                : "\u001b[1;31mPASİF\u001b[0m";

            const threatVal = global.guildThreatLevels.get(guildId) || 0;
            
            let bar = "";
            const blocks = Math.round(threatVal / 10);
            for(let i=0; i<10; i++) {
                bar += i < blocks ? "█" : "░";
            }

            let threatColor = "\u001b[1;32mGÜVENLİ\u001b[0m";
            if (threatVal >= 70) threatColor = "\u001b[1;31mKRİTİK / RAID SALDIRISI\u001b[0m";
            else if (threatVal >= 35) threatColor = "\u001b[1;33mŞÜPHELİ\u001b[0m";

            if (activePage === "main") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🛡️ Slesy Guard | Sistem Kontrol Paneli")
                    .setDescription(`\`\`\`ansi
\u001b[1;34mSİSTEM DURUMU:\u001b[0m
  Ana Koruma    :: ${mainStatus}
  Otonom Mod    :: ${autoStatus}

\u001b[1;34mTEHDİT SEVİYESİ:\u001b[0m
  Durum         :: ${threatColor}
  Bar           :: ${bar} %${threatVal}
\`\`\`
Kategorileri yönetmek veya genel eylemleri gerçekleştirmek için aşağıdaki butonları kullanın.`);
            }

            if (activePage === "server") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("🖥️ Sunucu Bütünlüğü Korumaları")
                    .setDescription(`\`\`\`ansi
\u001b[1;36mKanal Korumaları:\u001b[0m
  Oluşturma    :: ${ansiStatus("antiChannelCreate")}
  Silme        :: ${ansiStatus("antiChannelDelete")}
  Güncelleme   :: ${ansiStatus("antiChannelUpdate")}

\u001b[1;36mRol Korumaları:\u001b[0m
  Oluşturma    :: ${ansiStatus("antiRoleCreate")}
  Silme        :: ${ansiStatus("antiRoleDelete")}
  Güncelleme   :: ${ansiStatus("antiRoleUpdate")}

\u001b[1;36mSistem Korumaları:\u001b[0m
  Webhook      :: ${ansiStatus("antiWebhookCreate")}
  Bot Ekleme   :: ${ansiStatus("antiBotAdd")}
  Sunucu Ayar  :: ${ansiStatus("antiGuildUpdate")}
  Budama       :: ${ansiStatus("antiPrune")}
\`\`\``);
            }

            if (activePage === "chat") {
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("💬 Sohbet & İçerik Korumaları")
                    .setDescription(`\`\`\`ansi
\u001b[1;36mİçerik Engelleri:\u001b[0m
  Linkler      :: ${ansiStatus("linkEngel")}
  Davetler     :: ${ansiStatus("inviteEngel")}
  Küfürler     :: ${ansiStatus("kufurEngel")}
  Argolar      :: ${ansiStatus("argoEngel")}

\u001b[1;36mBiçim Engelleri:\u001b[0m
  Caps Lock    :: ${ansiStatus("capsEngel")}
  Tekrarlar    :: ${ansiStatus("duplicateEngel")}
  Satır Sınırı :: ${ansiStatus("lineLimitEngel")}
  Karakterler  :: ${ansiStatus("lengthLimitEngel")}

\u001b[1;36mSpam Engelleri:\u001b[0m
  Emoji        :: ${ansiStatus("emojiSpamEngel")}
  Etiket       :: ${ansiStatus("mentionSpamEngel")}
  Toplu Etiket :: ${ansiStatus("everyoneHereEngel")}
  Medya        :: ${ansiStatus("mediaSpamEngel")}
\`\`\``);
            }

            if (activePage === "raid") {
                const limitDays = getSetting(guildId, "accountAgeLimit");
                const limitRejoins = getSetting(guildId, "raidLimit");
                const limitTime = getSetting(guildId, "raidTime");
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("👥 Giriş Güvenliği & Raid Koruması")
                    .setDescription(`\`\`\`ansi
\u001b[1;36mGiriş Korumaları:\u001b[0m
  Hesap Yaşı   :: ${ansiStatus("accountAgeGuard")} (Sınır: ${limitDays} Gün)
  Avatar       :: ${ansiStatus("defaultAvatarGuard")}
  Raid Koruması:: ${ansiStatus("raidGuard")} (Sınır: ${limitRejoins} Giriş / ${limitTime} Sn)
  Kötü İsimler :: ${ansiStatus("usernameRegexGuard")}

\u001b[1;36mDoğrulama & Karantina:\u001b[0m
  Doğrulama    :: ${ansiStatus("buttonVerification")}
  Karantina    :: ${ansiStatus("autoQuarantine")}
\`\`\`
Değerleri özelleştirmek için aşağıdaki menüden seçim yapın.`);
            }

            if (activePage === "limits") {
                const limitTime = getSetting(guildId, "limitTime");
                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("⚙️ Yönetici Hız Limitleri")
                    .setDescription(`\`\`\`ansi
\u001b[1;36mEşik Değerleri (Zaman Dilimi: ${limitTime} Dakika):\u001b[0m
  Ban Sınırı   :: ${getSetting(guildId, "banLimit")} Adet
  Kick Sınırı  :: ${getSetting(guildId, "kickLimit")} Adet
  Kanal Silme  :: ${getSetting(guildId, "channelDeleteLimit")} Adet
  Rol Silme    :: ${getSetting(guildId, "roleDeleteLimit")} Adet
  Rol Verme    :: ${getSetting(guildId, "roleGiveLimit")} Adet
\`\`\`
Limit ve süre değerlerini tamamen özelleştirmek için aşağıdaki menüyü kullanın.`);
            }

            if (activePage === "logs") {
                const logCh = getSetting(guildId, "logChannelId") ? `<#${getSetting(guildId, "logChannelId")}>` : "🔴 Ayarlanmamış";
                const verifyRol = getSetting(guildId, "verifyRoleId") ? `<@&${getSetting(guildId, "verifyRoleId")}>` : "🔴 Ayarlanmamış";
                const quarantineRol = getSetting(guildId, "quarantineRoleId") ? `<@&${getSetting(guildId, "quarantineRoleId")}>` : "🔴 Ayarlanmamış";

                return new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle("📄 Sistem Log & Rol Konfigürasyonu")
                    .setDescription(`🔊 **Log Kanalı**: ${logCh}\n✅ **Doğrulama Rolü**: ${verifyRol}\n☣️ **Karantina Rolü**: ${quarantineRol}\n\nAyarları güncellemek için aşağıdaki dropdown menüyü seçin.`);
            }
        };

        const generateComponents = () => {
            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("page_server").setLabel("🖥️ Sunucu").setStyle(activePage === "server" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_chat").setLabel("💬 Sohbet").setStyle(activePage === "chat" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_raid").setLabel("👥 Giriş").setStyle(activePage === "raid" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_limits").setLabel("⚙️ Limitler").setStyle(activePage === "limits" ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("page_logs").setLabel("📄 Roller/Log").setStyle(activePage === "logs" ? ButtonStyle.Success : ButtonStyle.Primary)
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
                        .setPlaceholder("Rol/Log Konfigürasyonu Seçin")
                        .addOptions([
                            { label: "Log Kanalını Güncelle", value: "ch_log" },
                            { label: "Doğrulanmış Rolünü Güncelle", value: "role_verify" },
                            { label: "Karantina Rolünü Güncelle", value: "role_quarantine" }
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
            // Check Modal requirements first (Do not call i.deferUpdate() if showing Modal)
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
            await i.deferUpdate();

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
                } else if (action === "role_verify") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId("set_role_verify")
                            .setPlaceholder("Doğrulama rolünü seçin")
                    );
                } else if (action === "role_quarantine") {
                    selectRow = new ActionRowBuilder().addComponents(
                        new RoleSelectMenuBuilder()
                            .setCustomId("set_role_quarantine")
                            .setPlaceholder("Karantina rolünü seçin")
                    );
                }

                await interaction.editReply({
                    components: [generateComponents()[0], selectRow]
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
        await interaction.reply({ content: `✅ Limit değeri başarıyla güncellendi! Yeni değer: **${val}**`, ephemeral: true });
    },

    // ============================================
    // AUDIT LOG EVENTS & CHAT FILTERS
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

            const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 20, `Kanal oluşturuldu: ${channel.name}`, channel.guild);

            await channel.delete("Guard | İzinsiz Kanal Oluşturma").catch(() => {});
            await punishAdmin(channel.guild, executor, "İzinsiz Kanal Oluşturma", guildId);
        });

        // 2. Channel Delete Protection
        client.on("channelDelete", async channel => {
            if (!channel.guild) return;
            const guildId = channel.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiChannelDelete")) return;

            const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 25, `Kanal silindi: ${channel.name}`, channel.guild);

            await punishAdmin(channel.guild, executor, "İzinsiz Kanal Silme", guildId);

            await channel.guild.channels.create({
                name: channel.name,
                type: channel.type,
                parent: channel.parentId,
                topic: channel.topic,
                nsfw: channel.nsfw,
                rateLimitPerUser: channel.rateLimitPerUser,
                permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({
                    id: o.id,
                    allow: o.allow.toArray(),
                    deny: o.deny.toArray()
                }))
            }).catch(() => {});
        });

        // 3. Channel Update Protection
        client.on("channelUpdate", async (oldChannel, newChannel) => {
            if (!newChannel.guild) return;
            const guildId = newChannel.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiChannelUpdate")) return;

            const logs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === newChannel.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 15, `Kanal güncellendi: ${newChannel.name}`, newChannel.guild);

            await punishAdmin(newChannel.guild, executor, "İzinsiz Kanal Güncelleme", guildId);

            await newChannel.edit({
                name: oldChannel.name,
                topic: oldChannel.topic,
                nsfw: oldChannel.nsfw,
                parent: oldChannel.parentId,
                rateLimitPerUser: oldChannel.rateLimitPerUser,
                permissionOverwrites: oldChannel.permissionOverwrites.cache.map(o => ({
                    id: o.id,
                    allow: o.allow.toArray(),
                    deny: o.deny.toArray()
                }))
            }).catch(() => {});
        });

        // 4. Role Create Protection
        client.on("roleCreate", async role => {
            if (!role.guild) return;
            const guildId = role.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleCreate")) return;

            const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === role.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 20, `Rol oluşturuldu: ${role.name}`, role.guild);

            await role.delete("Guard | İzinsiz Rol Oluşturma").catch(() => {});
            await punishAdmin(role.guild, executor, "İzinsiz Rol Oluşturma", guildId);
        });

        // 5. Role Delete Protection
        client.on("roleDelete", async role => {
            if (!role.guild) return;
            const guildId = role.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleDelete")) return;

            const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === role.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 25, `Rol silindi: ${role.name}`, role.guild);

            await punishAdmin(role.guild, executor, "İzinsiz Rol Silme", guildId);

            await role.guild.roles.create({
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                permissions: role.permissions,
                position: role.position
            }).catch(() => {});
        });

        // 6. Role Update Protection
        client.on("roleUpdate", async (oldRole, newRole) => {
            if (!newRole.guild) return;
            const guildId = newRole.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (!isFeatureEnabled(guildId, "antiRoleUpdate")) return;

            const logs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === newRole.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield || oldRole.name !== newRole.name) {
                increaseThreat(guildId, 20, `Rol güncellendi: ${newRole.name}`, newRole.guild);
                await punishAdmin(newRole.guild, executor, "İzinsiz Rol Güncelleme", guildId);
                await newRole.edit({
                    name: oldRole.name,
                    color: oldRole.color,
                    hoist: oldRole.hoist,
                    mentionable: oldRole.mentionable,
                    permissions: oldRole.permissions
                }).catch(() => {});
            }
        });

        // 7. Webhook & Integration Protections
        client.on("webhookUpdate", async channel => {
            if (!channel.guild) return;
            const guildId = channel.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            const logs = await channel.guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;

            let actionType = "";
            if (entry.action === AuditLogEvent.WebhookCreate && isFeatureEnabled(guildId, "antiWebhookCreate")) actionType = "Webhook Oluşturma";
            else if (entry.action === AuditLogEvent.WebhookDelete && isFeatureEnabled(guildId, "antiWebhookDelete")) actionType = "Webhook Silme";
            else if (entry.action === AuditLogEvent.WebhookUpdate && isFeatureEnabled(guildId, "antiWebhookUpdate")) actionType = "Webhook Güncelleme";

            if (!actionType) return;

            const executor = entry.executor;
            if (executor.id === channel.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 15, `Webhook ihlali: ${actionType}`, channel.guild);

            await punishAdmin(channel.guild, executor, `İzinsiz ${actionType}`, guildId);

            if (entry.action === AuditLogEvent.WebhookCreate) {
                const webhooks = await channel.fetchWebhooks().catch(() => null);
                if (webhooks) {
                    const target = webhooks.first();
                    if (target) await target.delete().catch(() => {});
                }
            }
        });

        // 8. Bot Ekleme, Karantina & Giriş Korumaları
        client.on("guildMemberAdd", async member => {
            if (!member.guild) return;
            const guildId = member.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            // Anti-Bot Ekleme
            if (member.user.bot && isFeatureEnabled(guildId, "antiBotAdd")) {
                const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
                if (logs) {
                    const entry = logs.entries.first();
                    if (entry) {
                        const executor = entry.executor;
                        if (executor.id !== member.guild.ownerId && executor.id !== client.user.id) {
                            const guvenliListe = global.guvenliListes.get(guildId) || [];
                            if (!guvenliListe.includes(executor.id)) {
                                increaseThreat(guildId, 30, `Sunucuya izinsiz bot eklendi: ${member.user.tag}`, member.guild);
                                await member.kick("Guard | İzinsiz Bot").catch(() => {});
                                await punishAdmin(member.guild, executor, "İzinsiz Bot Ekleme", guildId);
                            }
                        }
                    }
                }
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
                        await sendGuardLog(member.guild, member.user, null, `Yeni Hesap Koruması (${diffDays} günlük hesap)`, "Sunucudan Atıldı", guildId);
                        await member.kick("Guard | Yeni Hesap Koruması").catch(() => {});
                        return;
                    }
                }

                // Varsayılan Avatar
                if (isFeatureEnabled(guildId, "defaultAvatarGuard") && !member.user.avatar) {
                    increaseThreat(guildId, 10, "Avatar Olmayan Hesap Katılımı", member.guild);
                    await sendGuardLog(member.guild, member.user, null, "Varsayılan Avatar Koruması", "Sunucudan Atıldı", guildId);
                    await member.kick("Guard | Varsayılan Avatar Koruması").catch(() => {});
                    return;
                }

                // Kötü İsim Koruması
                if (isFeatureEnabled(guildId, "usernameRegexGuard")) {
                    const badNameRegex = /(https?:\/\/|discord\.gg\/|www\.)/gi;
                    if (badNameRegex.test(member.user.username) || badNameRegex.test(member.user.displayName)) {
                        increaseThreat(guildId, 15, "Reklamlı İsim Katılımı", member.guild);
                        await sendGuardLog(member.guild, member.user, null, "Profil İsim Koruması (Reklam/Link)", "Sunucudan Atıldı", guildId);
                        await member.kick("Guard | Kötü Profil Adı").catch(() => {});
                        return;
                    }
                }

                // Karantina veya Doğrulama Rolü Verme
                if (isFeatureEnabled(guildId, "buttonVerification") || isFeatureEnabled(guildId, "autoQuarantine")) {
                    const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                    if (quarantineRolId) {
                        await member.roles.add(quarantineRolId).catch(() => {});
                        if (isFeatureEnabled(guildId, "autoQuarantine")) {
                            await sendGuardLog(member.guild, member.user, null, "Otomatik Karantina", "Karantina Rolü Verildi", guildId);
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

            const logs = await newGuild.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === newGuild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            increaseThreat(guildId, 30, "Sunucu ayarları güncellendi", newGuild);

            await punishAdmin(newGuild, executor, "İzinsiz Sunucu Ayarları Güncelleme", guildId);

            await newGuild.edit({
                name: oldGuild.name,
                icon: oldGuild.iconURL(),
                banner: oldGuild.bannerURL(),
                splash: oldGuild.splashURL()
            }).catch(() => {});
        });

        // 10. Audit Log Üye Yasaklama Limitleri
        client.on("guildBanAdd", async ban => {
            const guildId = ban.guild.id;
            if (!global.guardDurums.get(guildId)) return;

            const limitMax = getSetting(guildId, "banLimit");
            const limitMinutes = getSetting(guildId, "limitTime") || 5;

            const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry) return;
            const executor = entry.executor;
            if (executor.id === ban.guild.ownerId || executor.id === client.user.id) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(executor.id)) return;

            const exceeded = checkRateLimit(guildId, executor.id, "banLimit", limitMax, limitMinutes);
            if (exceeded) {
                increaseThreat(guildId, 40, `Yönetici ban limitini aştı: ${executor.tag}`, ban.guild);
                await punishAdmin(ban.guild, executor, `Yönetici Ban Limitini Aşma (Limit: ${limitMax})`, guildId);
                await ban.guild.members.unban(ban.user.id, "Guard | Limit Aşımı Koruması").catch(() => {});
            }
        });

        // 11. Sohbet Filtreleri ve İletiler
        client.on("messageCreate", async message => {
            if (!message.guild) return;
            const guildId = message.guild.id;
            if (!global.guardDurums.get(guildId)) return;
            if (message.author.bot) return;

            const guvenliListe = global.guvenliListes.get(guildId) || [];
            if (guvenliListe.includes(message.author.id)) return;

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
