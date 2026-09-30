// The data contract: JSON Schemas in schema/, checked on every read of an event file and every
// write of an output.

import Ajv2020 from 'ajv/dist/2020.js';
import { readJson } from './io.mjs';

// Bump the minor for added fields, the major for anything a consumer could break on.
export const SCHEMA_VERSION = '1.0.0';

const eventsSchema = readJson('schema/events.schema.json');
const outputSchema = readJson('schema/output.schema.json');

const ajv = new Ajv2020({ allErrors: true, discriminator: true });
ajv.addSchema(eventsSchema);
ajv.addSchema(outputSchema);

const describe = (errors) => errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

function validator(ref) {
  const validate = ajv.getSchema(ref);
  if (!validate) throw new Error(`no schema at ${ref}`);
  return (data) => (validate(data) ? [] : [describe(validate.errors)]);
}

export const eventProblems = validator(`${eventsSchema.$id}#/$defs/event`);

const OUTPUTS = {
  upgrade: 'upgradeFile',
  eip: 'eipFile',
  index: 'indexFile',
  resolve: 'resolveFile',
  checks: 'checksFile',
};

const outputValidators = Object.fromEntries(Object.entries(OUTPUTS).map(([kind, def]) => [kind, validator(`${outputSchema.$id}#/$defs/${def}`)]));

export function outputProblems(kind, data) {
  return outputValidators[kind](data);
}

export const enumOf = (def, property) => eventsSchema.$defs[def].properties[property].enum;
