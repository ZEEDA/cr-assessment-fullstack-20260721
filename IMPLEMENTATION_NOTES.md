# Implementation Notes


## 1. What I changed
<!-- Grouped by side (backend / frontend) and task. -->

-

## 2. Model of the flow (UI ↔ client ↔ service)
<!-- How an approve/reject travels from the component through the API client into the service and repo,
and back into the view. -->

- A user opens the angular UI and select the user from "Acting as" switcher, which set the current session user(id, orgCode, policies).

- The `CrListComponent` fetches the Change Requests list from `CrApiClient` which delegates the process to `CrService` and get the list filtered by current user `orgCode`.

- The `CrDetailComponent` fetches the selected "Cr" from `CrApiClient` that delegated the process to `CrService` and get full Cr data by `user_ID` and `Cr_ID` from the in-memory repo.

- From the details view, user handle a CR through it's state machine(`DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> APPLIED`) by calling the appropriate action for the current state as `SEND_FOR_APPROVAL, CANCEL, APPROVE,
, APPLY or REJECT` on `CrApiClient` that delegates the process to `CrService` which checks the user's `cr_{action}_{scope}` policy and validates the transition against `LEGAL_TRANSITION` in `cr-state-machine.ts` before applying the transition and update the "CR and audit" in the in-memory repo.

- The updated Cr comes back and replaces the component's loaded state, `Audit Timeline` updated and `Action Buttons` rechecked against the new status.

- Inside `CrApiClient` a `Business Error` (eg. `FORBIDDEN`, `ILLIGAL_TRANSITION`, `TERMINAL_STATE`) or a network failure rejects the promise and appears as `actionError` inside `UI`.

## 3. Invariants I keep
<!-- Which properties your implementation guarantees across the seam, and where each is enforced (backend,
client, or component). -->

| Invariant | How / where |
|---|---|

## 4. Testing strategy
<!-- What you tested across the seam (backend + component/DOM) and why; what you skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the rules or the seam left room for interpretation, the calls you made and why. -->

-

## 6. Where I used AI
-

## 7. What I'd improve with more time
-
