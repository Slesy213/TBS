const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

function parseTime(time) {

    const match = time.match(/^(\d+)(s|m|h|d)$/);

    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {

        case 's':
            return value * 1000;

        case 'm':
            return value * 60 * 1000;

        case 'h':
            return value * 60 * 60 * 1000;

        case 'd':
            return value * 24 * 60 * 60 * 1000;

        default:
            return null;
    }
}

module.exports = {

    data: new SlashCommandBuilder()

        .setName('çekiliş')
        .setDescription('Profesyonel çekiliş sistemi')

        // SADECE YETKİLİLER KULLANABİLİR
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )

        .addStringOption(option =>
            option
                .setName('ödül')
                .setDescription('Çekiliş ödülü')
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('süre')
                .setDescription('Örn: 10m, 2h, 1d')
                .setRequired(true)
        )

        .addIntegerOption(option =>
            option
                .setName('kazanan')
                .setDescription('Kaç kişi kazanacak')
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('açıklama')
                .setDescription('Çekiliş açıklaması')
                .setRequired(false)
        ),

    async execute(interaction) {

        // EXTRA GÜVENLİK
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return interaction.reply({
                content:
                    '❌ Bu komutu kullanamazsın!',
                ephemeral: true
            });
        }

        const odul =
            interaction.options.getString('ödül');

        const sureText =
            interaction.options.getString('süre');

        const kazananSayi =
            interaction.options.getInteger('kazanan');

        const aciklama =
            interaction.options.getString('açıklama') ||
            'Açıklama belirtilmedi.';

        const sure = parseTime(sureText);

        if (!sure) {

            return interaction.reply({

                content:
                    '❌ Geçerli süre gir!\nÖrnek: 10m, 2h, 1d',

                ephemeral: true
            });
        }

        const katilanlar = [];

        const embed = new EmbedBuilder()

            .setColor('Gold')

            .setTitle('🎉 Yeni Çekiliş!')

            .setThumbnail(
                interaction.guild.iconURL({
                    dynamic: true
                })
            )

            .setDescription(
`🎁 **Ödül:** ${odul}

📝 **Açıklama:** ${aciklama}

⏰ **Süre:** ${sureText}

👥 **Kazanan Sayısı:** ${kazananSayi}

🎟️ Katılmak için aşağıdaki butona bas!`
            )

            .setFooter({
                text:
                    `Başlatan: ${interaction.user.username}`
            })

            .setTimestamp();

        const button = new ButtonBuilder()

            .setCustomId('cekilis_katil')

            .setLabel('Katıl 🎟️')

            .setStyle(ButtonStyle.Success);

        const row =
            new ActionRowBuilder()
                .addComponents(button);

        const mesaj =
            await interaction.reply({

                embeds: [embed],

                components: [row],

                fetchReply: true
            });

        const collector =
            mesaj.createMessageComponentCollector({
                time: sure
            });

        collector.on('collect', async i => {

            if (katilanlar.includes(i.user.id)) {

                return i.reply({

                    content:
                        '❌ Zaten çekilişe katıldın!',

                    ephemeral: true
                });
            }

            katilanlar.push(i.user.id);

            i.reply({

                content:
                    '✅ Çekilişe başarıyla katıldın!',

                ephemeral: true
            });
        });

        collector.on('end', async () => {

            await mesaj.edit({
                components: []
            });

            if (katilanlar.length === 0) {

                return interaction.followUp({

                    content:
                        '❌ Çekilişe kimse katılmadı.'
                });
            }

            const kazananlar = [];

            while (

                kazananlar.length < kazananSayi &&

                kazananlar.length < katilanlar.length

            ) {

                const randomUser =
                    katilanlar[
                        Math.floor(
                            Math.random() *
                            katilanlar.length
                        )
                    ];

                if (
                    !kazananlar.includes(randomUser)
                ) {

                    kazananlar.push(randomUser);
                }
            }

            const sonucEmbed =
                new EmbedBuilder()

                    .setColor('Green')

                    .setTitle(
                        '🎉 Çekiliş Sonuçlandı!'
                    )

                    .setDescription(
`🎁 **Ödül:** ${odul}

🏆 **Kazanan(lar):**
${kazananlar
    .map(id => `<@${id}>`)
    .join('\n')}

👥 Katılan Kişi Sayısı: ${katilanlar.length}`
                    )

                    .setTimestamp();

            interaction.followUp({
                embeds: [sonucEmbed]
            });
        });
    }
};
