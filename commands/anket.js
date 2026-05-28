const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

module.exports = {

    data: new SlashCommandBuilder()

        .setName('anket')

        .setDescription('Anket oluşturur')

        // SADECE YETKİLİLER KULLANABİLİR
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        )

        .addStringOption(option =>

            option
                .setName('soru')
                .setDescription('Anket sorusu')
                .setRequired(true)
        ),

    async execute(interaction) {

        // EXTRA GÜVENLİK
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageMessages
            )
        ) {

            return interaction.reply({

                content:
                    '❌ Bu komutu kullanamazsın!',

                ephemeral: true
            });
        }

        const soru =
            interaction.options.getString('soru');

        const embed = new EmbedBuilder()

            .setColor('Blue')

            .setTitle('📊 Yeni Anket')

            .setDescription(
                `❓ **Soru:**\n${soru}`
            )

            .setFooter({
                text:
                    `Başlatan: ${interaction.user.username}`
            })

            .setTimestamp();

        const mesaj =
            await interaction.reply({

                embeds: [embed],

                fetchReply: true
            });

        await mesaj.react('👍');

        await mesaj.react('👎');
    }
};
