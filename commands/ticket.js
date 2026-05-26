const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// ===================== GLOBAL AYARLAR =====================

global.ticketKategori = null;
global.ticketYetkiliRol = null;
global.ticketLogKanal = null;

// =========================================================

const TICKET_TURLERI = [
  {
    id: 'genel',
    label: 'Genel Destek',
    emoji: '🎫',
    aciklama: 'Genel sorunlarınız için destek alın.',
    renk: 0x5865f2,
    kanalAdi: 'genel-destek',
  },
  {
    id: 'teknik',
    label: 'Teknik Destek',
    emoji: '🔧',
    aciklama: 'Teknik sorunlarınız için destek alın.',
    renk: 0x57f287,
    kanalAdi: 'teknik-destek',
  },
  {
    id: 'sikayet',
    label: 'Şikayet',
    emoji: '📋',
    aciklama: 'Şikayetlerinizi buradan iletebilirsiniz.',
    renk: 0xfee75c,
    kanalAdi: 'sikayet',
  },
  {
    id: 'ban_itiraz',
    label: 'Ban İtiraz',
    emoji: '🔨',
    aciklama: 'Ban kararına itiraz etmek için açın.',
    renk: 0xed4245,
    kanalAdi: 'ban-itiraz',
  },
];

module.exports = {

  data: new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Ticket panelini kurar')

    .addChannelOption(option =>
      option
        .setName('kategori')
        .setDescription('Ticket kategorisi')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )

    .addRoleOption(option =>
      option
        .setName('yetkili_rol')
        .setDescription('Yetkili rolü')
        .setRequired(true)
    )

    .addChannelOption(option =>
      option
        .setName('log_kanal')
        .setDescription('Log kanalı')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )

    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  async execute(interaction) {

    const kategori =
      interaction.options.getChannel('kategori');

    const yetkiliRol =
      interaction.options.getRole('yetkili_rol');

    const logKanal =
      interaction.options.getChannel('log_kanal');

    global.ticketKategori = kategori.id;
    global.ticketYetkiliRol = yetkiliRol.id;
    global.ticketLogKanal = logKanal.id;

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Ticket Paneli Kur');

    const mesajInput = new TextInputBuilder()
      .setCustomId('ticket_mesaj')
      .setLabel('Panel mesajını buraya yaz')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('🎫 Turkey Bus Simulator\n\nDestek almak için aşağıdaki butonlardan kategori seç.')
      .setRequired(true)
      .setMaxLength(2000);

    const resimInput = new TextInputBuilder()
      .setCustomId('ticket_resim')
      .setLabel('Resim URL (opsiyonel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://...')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(mesajInput),
      new ActionRowBuilder().addComponents(resimInput),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {

    const mesaj =
      interaction.fields.getTextInputValue('ticket_mesaj');

    const resimUrl =
      interaction.fields.getTextInputValue('ticket_resim') || null;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(mesaj)
      .setTimestamp();

    if (resimUrl) embed.setImage(resimUrl);

    const butonlar = TICKET_TURLERI.map(tur =>
      new ButtonBuilder()
        .setCustomId(`ticket_ac_${tur.id}`)
        .setLabel(tur.label)
        .setEmoji(tur.emoji)
        .setStyle(
          tur.id === 'ban_itiraz'
            ? ButtonStyle.Danger
            : ButtonStyle.Success
        )
    );

    const satirlar = [];

    for (let i = 0; i < butonlar.length; i += 3) {

      satirlar.push(
        new ActionRowBuilder().addComponents(
          butonlar.slice(i, i + 3)
        )
      );
    }

    await interaction.channel.send({
      embeds: [embed],
      components: satirlar
    });

    await interaction.reply({
      content: '✅ Ticket paneli kuruldu!',
      ephemeral: true
    });
  },

  async handleButton(interaction) {

    const turId =
      interaction.customId.replace(
        'ticket_ac_',
        ''
      );

    const tur =
      TICKET_TURLERI.find(
        t => t.id === turId
      );

    if (!tur) return;

    if (tur.id === 'ban_itiraz') {

      const modal = new ModalBuilder()
        .setCustomId('ban_itiraz_modal')
        .setTitle('Ban İtiraz Formu');

      const sebepInput = new TextInputBuilder()
        .setCustomId('ban_sebep')
        .setLabel('Neden banlandığını düşünüyorsun?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const itirazInput = new TextInputBuilder()
        .setCustomId('ban_itiraz_metni')
        .setLabel('İtiraz gerekçen nedir?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sebepInput),
        new ActionRowBuilder().addComponents(itirazInput),
      );

      return interaction.showModal(modal);
    }

    await this._kanalAc(interaction, tur, null);
  },

  async handleBanItirazModal(interaction) {

    const tur =
      TICKET_TURLERI.find(
        t => t.id === 'ban_itiraz'
      );

    await this._kanalAc(
      interaction,
      tur,
      null
    );
  },

  async _kanalAc(interaction, tur) {

    const guild = interaction.guild;
    const user  = interaction.user;

    const aktifTicket = guild.channels.cache.find(c =>
      c.parentId === global.ticketKategori &&
      c.permissionOverwrites.cache.has(user.id)
    );

    if (aktifTicket) {

      return interaction.reply({
        content:
          `❌ Zaten açık bir ticketin var → <#${aktifTicket.id}>`,
        ephemeral: true,
      });
    }

    const kanal = await guild.channels.create({

      name:
        `${tur.kanalAdi}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,

      type: ChannelType.GuildText,

      parent: global.ticketKategori,

      permissionOverwrites: [

        {
          id: guild.roles.everyone,
          deny: ['ViewChannel']
        },

        {
          id: user.id,
          allow: [
            'ViewChannel',
            'SendMessages',
            'ReadMessageHistory'
          ]
        },

        {
          id: global.ticketYetkiliRol,
          allow: [
            'ViewChannel',
            'SendMessages',
            'ReadMessageHistory',
            'ManageMessages'
          ]
        },
      ],
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor(tur.renk)
      .setTitle(`${tur.emoji} ${tur.label}`)
      .setDescription(
        `👋 Hoş geldin <@${user.id}>`
      )
      .setTimestamp();

    const sahiplen = new ButtonBuilder()
      .setCustomId('ticket_sahiplen')
      .setLabel('👤 Sahiplen')
      .setStyle(ButtonStyle.Primary);

    const ekle = new ButtonBuilder()
      .setCustomId('ticket_ekle')
      .setLabel('➕ Kullanıcı Ekle')
      .setStyle(ButtonStyle.Success);

    const kapat = new ButtonBuilder()
      .setCustomId('ticket_kapat')
      .setLabel('🔒 Ticketı Kapat')
      .setStyle(ButtonStyle.Danger);

    await kanal.send({

      content:
        `<@${user.id}> <@&${global.ticketYetkiliRol}>`,

      embeds: [ticketEmbed],

      components: [
        new ActionRowBuilder().addComponents(
          sahiplen,
          ekle,
          kapat
        )
      ],
    });

    const logKanal =
      guild.channels.cache.get(
        global.ticketLogKanal
      );

    if (logKanal) {

      const logEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎫 Ticket Açıldı')
        .addFields(
          {
            name: '👤 Kullanıcı',
            value: `${user}`,
          },
          {
            name: '📂 Tür',
            value: tur.label,
          }
        )
        .setTimestamp();

      logKanal.send({
        embeds: [logEmbed]
      });
    }

    await interaction.reply({
      content:
        `✅ Ticket oluşturuldu → <#${kanal.id}>`,
      ephemeral: true,
    });
  },
};
