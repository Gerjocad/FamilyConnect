// Verteilt Änderungsereignisse per Server-Sent Events an alle offenen Clients einer Familie.
export class LiveHub {
  #clients = new Map();

  subscribe(familyId, res) {
    let set = this.#clients.get(familyId);
    if (!set) this.#clients.set(familyId, (set = new Set()));
    set.add(res);
    return () => {
      set.delete(res);
      if (set.size === 0) this.#clients.delete(familyId);
    };
  }

  publish(familyId, resource) {
    const set = this.#clients.get(familyId);
    if (!set) return;
    const payload = `data: ${JSON.stringify({ resource })}\n\n`;
    for (const res of set) res.write(payload);
  }
}
