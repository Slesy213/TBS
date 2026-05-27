const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AuditLogEvent,
    ChannelType
} = require("discord.js");
const { updateSetting } = require("../db.js");

global.guardDurums = global.guardDurums || new Map();
global.guvenliListes = global.guvenliListes || new Map();
global.spamMap = global.spamMap || new Map();

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

        const guildId = interaction.guild.id;

        // =========================
        // GUARD AÇ
        // =========================

        if (islem === "ac") {

            global.guardDurums.set(guildId, true);
            await updateSetting(guildId, "guard_durum", true);

            return interaction.reply({
                content:
                    "🛡️ Guard sistemi aktif edildi."
            });
        }

        // =========================
        // GUARD KAPAT
        // =========================

        if (islem === "kapat") {

            global.guardDurums.set(guildId, false);
            await updateSetting(guildId, "guard_durum", false);

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

            let guvenliListe = global.guvenliListes.get(guildId) || [];

            if (
                guvenliListe.includes(
                    kullanici.id
                )
            ) {

                return interaction.reply({
                    content:
                        "⚠️ Kullanıcı zaten güvenli listede.",
                    ephemeral: true
                });
            }

            guvenliListe.push(
                kullanici.id
            );
            global.guvenliListes.set(guildId, guvenliListe);
            await updateSetting(guildId, "guvenli_liste", guvenliListe);

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

            let guvenliListe = global.guvenliListes.get(guildId) || [];
            guvenliListe =
                guvenliListe.filter(
                    x => x !== kullanici.id
                );
            global.guvenliListes.set(guildId, guvenliListe);
            await updateSetting(guildId, "guvenli_liste", guvenliListe);

            return interaction.reply({
                content:
                    `✅ ${kullanici.tag} güvenli listeden çıkarıldı.`
            });
        }

        // =========================
        // GÜVENLİ LİSTE
        // =========================

        if (islem === "liste") {

            const guvenliListe = global.guvenliListes.get(guildId) || [];

            if (
                guvenliListe.length <= 0
            ) {

                return interaction.reply({
                    content:
                        "📄 Güvenli liste boş."
                });
            }

            const liste =
                guvenliListe
                    .map(id => `<@${id}>`)
                    .join("\n");

            return interaction.reply({
                content:
                    `🛡️ Güvenli Liste:\n\n${liste}`
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
                if (!message.guild) return;
                const guildId = message.guild.id;

                if (!global.guardDurums.get(guildId)) return;
                if (message.author.bot) return;

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
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
                if (!message.guild) return;
                const guildId = message.guild.id;

                if (!global.guardDurums.get(guildId)) return;
                if (message.author.bot) return;

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
                        message.author.id
                    )
                ) return;

                const data =
                    global.spamMap.get(
                        message.author.id
                    ) || {
                        mesaj: 0
                    };

                data.mesaj++;

                global.spamMap.set(
                    message.author.id,
                    data
                );

                setTimeout(() => {

                    const d =
                        global.spamMap.get(
                            message.author.id
                        );

                    if (!d) return;

                    d.mesaj--;

                    global.spamMap.set(
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

                    global.spamMap.delete(
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
                if (!channel.guild) return;
                const guildId = channel.guild.id;

                if (!global.guardDurums.get(guildId)) return;

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

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
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
                if (!role.guild) return;
                const guildId = role.guild.id;

                if (!global.guardDurums.get(guildId)) return;

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

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
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
                if (!member.guild) return;
                const guildId = member.guild.id;

                if (!global.guardDurums.get(guildId)) return;

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

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
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
                if (!newGuild) return;
                const guildId = newGuild.id;

                if (!global.guardDurums.get(guildId)) return;

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

                const guvenliListe = global.guvenliListes.get(guildId) || [];
                if (
                    guvenliListe.includes(
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
