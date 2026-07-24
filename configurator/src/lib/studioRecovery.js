const emptyParsedDesign = () => ({
  points: {},
  lines: {},
  faces: [],
  lineTakeoffs: {},
});

// Isolate an unreadable import to its own layer. Callers receive only the
// layer identity needed for corrective UI; parser messages and XML contents
// are deliberately not propagated into renderable state.
export function parseStudioLayers(layers = [], parseLayer) {
  const parseFailures = [];
  const parsedLayers = layers.map(({ id, name, visible, xml }) => {
    try {
      return { id, name, visible, parsed: parseLayer(xml) };
    } catch {
      parseFailures.push({ id, name });
      // Hide only the derived viewer layer so an empty parse cannot poison
      // scene bounds. The source layer's visibility and XML remain unchanged.
      return { id, name, visible: false, parsed: emptyParsedDesign() };
    }
  });

  return { parsedLayers, parseFailures };
}
