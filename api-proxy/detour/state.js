const vehicleState = new Map();
const activeDetours = new Map();
const detourEvidence = new Map();
const persistentDetourCandidates = new Map();
const learnedPersistentDetours = new Map();

function clearDetourState() {
  vehicleState.clear();
  activeDetours.clear();
  detourEvidence.clear();
  persistentDetourCandidates.clear();
  learnedPersistentDetours.clear();
}

module.exports = {
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  learnedPersistentDetours,
  clearDetourState,
};
