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
    .map((lineIds) => ({
      lineIds,
      points: buildLoopFromLineIds(lineIds, lines).map((id) => points[id]).filter(Boolean),
    }))
    .filter((loop) => loop.points.length >= 3);
}

// Classifies a hole loop (a window/door/other cutout inside a wall face) by
// the RoofRuler line "type" tags on its edges (WINDOW-EDGE/HEAD/SILL vs
// DOOR-EDGE/HEAD), and estimates its plan-view width and height from its 3D
// bounding box — good enough for a schedule table, not precision millwork.
// A hole with no window/door edge tags at all (a vent, a decorative recess,
// any other penetration) is still a real cutout — classified as 'other'
// rather than silently dropped.
function classifyOpening(lineIds, lines) {
  let windowVotes = 0;
  let doorVotes = 0;
  lineIds.forEach((id) => {
    const type = lines[id]?.type || '';
    if (type.startsWith('WINDOW-')) windowVotes += 1;
    else if (type.startsWith('DOOR-')) doorVotes += 1;
  });
  if (doorVotes === 0 && windowVotes === 0) return 'other';
  return doorVotes >= windowVotes ? 'door' : 'window';
}

function loopDimensions(loopPoints) {
  const xs = loopPoints.map((p) => p[0]);
  const ys = loopPoints.map((p) => p[1]);
  const zs = loopPoints.map((p) => p[2]);
  const planSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const heightSpan = Math.max(...zs) - Math.min(...zs);
  return { widthFt: planSpan, heightFt: heightSpan };
}

// Unlike a window, a door usually reaches the floor — so it isn't a separate
// hole loop (a fully enclosed sub-boundary), it's a notch cut directly into
// the wall's OUTER boundary, sharing its bottom edge with the wall base. This
// walks the outer loop's line sequence for contiguous DOOR-EDGE/DOOR-HEAD
// runs and measures each one directly (doesn't handle a run that wraps
// around the array boundary, a rare edge case given the arbitrary start
// point of the exported polygon path).
function findOuterLoopDoors(lineIds, lines) {
  const doors = [];
  let i = 0;
  while (i < lineIds.length) {
    const isDoorLine = (lines[lineIds[i]]?.type || '').startsWith('DOOR-');
    if (!isDoorLine) { i += 1; continue; }
    let j = i;
    while (j < lineIds.length && (lines[lineIds[j]]?.type || '').startsWith('DOOR-')) j += 1;
    doors.push(lineIds.slice(i, j));
    i = j;
  }
  return doors;
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
    const resolvedLoops = resolveLoops(pathTokens, lines, points);
    if (!resolvedLoops.length) return;

    // Sub-loops after the first (holes cut into the outer boundary) are
    // window/door/other cutouts — classify each by its edges' RoofRuler line
    // types. A degenerate (near-zero) hole is parsing noise, not a real
    // opening — skip it rather than list a fake "0.0 x 0.0 ft" penetration.
    const openings = resolvedLoops
      .slice(1)
      .map(({ lineIds, points: loopPoints }) => {
        const dims = loopDimensions(loopPoints);
        if (dims.widthFt < 0.5 || dims.heightFt < 0.5) return null;
        return { kind: classifyOpening(lineIds, lines), ...dims };
      })
      .filter(Boolean);

    // Doors that reach the floor are notches in the outer boundary itself,
    // not a separate hole loop — found by walking the outer loop's own line
    // sequence for contiguous DOOR-EDGE/DOOR-HEAD runs.
    findOuterLoopDoors(resolvedLoops[0].lineIds, lines).forEach((runIds) => {
      const runPoints = buildLoopFromLineIds(runIds, lines).map((id) => points[id]).filter(Boolean);
      if (runPoints.length < 2) return;
      const dims = loopDimensions(runPoints);
      // A stray isolated door-tagged fragment (no real width or height) is
      // parsing noise, not an actual opening — skip it rather than list a
      // fake "0.0 x 3.0 ft door".
      if (dims.widthFt < 0.5 || dims.heightFt < 0.5) return;
      openings.push({ kind: 'door', ...dims });
    });

    faces.push({
      id: faceEl.getAttribute('id'),
      sizeSf: parseFloat(polyEl.getAttribute('size')) || 0,
      pitch: parseFloat(polyEl.getAttribute('pitch')) || 0,
      orientation: parseFloat(polyEl.getAttribute('orientation')) || 0,
      type: polyEl.getAttribute('type') || defaultType,
      material: polyEl.getAttribute('mat') || '',
      loops: resolvedLoops.map((l) => l.points),
      openings,
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

// Every window/door cutout found across a layer's wall faces, for the PDF's
// Window & Door Schedule table.
export function collectOpenings(parsed) {
  const openings = [];
  parsed.faces.forEach((f) => {
    (f.openings || []).forEach((o) => openings.push({ faceId: f.id, ...o }));
  });
  return openings;
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
