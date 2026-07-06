// Parser for AppliCAD/RoofRuler XML exports (roof + wall reports).
// Format: <POINT>, <LINE> (path references two point ids), <FACE><POLYGON path="L..,L..,...">
// A POLYGON path is a sequence of LINE ids tracing the face boundary. Sub-loops
// (holes, e.g. window/door cutouts inside a wall face) are separated by the
// sentinel "L0", which is never a real line id (ids start at L1).

function parsePoints(doc) {
  const points = {};
  doc.querySelectorAll('POINT').forEach((el) => {
    const id = el.getAttribute('id');
    const [x, y, z] = el.getAttribute('data').split(',').map(Number);
    points[id] = [x, y, z];
  });
  return points;
}

function parseLines(doc) {
  const lines = {};
  doc.querySelectorAll('LINE').forEach((el) => {
    const [p1, p2] = el.getAttribute('path').split(',');
    lines[el.getAttribute('id')] = {
      p1,
      p2,
      type: el.getAttribute('type') || '',
      length: parseFloat(el.getAttribute('length')) || 0,
    };
  });
  return lines;
}

// Walk a chain of connected line ids and resolve it into an ordered list of point ids.
function buildLoopFromLineIds(lineIds, lines) {
  const verts = [];
  let prevPointId = null;
  for (const lineId of lineIds) {
    const line = lines[lineId];
    if (!line) continue;
    const { p1: a, p2: b } = line;
    if (prevPointId === null) {
      verts.push(a, b);
      prevPointId = b;
    } else if (a === prevPointId) {
      verts.push(b);
      prevPointId = b;
    } else if (b === prevPointId) {
      verts.push(a);
      prevPointId = a;
    } else {
      // Chain broke (shouldn't normally happen) — best effort, keep going.
      verts.push(b);
      prevPointId = b;
    }
  }
  const dedup = verts.filter((id, i) => id !== verts[i - 1]);
  if (dedup.length > 1 && dedup[0] === dedup[dedup.length - 1]) dedup.pop();
  return dedup;
}

function resolveLoops(pathTokens, lines, points) {
  const loops = [];
  let current = [];
  for (const token of pathTokens) {
    if (token === 'L0') {
      if (current.length) loops.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length) loops.push(current);

  return loops
    .map((lineIds) => buildLoopFromLineIds(lineIds, lines))
    .map((pointIds) => pointIds.map((id) => points[id]).filter(Boolean))
    .filter((loop) => loop.length >= 3);
}

/**
 * Parse an AppliCAD/RoofRuler XML export.
 * @param {string} xmlText
 * @param {string} defaultType - fallback face type ("Roof" | "Wall")
 */
export function parseAppliCadXML(xmlText, defaultType = 'Roof') {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Invalid RoofRuler XML: ' + parserError.textContent);

  const points = parsePoints(doc);
  const lines = parseLines(doc);

  const faces = [];
  doc.querySelectorAll('FACE').forEach((faceEl) => {
    const polyEl = faceEl.querySelector('POLYGON');
    if (!polyEl) return;
    const pathTokens = polyEl.getAttribute('path').split(',');
    const loops = resolveLoops(pathTokens, lines, points);
    if (!loops.length) return;

    faces.push({
      id: faceEl.getAttribute('id'),
      sizeSf: parseFloat(polyEl.getAttribute('size')) || 0,
      pitch: parseFloat(polyEl.getAttribute('pitch')) || 0,
      orientation: parseFloat(polyEl.getAttribute('orientation')) || 0,
      type: polyEl.getAttribute('type') || defaultType,
      material: polyEl.getAttribute('mat') || '',
      loops,
    });
  });

  // Linear-footage line takeoffs, grouped by RoofRuler line "type" (FASCIA, GUTTER, etc.)
  const lineTakeoffs = {};
  Object.values(lines).forEach((line) => {
    if (!line.type) return;
    lineTakeoffs[line.type] = (lineTakeoffs[line.type] || 0) + line.length;
  });

  return { points, lines, faces, lineTakeoffs };
}

export function roofSqft(parsed) {
  return parsed.faces.filter((f) => f.type === 'Roof').reduce((sum, f) => sum + f.sizeSf, 0);
}

export function wallSqft(parsed) {
  return parsed.faces.filter((f) => f.type === 'Wall').reduce((sum, f) => sum + f.sizeSf, 0);
}

export function boundingBox(parsed) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  parsed.faces.forEach((f) =>
    f.loops.forEach((loop) =>
      loop.forEach(([x, y, z]) => {
        min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x);
        min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y);
        min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
      })
    )
  );
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// A house's roof and wall RoofRuler exports are independent files whose face
// ids ("F1", "F2", ...) can collide (e.g. both may have an "F1"). Facets are
// identified everywhere in the app (mesh userData, override maps, click
// selection) by a composite key namespaced by which export + role they came
// from, so a roof-type facet from the wall XML can never be confused with one
// from the roof XML.
export function facetKey(sourceTag, faceId) {
  return `${sourceTag}:${faceId}`;
}
