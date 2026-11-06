// Parses vCard (.vcf) formatted text into contact objects.
export function parseVCard(vcfText = "") {
  const cards = vcfText.split(/END:VCARD/i);
  const contacts = [];
  for (const card of cards) {
    if (!card.includes("BEGIN:VCARD")) continue;
    let name = "";
    let phone = "";
    let email = "";
    let address = "";

    const lines = card.split(/\r\n|\r|\n/);
    for (let line of lines) {
      line = line.trim();
      if (/^FN[;:](.+)/i.test(line)) {
        name = line.replace(/^FN[^:]*:/i, "").trim();
      } else if (!name && /^N[;:](.+)/i.test(line)) {
        const parts = line.replace(/^N[^:]*:/i, "").split(";");
        name = [parts[1], parts[0]].filter(Boolean).join(" ").trim();
      } else if (!phone && /^TEL[;:](.+)/i.test(line)) {
        phone = line.replace(/^TEL[^:]*:/i, "").replace(/[^\d+]/g, "").trim();
      } else if (!email && /^EMAIL[;:](.+)/i.test(line)) {
        email = line.replace(/^EMAIL[^:]*:/i, "").trim();
      } else if (!address && /^ADR[;:](.+)/i.test(line)) {
        const parts = line.replace(/^ADR[^:]*:/i, "").split(";").filter(Boolean);
        address = parts.join(", ").trim();
      }
    }

    if (name || phone) {
      contacts.push({
        id: `vcf-${contacts.length}-${Date.now()}`,
        name: name || phone || "Unnamed Contact",
        phone,
        email,
        address,
        selected: false,
      });
    }
  }
  return contacts;
}

// Parses CSV formatted contacts (Google Contacts or standard phone export).
export function parseContactsCsv(csvText = "") {
  const lines = csvText.split(/\r\n|\r|\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.replace(/["']/g, "").trim());
  const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("display") || h.includes("contact"));
  const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("tel"));
  const emailIdx = header.findIndex((h) => h.includes("email") || h.includes("mail"));
  const addrIdx = header.findIndex((h) => h.includes("address") || h.includes("location") || h.includes("city"));

  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
    const name = nameIdx !== -1 ? cols[nameIdx] : cols[0];
    const phone = phoneIdx !== -1 ? cols[phoneIdx]?.replace(/[^\d+]/g, "") : "";
    const email = emailIdx !== -1 ? cols[emailIdx] : "";
    const address = addrIdx !== -1 ? cols[addrIdx] : "";

    if (name || phone) {
      contacts.push({
        id: `csv-${i}-${Date.now()}`,
        name: name || phone,
        phone,
        email,
        address,
        selected: false,
      });
    }
  }
  return contacts;
}

