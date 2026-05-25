const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('anket')
        .setDescription('Anket oluşturur')
        .addStringOption(option =>
            option.setName('soru')
                .setDescription('Anket sorusu')
                .setRequired(true)),

    async execute(interaction) {

        const soru = interaction.options.getString('soru');

        const mesaj = await interaction.reply({
            content: `📊 **Anket:** ${soru}`,
            fetchReply: true
        });

        await mesaj.react('👍');
        await mesaj.react('👎');
    }
};
