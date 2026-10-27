# SDD ledger — plan: docs/superpowers/plans/2026-10-27-system-renovation-project-plan.md

## Pre-flight scan
| Producer | Consumer | Interface | Finding |
| --- | --- | --- | --- |
| 20A | 01, 02 | C0 applyRegisteredMigrations, runRenovationScenario | Compatible: 20A registers migrations and scenario isolation runner; 01 and 02 register their own migration steps. |
| 01 | 04, 06, 07, 17, 18A, 19 | C1 resolveActorContext, C2 withStudentTermMutation | Compatible: 01 establishes student_term_state and ActorContext; downstream write paths consume C2. |
| 04 | 03, 05 | C3 appendReward, correctReward | Compatible: 04 establishes score_event and append-only ledger; 03 (instant redemption) and 05 (honor) consume C3. |
| 02, 04 | 03 | AUTO_V2 cards, C3 | Compatible: 02 provides classified cards; 04 provides ledger. |
| 03, 04 | 20B | Instant redemption, score ledger | Compatible: 20B verifies P0 loop in isolation. |

Pre-flight: clean, no interface conflicts found.

Task 20A: complete (commits c239a4d..c9335c1, tests: node scripts/full-system-demo/run.cjs --scenario R20A --speed 6 --exit → PASS 4/4 chapters, checks.businessDatabaseRejected=true, checks.migrationReplayPreservesLedger=true, checks.baselineReportUnchanged=true; environment.test.cjs → PASS 7/7)
Task 01: complete (commits c9335c1..a9906b1, tests: node scripts/full-system-demo/run.cjs --scenario R01 --speed 6 --exit → PASS 4/4 chapters, checks.crossSubjectStatus=403, checks.sameTokenAfterRevocationStatus=403, checks.permissionDependencyFailureStatus=503; renovation_auth.integration.test.js → PASS 4/4; npm test --prefix backend → PASS 94/94)
Task 02: complete (commits 515ac8d..5d9c50b, tests: node scripts/full-system-demo/run.cjs --scenario R02 --speed 6 --exit → PASS 4/4 chapters, checks.dailyCardDimensionsValid=true, checks.preboundLeafCategoriesValid=true, checks.idempotentReissue=true, checks.printPreviewDisplaysReason=true; renovation_cards.integration.test.js → PASS 2/2; npm test --prefix backend → PASS 96/96)
Task 04: complete (commits 5d9c50b..8bb997f, tests: node scripts/full-system-demo/run.cjs --scenario R04 --speed 6 --exit → PASS 5/5 chapters, checks.appendOnlyEnforced=true, checks.reversalProducesNegativeDelta=true, checks.duplicateReversalRejected409=true, checks.correctionCreatesChain=true, checks.sourceRevisionIncremented=true; renovation_ledger.integration.test.js → PASS 3/3; npm test --prefix backend → PASS 99/99)



