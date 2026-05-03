function pickPrimarySegment(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  return segments
    .slice()
    .sort((a, b) => {
      if ((b.evidencePointCount || 0) !== (a.evidencePointCount || 0)) {
        return (b.evidencePointCount || 0) - (a.evidencePointCount || 0);
      }
      if ((b.spanMeters || 0) !== (a.spanMeters || 0)) {
        return (b.spanMeters || 0) - (a.spanMeters || 0);
      }
      return (b.exitIndex - b.entryIndex) - (a.exitIndex - a.entryIndex);
    })[0];
}

module.exports = {
  pickPrimarySegment,
};
