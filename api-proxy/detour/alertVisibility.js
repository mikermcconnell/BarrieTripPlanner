'use strict';

const ALERT_BLOCKING_REASONS = new Set([
  'baseline-update-pending',
  'baseline-diverged',
  'suppressed-invalid-geometry',
  'zero-confirmed-vehicle-count',
]);

const ALERT_VISIBLE_STATES = new Set(['active', 'clear-pending']);
const ALERT_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getConfirmedVehicleCount(source = {}) {
  return toNonNegativeInt(source.uniqueVehicleCount ?? source.vehicleCount);
}

function evaluateRiderAlertVisibility(source = {}) {
  const state = String(source.state || 'active').trim().toLowerCase();
  const confidence = String(source.confidence || '').trim().toLowerCase();
  const confirmedVehicleCount = getConfirmedVehicleCount(source);
  const riderVisibilityReason = String(source.riderVisibilityReason || '').trim();

  if (!ALERT_VISIBLE_STATES.has(state)) {
    return { alertVisible: false, reason: state === 'cleared' ? 'detour-cleared' : 'detour-not-active' };
  }

  if (ALERT_BLOCKING_REASONS.has(riderVisibilityReason)) {
    return { alertVisible: false, reason: riderVisibilityReason };
  }

  const confirmed = confirmedVehicleCount >= 2 || source.isPersistent === true;
  if (!confirmed) {
    return { alertVisible: false, reason: 'insufficient-confirmed-evidence' };
  }

  if (confidence && !ALERT_VISIBLE_CONFIDENCES.has(confidence)) {
    return { alertVisible: false, reason: 'insufficient-alert-confidence' };
  }

  if (source.riderVisible === false) {
    return {
      alertVisible: true,
      reason: 'active-detour-details-unavailable',
    };
  }

  return {
    alertVisible: true,
    reason: riderVisibilityReason || 'rider-visible-confirmed',
  };
}

function attachRiderAlertVisibility(target = {}) {
  const decision = evaluateRiderAlertVisibility(target);
  target.alertVisible = decision.alertVisible;
  target.alertVisibilityReason = decision.reason;
  return target;
}

module.exports = {
  ALERT_BLOCKING_REASONS,
  attachRiderAlertVisibility,
  evaluateRiderAlertVisibility,
  getConfirmedVehicleCount,
};
