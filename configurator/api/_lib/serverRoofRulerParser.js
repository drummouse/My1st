import { DOMParser } from '@xmldom/xmldom';
import { parseAppliCadDocument } from '../../src/lib/roofRulerParser.js';

export function parseAppliCadXMLServer(xmlText, defaultType = 'Roof') {
  const errors = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(String(xmlText ?? ''), 'application/xml');

  if (errors.length) {
    throw new Error(`Invalid RoofRuler XML: ${errors[0]}`);
  }
  return parseAppliCadDocument(doc, defaultType);
}
