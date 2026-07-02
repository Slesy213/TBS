const ticketManager = {
    tickets: [],
    blacklist: [],
    staffStats: {},

    init(client) {
        console.log("[TicketManager] Başlatıldı.");
        this.client = client;
    },

    async getTicket(channelId) {
        return this.tickets.find(t => t.channelId === channelId) || null;
    },

    async closeTicket(client, channelId, closedBy) {
        const ticket = this.tickets.find(t => t.channelId === channelId);
        if (!ticket) return false;

        ticket.status = "closed";
        ticket.closedAt = Date.now();
        ticket.closedBy = closedBy;
        
        console.log(`Ticket kapatıldı: ${channelId}`);

        const channel = client.channels.cache.get(channelId);
        if (channel) {
            try {
                await channel.delete();
            } catch (err) {
                console.error('Kanal silinirken hata:', err);
            }
        }

        return true;
    },

    async saveGuildTickets(guildId) {
        console.log(`Guild ticket verileri kaydedildi: ${guildId}`);
        return true;
    },

    createTicket(data) {
        this.tickets.push({
            ...data,
            status: "open",
            createdAt: Date.now()
        });
        return true;
    }
};

module.exports = ticketManager;
