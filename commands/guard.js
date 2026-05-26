const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AuditLogEvent,
    ChannelType
} = require("discord.js");

global.guardDurum = false;
global.guvenliListe = [];
global.spamMap = new Map();

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

            global.guardDurum = true;

            return interaction.reply({
                content:
                    "🛡️ Guard sistemi aktif edildi."
            });
        }

        // =========================
        // GUARD KAPAT
        // =========================

        if (islem === "kapat") {

            global.guardDurum = false;

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

            if (
                global.guvenliListe.includes(
                    kullanici.id
                )
            ) {

                return interaction.reply({
                    content:
                        "⚠️ Kullanıcı zaten güvenli listede.",
                    ephemeral: true
                });
            }

            global.guvenliListe.push(
                kullanici.id
            );

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

            global.guvenliListe =
                global.guvenliListe.filter(
                    x => x !== kullanici.id
                );

            return interaction.reply({
                content:
                    `✅ ${kullanici.tag} güvenli listeden çıkarıldı.`
            });
        }

        // =========================
        // GÜVENLİ LİSTE
        // =========================

        if (islem === "liste") {

            if (
                global.guvenliListe.length <= 0
            ) {

                return interaction.reply({
                    content:
                        "📄 Güvenli liste boş."
                });
            }

            const liste =
                global.guvenliListe
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

                if (!global.guardDurum) return;
                if (message.author.bot) return;

                if (
                    global.guvenliListe.includes(
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

                if (!global.guardDurum) return;
                if (message.author.bot) return;

                if (
                    global.guvenliListe.includes(
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

                if (!global.guardDurum) return;

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
                    global.guvenliListe.includes(
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

                if (!global.guardDurum) return;

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
                    global.guvenliListe.includes(
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

                if (!global.guardDurum) return;

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
                    global.guvenliListe.includes(
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

                if (!global.guardDurum) return;

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
                    global.guvenliListe.includes(
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
