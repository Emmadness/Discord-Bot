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
} = require('discord.js');

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
const staffRoles = ['1411835087120629952', '1386877603130114098', '1386876691552669786', '1386877367028547624'];

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

// Manejo de interacciones
client.on('interactionCreate', async interaction => {
  try {
    // Comandos Slash
    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      // Comprobar permisos
      if (
        !allowedUsers.includes(interaction.user.id) && 
        !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
      ) {
        return await interaction.reply({
          content: '❌ No tienes permiso para usar este comando.',
          ephemeral: true
        });
      }

      switch(command) {
        case 'test':
          await interaction.reply({ content: '✅ Bot funcionando correctamente.', ephemeral: true });
          break;

        case 'training':
        case 'join':
        case 'media':
        case 'hr':
        case 'admin':
        case 'staff':
        case 'leave':
        case 'ban':
          {
            const nombre = interaction.options.getString('nombre');
            await interaction.reply({ content: `✅ Comando \`${command}\` ejecutado para ${nombre}.`, ephemeral: true });
          }
          break;

        case 'externo':
          {
            const embed = new EmbedBuilder()
              .setTitle('Mensaje Externo')
              .setDescription('Este es un mensaje externo del bot.')
              .setColor(0xE67E22);
            await interaction.reply({ embeds: [embed], ephemeral: false });
          }
          break;

        case 'embed':
          {
            const sub = interaction.options.getSubcommand();
            if(sub === 'create') {
              const codigo = interaction.options.getString('codigo');
              let embed;
              try {
                embed = JSON.parse(codigo);
              } catch(e) {
                return interaction.reply({ content: '❌ Código de embed inválido.', ephemeral: true });
              }

              await interaction.channel.send({ embeds: [EmbedBuilder.from(embed)] });
              lastEmbeds.set(interaction.channel.id, EmbedBuilder.from(embed));
              await interaction.reply({ content: '✅ Embed enviado.', ephemeral: true });
            } else if(sub === 'restore') {
              const embed = lastEmbeds.get(interaction.channel.id);
              if(!embed) return interaction.reply({ content: '❌ No hay embeds para restaurar.', ephemeral: true });
              await interaction.channel.send({ embeds: [embed] });
              await interaction.reply({ content: '✅ Embed restaurado.', ephemeral: true });
            }
          }
          break;

        case 'ticket-setup':
          await setupTicketSystem(interaction.channel);
          await interaction.reply({ content: '✅ Sistema de tickets enviado en este canal.', ephemeral: true });
          break;

        default:
          await interaction.reply({ content: '❌ Comando no reconocido.', ephemeral: true });
      }
    }

    // Botones del sistema de tickets
    if(interaction.isButton()) {
      if(interaction.customId === 'create_ticket') {
        const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.id}`);
        if (existing) return interaction.reply({ content: '❌ Ya tienes un ticket abierto.', ephemeral: true });

        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
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

      if(interaction.customId === 'close_ticket') {
        const member = interaction.member;
        const hasPermission = staffRoles.some(roleId => member.roles.cache.has(roleId));

        if (!hasPermission) {
          return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }

        await interaction.channel.delete().catch(() => {});
      }
    }

  } catch(error) {
    console.error('❌ Error al manejar la interacción:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);
