const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('temizle')
        .setDescription('Mesaj temizler')
        .addIntegerOption(option =>
            option.setName('miktar')
                .setDescription('Silinecek mesaj sayısı')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {

        const miktar = interaction.options.getInteger('miktar');

        if (miktar > 100 || miktar < 1) {
            return interaction.reply({
                content: '1 ile 100 arasında sayı gir.',
                ephemeral: true
            });
        }

        await interaction.channel.bulkDelete(miktar, true);

        interaction.reply({
            content: `🗑️ ${miktar} mesaj silindi.`,
            ephemeral: true
        });
    }
};
