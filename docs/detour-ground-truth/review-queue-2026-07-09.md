# Auto-Detour Real-World Review Queue — 2026-07-09

## Purpose

Use this queue to turn production detector history into operator-labelled ground truth. Times are Eastern Time.

Allowed detection labels:

- `true-positive` — a real detour occurred in the detected location and time
- `false-positive` — service was operating normally there
- `uncertain` — available operational information is not enough to decide

Path and stop-impact quality should be marked separately as `pass`, `fail`, or `not-applicable`.

## Evidence snapshot

- Source: the latest 1,000 `detourEventHistoryV2` records
- Period covered: 2026-07-08 05:59 to 2026-07-09 15:55 ET
- Distinct route/event windows detected: 41
- Operator-labelled groups found: 0
- Many detector events were safely hidden for insufficient geometry or stale mixed evidence.

## Priority review cases

| Priority | Route and event | Time window (ET) | Detector evidence | Why review it | Detection label | Path | Stops | Operator note |
|---|---|---|---|---|---|---|---|---|
| 1 | `8A:669458f9-7e69-47f9-9ec7-508234e5c234:5000-7000` | Jul 9, 14:39–15:47 | High confidence; 4 vehicles; rider-visible | Strongest recent public detection; also validates duplicate cleanup |  |  |  |  |
| 2 | `8B:9567c898-6050-4bc2-a182-a81164b99a34:5100-5400` | Jul 8, 09:27–Jul 9, 15:28 | High confidence; 3 vehicles; rider-visible | Long-lived public case; road matching was rejected at low confidence, so verify the displayed path | true-positive | fail | fail | Official Shanty Bay Route 8B-SB detour active July 6 to September 4. Detector evidence fragmented and visibility flapped after the bus left the corridor. |
| 3 | `15A:c3b234d5-5f2c-45f7-9d7b-9588de46cb05:6600-6800` | Jul 8, 06:45–11:25 | Medium confidence; 2 vehicles; rider-visible; later cleared | Independent public case on another route |  |  |  |  |
| 4 | `8A:58571941-6738-4b34-b076-0e3460e4d4fe:0-200` | Jul 8, 08:51–08:53 | High confidence; 3 vehicles; rider-visible; quickly cleared | Short-lived public case; review for real short detour versus flapping |  |  |  |  |
| 5 | `100:52bbbe0c-6117-4d78-b191-6f1ccb16b104:0-100` | Jul 8, 09:53–Jul 9, 15:48 | High confidence; 2 vehicles; hidden; 15 detections and 15 clears | Strong flapping candidate, but riders were protected by the geometry gate |  | N/A | N/A |  |
| 6 | `100:52bbbe0c-6117-4d78-b191-6f1ccb16b104:0-200` | Jul 8, 10:42–Jul 9, 15:48 | High confidence; 2 vehicles; hidden; 4 detections and 4 clears | Related Route 100 window; determine whether it is one physical event |  | N/A | N/A |  |
| 7 | `12A:6813699d-0b23-4d2b-a650-5a402aeb34c4:0-200` | Jul 9, 11:09–15:43 | High confidence; 3 vehicles; hidden; 3 detections and 3 clears | Multiple confirmations but insufficient safe geometry |  | N/A | N/A |  |
| 8 | `7A:2d0dec32-0d02-457b-b52b-83268a1165ad:17600-17700` | Jul 8, 12:47–Jul 9, 14:45 | High confidence; 2 vehicles; hidden; 5 detections and 5 clears | Repeated terminal-end detections; possible terminal circulation or flapping |  | N/A | N/A |  |
| 9 | `12B:e4340c9c-198f-4c24-9865-8f1047b88c88:11300-12200` | Jul 8, 09:31–10:07 | High confidence; 2 vehicles; hidden as stale mixed evidence | Safety-suppression example |  | N/A | N/A |  |
| 10 | `15B:e0e7600d-9874-4ecb-9066-1bbfa69bcf1e:0-100` | Jul 8, 07:28–12:18 | High confidence; 2 vehicles; hidden; 2 detections and 2 clears | Repeated hidden case on a different route |  | N/A | N/A |  |

## Normal-service samples still needed

Detection logs provide positive candidates but do not prove true negatives. Select at least ten route/time windows known by operations to have run normally, then confirm that the detector did not publish an event for those windows.

## Review rule

Do not label a case `false-positive` only because it cleared quickly. Confirm normal service using operator knowledge, official notices, or another reliable operational source.
