'use strict';
const { createHash } = require("node:crypto");

// Version 1: legacy preferred names only. Server-assigned report aliases are
// authoritative and may differ when a preferred name was already reserved.
const FIRST_NAMES = Object.freeze(`
Aaron Adam Adrian Alan Albert Alex Alice Amanda Amber Amy Andrew Angela
Anna Anthony Arthur Audrey Austin Barbara Benjamin Beth Brandon Brian Bridget Bruce
Caleb Cameron Carl Caroline Catherine Charles Charlotte Chloe Christopher Claire Clara Colin
Connor Daniel David Deborah Dennis Diana Dominic Donald Dorothy Dylan Edward Eleanor
Elizabeth Ella Ellen Emily Emma Eric Ethan Eva Evelyn Felix Fiona Florence
Frances Frank Frederick Gabriel George Grace Graham Hannah Harriet Harry Hazel Helen
Henry Holly Hugh Ian Isaac Isabel Jack Jacob James Jane Janet Jasmine
Jason Jennifer Jessica Joel John Jonathan Joseph Joshua Julia Julian Julie Justin
Kate Katherine Keith Kevin Laura Lauren Leah Leo Leonard Lewis Liam Lily
Linda Lisa Louis Lucy Luke Lydia Margaret Maria Mark Martha Martin Mary
Matthew Megan Michael Molly Nancy Nathan Nicholas Noah Nora Oliver Olivia Oscar
Owen Paige Patrick Paul Peter Philip Rachel Raymond Rebecca Richard Robert Robin
Rose Ruby Russell Ruth Ryan Samuel Sarah Scott Sean Sebastian Simon Sophie
Stanley Stephen Susan Thomas Timothy Toby Victoria Vincent Violet Walter William Zoe
`.trim().split(/\s+/));

function anonymousAlias(value) {
  if (typeof value !== "string" || !/^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(value)) return "Unknown";
  const index = createHash("sha256").update(value, "utf8").digest().readUInt32BE(0) % FIRST_NAMES.length;
  return FIRST_NAMES[index];
}

module.exports = { anonymousAlias };
