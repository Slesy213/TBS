const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AuditLogEvent
} = require("discord.js");

global.guardDurum = false;
global.guvenliListe = [];

module.exports = {

    data: new SlashCommandBuilder()
        .setName("guard")
        .setDescription("Guard sistemini yönetir")

        .addStringOption(option =>
            option
                .setName("işlem")
                .setDescription("Yapılacak işlem")
                .setRequired(true)
                .addChoices(
                    { name: "Aç", value: "ac" },
                    { name: "Kapat", value: "kapat" },
                    { name: "Güvenli Liste Ekle", value: "guvenli-ekle" },
                    { name: "Güvenli Liste Çıkar", value: "guvenli-cikar" },
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

    async execute(interaction, client) {

        const islem =
            interaction.options.getString("işlem");

        const kullanici =
            interaction.options.getUser("kullanici");

        // =========================
        // GUARD AÇ
        // =========================

        if (islem === "ac") {

            if (global.guardDurum) {

                return interaction.reply({
                    content: "⚠️ Guard zaten aktif.",
                    ephemeral: true
                });
            }

            global.guardDurum = true;

            await interaction.reply({
                content: "🛡️ Guard sistemi aktif edildi."
            });

            return;
        }

        // =========================
        // GUARD KAPAT
        // =========================

        if (islem === "kapat") {

            global.guardDurum = false;

            return interaction.reply({
                content: "❌ Guard sistemi kapatıldı."
            });
        }

        // =========================
        // GÜVENLİ EKLE
        // =========================

        if (islem === "guvenli-ekle") {

            if (!kullanici) {

                return interaction.reply({
                    content: "❌ Kullanıcı belirt.",
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
                    content: "❌ Kullanıcı belirt.",
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
        // LİSTE
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
    }
};

// =========================
// GUARD EVENTS
// =========================

module.exports.events = (client) => {

    // =========================
    // KANAL SİLME
    // =========================

    client.on(
        "channelDelete",
        async (channel) => {

            if (!global.guardDurum) return;

            const logs =
                await channel.guild.fetchAuditLogs({
                    type: AuditLogEvent.ChannelDelete,
                    limit: 1
                });

            const entry =
                logs.entries.first();

            if (!entry) return;

            const executor =
                entry.executor;

            // OWNER KORUMA

            if (
                executor.id ===
                channel.guild.ownerId
            ) return;

            // GÜVENLİ LİSTE

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

            try {

                await member.roles.set([]);

                await member.ban({
                    reason:
                        "Guard | Kanal Silme"
                });

                channel.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} kanal sildiği için banlandı.`
                });

            } catch {}
        }
    );

    // =========================
    // ROL SİLME
    // =========================

    client.on(
        "roleDelete",
        async (role) => {

            if (!global.guardDurum) return;

            const logs =
                await role.guild.fetchAuditLogs({
                    type: AuditLogEvent.RoleDelete,
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

            try {

                await member.roles.set([]);

                await member.ban({
                    reason:
                        "Guard | Rol Silme"
                });

                role.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} rol sildiği için banlandı.`
                });

            } catch {}
        }
    );

    // =========================
    // BOT EKLEME
    // =========================

    client.on(
        "guildMemberAdd",
        async (member) => {

            if (!global.guardDurum) return;

            if (!member.user.bot) return;

            const logs =
                await member.guild.fetchAuditLogs({
                    type: AuditLogEvent.BotAdd,
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

            try {

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

                member.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} izinsiz bot eklediği için banlandı.`
                });

            } catch {}
        }
    );
};
