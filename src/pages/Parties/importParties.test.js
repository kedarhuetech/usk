import test from "node:test";
import assert from "node:assert/strict";
import { getParties, saveParty } from "../../services/partiesStorage.js";
import { parseVCard, parseContactsCsv } from "../../services/contactImportParser.js";

// Mock localStorage if in Node environment
if (typeof window === "undefined" || !window.localStorage) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
  };
}

test("parseVCard correctly parses real vCard (.vcf) contacts", () => {
  const sampleVcf = `BEGIN:VCARD
VERSION:3.0
FN:Vikram Singhania
TEL;TYPE=CELL:+91 98765 12345
EMAIL;TYPE=WORK:vikram@singhaniatraders.in
ADR;TYPE=WORK:;;Industrial Area Phase 1;Chandigarh;Punjab;160002;India
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Meenakshi Sundaram
TEL;TYPE=WORK:04428123456
EMAIL;TYPE=HOME:meenakshi.s@gmail.com
END:VCARD`;

  const contacts = parseVCard(sampleVcf);
  assert.equal(contacts.length, 2);

  assert.equal(contacts[0].name, "Vikram Singhania");
  assert.equal(contacts[0].phone, "+919876512345");
  assert.equal(contacts[0].email, "vikram@singhaniatraders.in");
  assert.equal(contacts[0].address, "Industrial Area Phase 1, Chandigarh, Punjab, 160002, India");

  assert.equal(contacts[1].name, "Meenakshi Sundaram");
  assert.equal(contacts[1].phone, "04428123456");
  assert.equal(contacts[1].email, "meenakshi.s@gmail.com");
});

test("parseContactsCsv correctly parses Google Contacts exported CSV", () => {
  const sampleCsv = `Name,Given Name,Additional Name,Family Name,Yomi Name,Given Name Yomi,Additional Name Yomi,Family Name Yomi,Name Prefix,Name Suffix,Initials,Nickname,Short Name,Maiden Name,Birthday,Gender,Location,Billing Information,Directory Server,Mileage,Occupation,Hobby,Sensitivity,Priority,Subject,Notes,Language,Photo,Group Membership,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Address 1 - Type,Address 1 - Formatted
Rohan Verma,,,,,,,,,,,,,,,,,,,,,,,,,,,* myContacts ::: * starred,Mobile,rohan.verma@gmail.com,Mobile,9819988776,Work,MG Road Pune Maharashtra
Sneha Kulkarni,,,,,,,,,,,,,,,,,,,,,,,,,,,* myContacts,Personal,sneha.k@yahoo.co.in,Mobile,9822011223,,`;

  const contacts = parseContactsCsv(sampleCsv);
  assert.equal(contacts.length, 2);

  assert.equal(contacts[0].name, "Rohan Verma");
  assert.equal(contacts[0].phone, "9819988776");
  assert.equal(contacts[0].email, "rohan.verma@gmail.com");

  assert.equal(contacts[1].name, "Sneha Kulkarni");
  assert.equal(contacts[1].phone, "9822011223");
  assert.equal(contacts[1].email, "sneha.k@yahoo.co.in");
});

test("Importing parties from parsed contacts creates parties in storage", () => {
  window.localStorage.clear();

  const selectedContacts = [
    { id: "c1", name: "Rajesh Traders (Pune)", phone: "9823412345", email: "rajesh.traders@gmail.com", address: "Market Yard, Pune" },
    { id: "c2", name: "Pooja Sharma & Co.", phone: "9876543210", email: "pooja.sharma@yahoo.com", address: "MG Road, Bengaluru" },
  ];

  for (const c of selectedContacts) {
    saveParty({
      partyName: c.name,
      phone: c.phone || "",
      email: c.email || "",
      billingAddress: c.address || "",
      openingBalance: "0",
      openingBalanceType: "to-receive",
      gstType: "Unregistered/Consumer",
    });
  }

  const allParties = getParties();
  assert.equal(allParties.length, 2);

  const rajesh = allParties.find((p) => p.partyName === "Rajesh Traders (Pune)");
  assert.ok(rajesh, "Rajesh Traders must be saved");
  assert.equal(rajesh.phone, "9823412345");
  assert.equal(rajesh.email, "rajesh.traders@gmail.com");
  assert.equal(rajesh.billingAddress, "Market Yard, Pune");

  const pooja = allParties.find((p) => p.partyName === "Pooja Sharma & Co.");
  assert.ok(pooja, "Pooja Sharma must be saved");
  assert.equal(pooja.phone, "9876543210");
});
