const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AuditLogEvent,
    ChannelType
} = require("discord.js");
const { settings, updateSetting } = require("../db.js");

// Runtime cache — ayar değil, modül seviyesinde tutulur
const spamMap = new Map();

module.exports = {

    data: new SlashCommandBuilder()
        .setName("guard")
        .setDescription("Guard sistemini yönetir")

        .addStringOption(option =>
            option
                .setName("işlem")
                .setDescription("İşlem seç")
                .setRequired(true)
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
                .setDescription("Kullanıcı")
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {

        const islem =
            interaction.options.getString("işlem");

        const kullanici =
            interaction.options.getUser("kullanici");

        // =========================
        // GUARD AÇ
        // =========================

        if (islem === "ac") {

            settings.set("guardDurum", true);
            await updateSetting("guard_durum", true);

            return interaction.reply({
                content:
                    "🛡️ Guard sistemi aktif edildi."
            });
        }

        // =========================
        // GUARD KAPAT
        // =========================

        if (islem === "kapat") {

            settings.set("guardDurum", false);
            await updateSetting("guard_durum", false);

            return interaction.reply({
                content:
                    "❌ Guard sistemi kapatıldı."
            });
        }

        // =========================
        // GÜVENLİ EKLE
        // =========================

        if (islem === "guvenli-ekle") {

            if (!kullanici) {

                return interaction.reply({
                    content:
                        "❌ Kullanıcı belirt.",
                    ephemeral: true
                });
            }

            const liste = settings.get("guvenliListe");

            if (liste.includes(kullanici.id)) {

                return interaction.reply({
                    content:
                        "⚠️ Kullanıcı zaten güvenli listede.",
                    ephemeral: true
                });
            }

            liste.push(kullanici.id);
            settings.set("guvenliListe", liste);
            await updateSetting("guvenli_liste", liste);

            return interaction.reply({
                content:
                    `✅ ${kullanici.tag} güvenli listeye eklendi.`
            });
        }

        // =========================
        // GÜVENLİ ÇIKAR
        // =========================

        if (islem === "guvenli-cikar") {

            if (!kullanici) {

                return interaction.reply({
                    content:
                        "❌ Kullanıcı belirt.",
                    ephemeral: true
                });
            }

            const yeniListe = settings.get("guvenliListe")
                .filter(x => x !== kullanici.id);

            settings.set("guvenliListe", yeniListe);
            await updateSetting("guvenli_liste", yeniListe);

            return interaction.reply({
                content:
                    `✅ ${kullanici.tag} güvenli listeden çıkarıldı.`
            });
        }

        // =========================
        // GÜVENLİ LİSTE
        // =========================

        if (islem === "liste") {

            const liste = settings.get("guvenliListe");

            if (liste.length <= 0) {

                return interaction.reply({
                    content:
                        "📄 Güvenli liste boş."
                });
            }

            const listeStr = liste
                .map(id => `<@${id}>`)
                .join("\n");

            return interaction.reply({
                content:
                    `🛡️ Güvenli Liste:\n\n${listeStr}`
            });
        }
    },

    // =========================
    // EVENTLER
    // =========================

    init(client) {

        // =========================
        // LINK ENGEL
        // =========================

        client.on(
            "messageCreate",
            async message => {

                if (!settings.get("guardDurum")) return;
                if (message.author.bot) return;

                if (
                    settings.get("guvenliListe").includes(
                        message.author.id
                    )
                ) return;

                const linkRegex =
                    /(https?:\/\/|discord\.gg\/|www\.)/gi;

                if (
                    linkRegex.test(
                        message.content
                    )
                ) {

                    if (
                        message.member.permissions.has(
                            PermissionFlagsBits.Administrator
                        )
                    ) return;

                    await message.delete().catch(() => { });

                    await message.channel.send({
                        content:
                            `🚫 ${message.author} link paylaşamaz.`
                    });

                    await message.member.timeout(
                        300000,
                        "Link Koruması"
                    ).catch(() => { });
                }
            }
        );

        // =========================
        // SPAM KORUMA
        // =========================

        client.on(
            "messageCreate",
            async message => {

                if (!settings.get("guardDurum")) return;
                if (message.author.bot) return;

                if (
                    settings.get("guvenliListe").includes(
                        message.author.id
                    )
                ) return;

                const data =
                    spamMap.get(
                        message.author.id
                    ) || {
                        mesaj: 0
                    };

                data.mesaj++;

                spamMap.set(
                    message.author.id,
                    data
                );

                setTimeout(() => {

                    const d =
                        spamMap.get(
                            message.author.id
                        );

                    if (!d) return;

                    d.mesaj--;

                    spamMap.set(
                        message.author.id,
                        d
                    );

                }, 4000);

                if (data.mesaj >= 5) {

                    await message.member.timeout(
                        600000,
                        "Spam Koruması"
                    ).catch(() => { });

                    await message.channel.send({
                        content:
                            `🚫 ${message.author} spam yaptığı için susturuldu.`
                    });

                    spamMap.delete(
                        message.author.id
                    );
                }
            }
        );

        // =========================
        // KANAL SİLME KORUMA
        // =========================

        client.on(
            "channelDelete",
            async channel => {

                if (!settings.get("guardDurum")) return;

                const logs =
                    await channel.guild.fetchAuditLogs({
                        type:
                            AuditLogEvent.ChannelDelete,
                        limit: 1
                    });

                const entry =
                    logs.entries.first();

                if (!entry) return;

                const executor =
                    entry.executor;

                if (
                    executor.id ===
                    channel.guild.ownerId
                ) return;

                if (
                    settings.get("guvenliListe").includes(
                        executor.id
                    )
                ) return;

                const member =
                    await channel.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason:
                        "Guard | Kanal Silme"
                });

                // Kanal geri oluştur

                await channel.guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildText,
                    parent: channel.parentId
                }).catch(() => { });
            }
        );

        // =========================
        // ROL SİLME KORUMA
        // =========================

        client.on(
            "roleDelete",
            async role => {

                if (!settings.get("guardDurum")) return;

                const logs =
                    await role.guild.fetchAuditLogs({
                        type:
                            AuditLogEvent.RoleDelete,
                        limit: 1
                    });

                const entry =
                    logs.entries.first();

                if (!entry) return;

                const executor =
                    entry.executor;

                if (
                    executor.id ===
                    role.guild.ownerId
                ) return;

                if (
                    settings.get("guvenliListe").includes(
                        executor.id
                    )
                ) return;

                const member =
                    await role.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason:
                        "Guard | Rol Silme"
                });

                // Rol geri oluştur

                await role.guild.roles.create({
                    name: role.name,
                    color: role.color,
                    permissions:
                        role.permissions
                }).catch(() => { });
            }
        );

        // =========================
        // BOT EKLEME KORUMA
        // =========================

        client.on(
            "guildMemberAdd",
            async member => {

                if (!settings.get("guardDurum")) return;

                if (!member.user.bot) return;

                const logs =
                    await member.guild.fetchAuditLogs({
                        type:
                            AuditLogEvent.BotAdd,
                        limit: 1
                    });

                const entry =
                    logs.entries.first();

                if (!entry) return;

                const executor =
                    entry.executor;

                if (
                    executor.id ===
                    member.guild.ownerId
                ) return;

                if (
                    settings.get("guvenliListe").includes(
                        executor.id
                    )
                ) return;

                await member.kick(
                    "Guard Sistemi"
                );

                const yetkili =
                    await member.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!yetkili) return;

                await yetkili.roles.set([]);

                await yetkili.ban({
                    reason:
                        "Guard | İzinsiz Bot"
                });
            }
        );

        // =========================
        // SUNUCU GÜNCELLEME KORUMA
        // =========================

        client.on(
            "guildUpdate",
            async (oldGuild, newGuild) => {

                if (!settings.get("guardDurum")) return;

                const logs =
                    await newGuild.fetchAuditLogs({
                        type:
                            AuditLogEvent.GuildUpdate,
                        limit: 1
                    });

                const entry =
                    logs.entries.first();

                if (!entry) return;

                const executor =
                    entry.executor;

                if (
                    executor.id ===
                    newGuild.ownerId
                ) return;

                if (
                    settings.get("guvenliListe").includes(
                        executor.id
                    )
                ) return;

                const member =
                    await newGuild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason:
                        "Guard | Sunucu Güncelleme"
                });

                await newGuild.setName(
                    oldGuild.name
                ).catch(() => { });
            }
        );
    }
};
