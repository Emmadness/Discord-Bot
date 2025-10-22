require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // importante para logs de entrada/salida
  ]
});

// IDs de usuarios y roles permitidos
const allowedUsers = ['640315344916840478'];
const allowedRoles = ['1429906604580667683', '1386877367028547624', '1429995569345990811'];
const lastEmbeds = new Map();

// ID de categoría y canal de logs
const TICKET_CATEGORY = '1429997006193037464';
const LOG_CHANNEL_ID = '1372037431615946775';

// ─────────────────────────────
// ✅ Función para enviar logs
// ─────────────────────────────
async function sendLog(guild, embedData) {
  try {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return console.warn('⚠️ Canal de logs no encontrado.');

    const embed = new EmbedBuilder(embedData)
      .setTimestamp()
      .setFooter({ text: 'Logs de Moderación', iconURL: guild.iconURL() });

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error al enviar log:', error);
  }
}

// ─────────────────────────────
// ✅ Cuando el bot inicia
// ─────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
});

// ─────────────────────────────
// ✅ Registro de slash commands
// ─────────────────────────────
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
    new SlashCommandBuilder().setName('ticket').setDescription('Envía mensaje para abrir tickets'),
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
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados correctamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

// ─────────────────────────────
// ✅ Función para enviar updates
// ─────────────────────────────
async function sendTeamUpdate(target, text, color = 0x3498DB) {
  const embed = new EmbedBuilder()
    .setTitle('Update')
    .setDescription(text)
    .setColor(color);
  const message = await target.send({ embeds: [embed] });
  lastEmbeds.set(target.id, message);
  return message;
}

// ─────────────────────────────
// ✅ Crear ticket
// ─────────────────────────────
async function createTicket(interaction, user, guild, tipoTicket = 'Soporte 🎫') {
  let username = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  if (username.length > 20) username = username.slice(0, 20);

  const existing = guild.channels.cache.find(c => c.name === `ticket-${username}`);
  if (existing) {
    return interaction.reply({ content: `❌ Ya tienes un ticket abierto: ${existing}`, ephemeral: true });
  }

  const ticketChannel = await guild.channels.create({
    name: `ticket-${username}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...allowedRoles.map(roleId => ({
        id: roleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      })),
    ],
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Cerrar Ticket 🔒')
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket de ${tipoTicket} - POD`)
    .setDescription(`Hola ${user}, un miembro del staff se pondrá en contacto contigo pronto.`)
    .setColor(0x1F8B4C)
    .addFields(
      { name: 'Usuario', value: `${user.tag}`, inline: true },
      { name: 'Tipo de Ticket', value: `${tipoTicket}`, inline: true },
      { name: 'Fecha de apertura', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: 'Players On Duty - Gestión de Tickets', iconURL: user.displayAvatarURL() });

  await ticketChannel.send({ embeds: [embed], components: [closeRow] });

  // 🔹 Log de ticket creado
  await sendLog(guild, {
    title: '🎫 Ticket creado',
    color: 0x2ECC71,
    fields: [
      { name: 'Usuario', value: `${user.tag}`, inline: true },
      { name: 'Tipo', value: tipoTicket, inline: true },
      { name: 'Canal', value: `<#${ticketChannel.id}>`, inline: true },
    ]
  });

  return interaction.reply({ content: `✅ Tu ticket de ${tipoTicket} ha sido creado: ${ticketChannel}`, ephemeral: true });
}

// ─────────────────────────────
// ✅ Interacciones (botones, menús, comandos)
// ─────────────────────────────
client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    const user = interaction.user;

    // Cerrar ticket
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const member = interaction.member;
      if (!allowedUsers.includes(member.id) && !member.roles.cache.some(r => allowedRoles.includes(r.id))) {
        return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
      }

      await sendLog(interaction.guild, {
        title: '🔒 Ticket cerrado',
        color: 0xE67E22,
        description: `Ticket cerrado por **${interaction.user.tag}** en <#${interaction.channel.id}>`
      });

      await interaction.channel.delete().catch(err => console.error('❌ Error al eliminar ticket:', err));
      return;
    }

    // Select menú para abrir ticket
    if (interaction.isStringSelectMenu() && interaction.customId === 'open_ticket_select') {
      const selected = interaction.values[0];
      let tipoTicket = 'Soporte 🎫';
      if (selected === 'ticket_se') tipoTicket = 'Save Edit';
      if (selected === 'ticket_lm') tipoTicket = 'Local Mods';
      if (selected === 'ticket_soporte') tipoTicket = 'Soporte';
      await createTicket(interaction, user, guild, tipoTicket);
      return;
    }

    // Comandos slash
    if (!interaction.isChatInputCommand()) return;

    if (
      !allowedUsers.includes(interaction.user.id) &&
      !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
    ) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', flags: 64 });
    }

    const command = interaction.commandName;
    const name = interaction.options.getString('nombre');
    const channel = interaction.channel;

    switch (command) {
      case 'test': await sendTeamUpdate(channel, 'Ejemplo: Un nuevo miembro se unió al equipo 🎉'); break;
      case 'training': await sendTeamUpdate(channel, `• **${name}** se unió como **Trial Driver** 🚚`, 0x2ECC71); break;
      case 'join': await sendTeamUpdate(channel, `• **${name}** se unió como **Driver** 🚚`, 0x2ECC71); break;
      case 'media': await sendTeamUpdate(channel, `• **${name}** se unió al **Media Team** 📸`, 0x9B59B6); break;
      case 'hr': await sendTeamUpdate(channel, `• **${name}** se unió a **Human Resources** 👩‍💻`, 0x9B59B6); break;
      case 'admin': await sendTeamUpdate(channel, `• **${name}** se unió como **Staff SE** 🛠️`, 0xF1C40F); break;
      case 'staff': await sendTeamUpdate(channel, `• **${name}** se ha unido al **Staff LM** 🧩`, 0x1F618D); break;
      case 'leave': await sendTeamUpdate(channel, `• **${name}** dejó la VTC 👋`, 0xE74C3C); break;
      case 'ban': await sendTeamUpdate(channel, `• **${name}** ha sido **baneado** 🚫`, 0xC0392B); break;
    }
  } catch (err) {
    console.error('❌ Error en interactionCreate:', err);
  }
});

// ─────────────────────────────
// ✅ Logs de moderación
// ─────────────────────────────
client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, {
    title: '🗑️ Mensaje eliminado',
    color: 0xE74C3C,
    fields: [
      { name: 'Autor', value: `${message.author.tag}`, inline: true },
      { name: 'Canal', value: `${message.channel}`, inline: true },
      { name: 'Contenido', value: message.content?.slice(0, 1024) || '*Sin contenido*' },
    ]
  });
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  await sendLog(newMsg.guild, {
    title: '✏️ Mensaje editado',
    color: 0xF1C40F,
    fields: [
      { name: 'Autor', value: `${oldMsg.author.tag}`, inline: true },
      { name: 'Canal', value: `${oldMsg.channel}`, inline: true },
      { name: 'Antes', value: oldMsg.content?.slice(0, 1024) || '*Vacío*' },
      { name: 'Después', value: newMsg.content?.slice(0, 1024) || '*Vacío*' },
    ]
  });
});

client.on('guildMemberAdd', async member => {
  await sendLog(member.guild, {
    title: '✅ Usuario unido',
    color: 0x2ECC71,
    description: `**${member.user.tag}** se ha unido al servidor.`,
    thumbnail: { url: member.user.displayAvatarURL() }
  });
});

client.on('guildMemberRemove', async member => {
  await sendLog(member.guild, {
    title: '❌ Usuario salió',
    color: 0xE74C3C,
    description: `**${member.user.tag}** ha salido o fue expulsado.`,
    thumbnail: { url: member.user.displayAvatarURL() }
  });
});

client.login(process.env.DISCORD_TOKEN);
