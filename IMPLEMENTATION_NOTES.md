# Implementation Notes


## 1. What I changed
<!-- Grouped by side (backend / frontend) and task. -->

- Fix: onSelect method to reset cr_detail_component selectedId before setting a new value (update cr_details_component content).
- Task 0: 
    - **Initial setup:**
        - install dependencies and start project
        - Read through the initial project documentation and understand the project structure and flow.
        - Write End-to-End flow (from UI to BFF_Client and Back_Services).
- Task 1: 
    - **Fix transition failure:** (backend)
        - Make sure that the assertTransition function return illegalTransition error by checking the transition against `LEGAL_TRANSITION` list.

    - **Fix UI Test failure:**
        - Added a read-only function `isReadOnlyPolicy` to `permissions.ts` and used it in the `CrDetailComponent` to determine if the current user had only read access first before checking the CR status at both `canApprove` and `canReject` functions to return false if the user is read-only make the approve button disabled and action reject section can be hidden.

- Task 2 (backend, `cr-service.ts`):
    - **approve:**
        - Get/check cr from the repository using `getOrThrow`, then check if the current user have the approve policy to proceed
        - After that call transition function to first check the transition is legal against `LEGAL_TRANSITION`, if the transition is allowed then update cr ( update status to `APPROVED`, add audit entry, increment version), then after that update cr approvals list with the new approval entry.
        - Finally, save the updated cr to the repository.
    - **Apply:**
        - Get/check cr from the repository using `getOrThrow`, then check if the current user have the apply policy to proceed
        - After that call assertTransition first to check the transition to `APPLIED` is legal before proceeding with budget checks and doing any updates.
        - Then check if the budget is sufficient before proceeding by checking if there is an additional amount required and if it exceeds the available budget balance.
        - Update cr totals and call transition to update (status, audit, version).
        - Update the assigned budget by adding the additional amount to booked and subtracting it from balance.
        - Finally, save the updated cr to the repository.

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
| Only legal transitions | Backend: `assertTransition` checks `LEGAL_TRANSITIONS`; every service action goes through `transition()` (`apply` also asserts first, before touching the budget). |
| Terminal states immutable | Backend: `assertTransition` throws `TERMINAL_STATE`; `approve` and `apply` validate before mutating, so a failed call keeps the CR untouched. |
| Budget never over-spent | Backend: `apply` rejects a positive delta greater than `balance` before any updates. |
| Every successful action audited | Backend: `transition()` appends the audit entry and version. |
| Approval recorded only on a successful approve | Backend: `approve` appends to `approvals` after the transition succeeds. |

## 4. Testing strategy
<!-- What you tested across the seam (backend + component/DOM) and why; what you skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the rules or the seam left room for interpretation, the calls you made and why. -->

- **CR immutability on failed actions or transitions:** if an action fails due to policy violation or an illegal transition or insufficient budget, the CR remains unchanged.
- **Budget on apply:** `booked` is set to the CR's new total (`totals.newTotal`) and `balance -= delta`. A positive delta must fit in `balance` (equal is allowed); a negative delta releases budget.
- **Cr status couldn't be repeated or go back in the workflow:** approving an already-`APPROVED` CR throws `ILLEGAL_TRANSITION` rather than silently returning, or attempting to return to a previous status throws the same error.
- **Policy scope:** the last part of a policy (`_u`, `_w`, `_o`) is ignored. For example, `cr_a_u` and `cr_a_o` both let the user approve any CR in their org. This matches the existing `isApprover`/`isApplier` helpers.

## 6. Where I used AI
- Used AI to assist in understanding the project structure and flow.
- Used AI to write the isReadOnlyPolicy function then inside  `CrDetailComponent` added checks in `canApprove` and `canReject` to apply changes to the UI based on the user's read-only status.
- Used AI to assist in writing the approve/apply logic in the backend service.

## 7. What I'd improve with more time
-
