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
const { settings, updateSettings } = require('../db.js');

// =========================================================

const TICKET_TURLERI = [
  {
    id: 'genel',
    label: 'Genel Destek',
    emoji: '🎫',
    renk: 0x5865f2,
    kanalAdi: 'genel-destek',
  },
  {
    id: 'teknik',
    label: 'Teknik Destek',
    emoji: '🔧',
    renk: 0x57f287,
    kanalAdi: 'teknik-destek',
  },
  {
    id: 'sikayet',
    label: 'Şikayet',
    emoji: '📋',
    renk: 0xfee75c,
    kanalAdi: 'sikayet',
  },
  {
    id: 'ban_itiraz',
    label: 'Ban İtiraz',
    emoji: '🔨',
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

    settings.set('ticketKategori', kategori.id);
    settings.set('ticketYetkiliRol', yetkiliRol.id);
    settings.set('ticketLogKanal', logKanal.id);

    await updateSettings({
      ticket_kategori: kategori.id,
      ticket_yetkili_rol: yetkiliRol.id,
      ticket_log_kanal: logKanal.id
    });

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Ticket Paneli Kur');

    const mesajInput = new TextInputBuilder()
      .setCustomId('ticket_mesaj')
      .setLabel('Panel mesajını yaz')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const resimInput = new TextInputBuilder()
      .setCustomId('ticket_resim')
      .setLabel('Resim URL (opsiyonel)')
      .setStyle(TextInputStyle.Short)
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
        .setLabel('Ban sebebi')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const itirazInput = new TextInputBuilder()
        .setCustomId('ban_itiraz_metni')
        .setLabel('İtirazın')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sebepInput),
        new ActionRowBuilder().addComponents(itirazInput),
      );

      return interaction.showModal(modal);
    }

    await this._kanalAc(interaction, tur);
  },

  async handleBanItirazModal(interaction) {

    const tur =
      TICKET_TURLERI.find(
        t => t.id === 'ban_itiraz'
      );

    await this._kanalAc(
      interaction,
      tur
    );
  },

  async _kanalAc(interaction, tur) {

    const guild = interaction.guild;
    const user  = interaction.user;

    const ticketKategori = settings.get('ticketKategori');
    const ticketYetkiliRol = settings.get('ticketYetkiliRol');
    const ticketLogKanal = settings.get('ticketLogKanal');

    if (!ticketKategori || !ticketYetkiliRol) {
      return interaction.reply({
        content: '❌ Ticket sistemi henüz kurulmamış veya veritabanında ayarlar eksik! Lütfen önce `/ticket-kur` komutunu çalıştırarak paneli tekrar kurun.',
        ephemeral: true
      });
    }

    const aktifTicket = guild.channels.cache.find(c =>
      c.parentId === ticketKategori &&
      c.permissionOverwrites.cache.has(user.id)
    );

    if (aktifTicket) {

      return interaction.reply({
        content:
          `❌ Zaten açık bir ticketin var → <#${aktifTicket.id}>`,
        ephemeral: true,
      });
    }

    const permissionOverwrites = [
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
      }
    ];

    if (ticketYetkiliRol) {
      permissionOverwrites.push({
        id: ticketYetkiliRol,
        allow: [
          'ViewChannel',
          'SendMessages',
          'ReadMessageHistory',
          'ManageMessages'
        ]
      });
    }

    const kanal = await guild.channels.create({

      name:
        `${tur.kanalAdi}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,

      type: ChannelType.GuildText,

      parent: ticketKategori,

      permissionOverwrites: permissionOverwrites,
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
        `<@${user.id}> <@&${ticketYetkiliRol}>`,

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
      guild.channels.cache.get(ticketLogKanal);

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

  async handleSahiplen(interaction) {

    const ticketYetkiliRol = settings.get('ticketYetkiliRol');

    if (
      !interaction.member.roles.cache.has(ticketYetkiliRol)
    ) {
      return interaction.reply({
        content: '❌ Bunun için yetkin yok.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(
        `👤 Ticket ${interaction.user} tarafından sahiplenildi.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  },

  async handleEkle(interaction) {

    const modal = new ModalBuilder()
      .setCustomId('ticket_ekle_modal')
      .setTitle('Tickete Kullanıcı Ekle');

    const userInput = new TextInputBuilder()
      .setCustomId('eklencek_user')
      .setLabel('Kullanıcı ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Kullanıcı ID gir')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        userInput
      )
    );

    await interaction.showModal(modal);
  },

  async handleEkleModal(interaction) {

    const userId =
      interaction.fields.getTextInputValue(
        'eklencek_user'
      );

    try {

      const member =
        await interaction.guild.members.fetch(userId);

      await interaction.channel.permissionOverwrites.edit(member.id, {

        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,

      });

      await interaction.reply({
        content:
          `✅ <@${member.id}> tickete eklendi.`,
      });

    } catch {

      await interaction.reply({
        content:
          '❌ Geçersiz kullanıcı IDsi girdin.',
        ephemeral: true,
      });
    }
  },

  async handleKapat(interaction) {

    const kanal = interaction.channel;
    const ticketLogKanal = settings.get('ticketLogKanal');

    const logKanal =
      interaction.guild.channels.cache.get(ticketLogKanal);

    if (logKanal) {

      const logEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔒 Ticket Kapatıldı')
        .addFields(
          {
            name: '👤 Kapatan',
            value: `${interaction.user}`,
          },
          {
            name: '📄 Kanal',
            value: `${interaction.channel.name}`,
          }
        )
        .setTimestamp();

      logKanal.send({
        embeds: [logEmbed]
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔒 Ticket Kapatılıyor...')
      .setDescription(
        `Ticket <@${interaction.user.id}> tarafından kapatıldı.\nKanal 5 saniye içinde silinecek.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });

    setTimeout(() => {

      kanal.delete().catch(() => {});

    }, 5000);
  },
};
