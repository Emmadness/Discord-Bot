require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits, 
  ChannelType 
} = require('index.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// IDs de usuarios y roles permitidos
const allowedUsers = ['640315344916840478', '192746644939210763'];
const allowedRoles = ['1411835087120629952', '1386877603130114098', '1386877176124674109'];
const lastEmbeds = new Map();

// Roles que tendrán acceso a tickets
const staffRoles = ['1411835087120629952', '1386877603130114098'];

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
});

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName('test').setDescription('Prueba el bot'),
    new SlashCommandBuilder().setName('training').setDescription('Nuevo training').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('join').setDescription('Nuevo conductor').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('media').setDescription('Se une al Media Team').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('hr').setDescription('Se une a Human Resources').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('Se une como Staff (Admin)').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('staff').setDescription('Se une al Staff general').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('Abandona la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Usuario baneado de la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('externo').setDescription('Envía el mensaje del embed externo'),
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Opciones para enviar o recuperar un embed')
      .addSubcommand(sub =>
        sub.setName('create')
          .setDescription('Crea un embed desde un código generado')
          .addStringOption(opt => opt.setName('codigo').setDescription('Código del embed').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('restore')
          .setDescription('Restaura el último embed enviado por el bot')
      ),
    new SlashCommandBuilder()
      .setName('ticket-setup')
      .setDescription('Envia el sistema de tickets en este canal')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados correctamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}
const { EmbedBuilder } = require('discord.js');

// Roles específicos que quieres monitorear
const trackedRoles = [
  '1386877603130114098', // Human Resources
  '1386877176124674109', // Media Support
  '1386874357191544974', // Roтra Clυв ® (Conductor)
  '1389078801232953375'  // Trial Driver
];

// Canal donde se enviarán los logs
const logChannelId = '1386870558939025489'; // <- pon aquí el canal donde quieres los mensajes

// Cuando un usuario cambia de roles
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const logChannel = newMember.guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  // Roles añadidos (solo si están en trackedRoles)
  const addedRoles = newMember.roles.cache.filter(
    r => !oldMember.roles.cache.has(r.id) && trackedRoles.includes(r.id)
  );
  for (const role of addedRoles.values()) {
    const embed = new EmbedBuilder()
      .setTitle('📈 Rol asignado')
      .setDescription(`${newMember} recibió el rol **${role.name}**`)
      .setColor(0x2ECC71)
      .setThumbnail(newMember.user.displayAvatarURL());
    logChannel.send({ embeds: [embed] });
  }

  // Roles eliminados (solo si están en trackedRoles)
  const removedRoles = oldMember.roles.cache.filter(
    r => !newMember.roles.cache.has(r.id) && trackedRoles.includes(r.id)
  );
  for (const role of removedRoles.values()) {
    const embed = new EmbedBuilder()
      .setTitle('📉 Rol removido')
      .setDescription(`${newMember} perdió el rol **${role.name}**`)
      .setColor(0xE74C3C)
      .setThumbnail(newMember.user.displayAvatarURL());
    logChannel.send({ embeds: [embed] });
  }
});

// Cuando alguien abandona el servidor
client.on('guildMemberRemove', async member => {
  const logChannel = member.guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('🚪 Miembro salió del servidor')
    .setDescription(`${member.user.tag} ha abandonado el servidor.`)
    .setColor(0x95A5A6)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `ID: ${member.id}` });

  logChannel.send({ embeds: [embed] });
});

// Sistema de tickets
async function setupTicketSystem(channel) {
  const embed = new EmbedBuilder()
    .setTitle('📩 Soporte - Rotra Club ®')
    .setDescription('Haz clic en el botón para crear un ticket.\n\nUn miembro del equipo te atenderá lo antes posible.')
    .setColor(0x3498DB);

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel('🎫 Crear Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [button] });
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const channel = interaction.channel;
    const command = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);

    try {
      if (
        !allowedUsers.includes(interaction.user.id) && 
        !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
      ) {
        return await interaction.reply({
          content: '❌ No tienes permiso para usar este comando.',
          flags: 64
        });
      }

      if (command === 'ticket-setup') {
        await setupTicketSystem(channel);
        return await interaction.reply({ content: '✅ Sistema de tickets enviado en este canal.', flags: 64 });
      }

      // aquí siguen tus comandos de embed y demás...
      // (todo lo que ya tenías se queda igual)
    } catch (error) {
      console.error('❌ Error al ejecutar comando:', error);
    }
  }

  // Botones del sistema de tickets
  if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
      const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.id}`);
      if (existing) {
        return interaction.reply({ content: '❌ Ya tienes un ticket abierto.', ephemeral: true });
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.replace(/[^a-zA-Z0-9]/g, '-')}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          ...staffRoles.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          }))
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket de Soporte')
        .setDescription(`Hola ${interaction.user}, el staff te atenderá en breve.`)
        .setColor(0x2ECC71);

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Cerrar Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [ticketEmbed], components: [closeButton] });
      await interaction.reply({ content: `✅ Ticket creado: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.channel.delete().catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);



