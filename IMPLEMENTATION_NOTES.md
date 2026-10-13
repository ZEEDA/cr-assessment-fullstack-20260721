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
        - Refined in Task 3: the read-only check alone wasn't enough (see below).

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

- Task 3 (frontend detail UI, `cr-detail.component` + template):
    - **canApprove / canReject (status + permissions):**
        - The Task 1 check only blocked users holding *only* `cr_r_*` policies. A user like `alice` (`cr_c_u, cr_r_u, cr_u_u`) isn't read-only, so Approve was enabled for her, but the service rejects her with `FORBIDDEN` because she has no approve policy.
        - Both getters now return `canApprovePolicy(user) && status === PENDING_APPROVAL`. `canApprovePolicy` checks for an approve policy (`cr_a_u | cr_a_w | cr_a_o`), the same rule the backend's `isApprover` applies to both `approve` and `reject`. `isReadOnlyPolicy` is now a private helper inside `permissions.ts`, called first by `canApprovePolicy`.
        - The template already used both getters: Approve is disabled when `!canApprove`, and the whole reject section (reason + button) is hidden when `!canReject`.
        - Changed in Task 4: the Reject button is now always rendered (disabled) and only the reason box is hidden (see below).
    - **approve / reject through `CrApiClient`:**
        - Both go through one private `runAction()` helper:
            - Returns early if the action isn't allowed or a request is already in flight (no double submit on a slow response).
            - Sets `submitting = true` while the call is pending. The template disables Approve, Reject and the reason box, and shows a "Saving…" status.
            - On success, the CR returned by the service replaces the loaded state, so (status, totals, timeline) and action buttons all come from the same response.
            - On failure (business error or network error), the last loaded CR stays on screen and the error message is shown in `actionError` next to the actions. The user can retry.
            - A late response is ignored if the component has moved to a different CR id in the meantime.
    - **Reject requires a reason:**
        - UI: the Reject button stays disabled until the trimmed reason is non-empty, and `reject()` checks it again before calling the client. The reason box is bound to `rejectReason` and cleared after a successful reject.
        - Backend (`cr-service.ts`): `reject` now requires `note` and throws `Errors.validation(...)` for a missing or whitespace-only reason. This is the first check, before the CR lookup, the permission check or any change. The trimmed reason is stored on the audit entry. Callers that skip the UI can't reject without a reason either.

- Task 4 (frontend, role-aware UI + states):
    - **Role-aware actions (`cr-detail.component` + template):**
        - Approve and Reject are always rendered, and are disabled unless `canApprove`/`canReject` allows them. The reject reason box is only shown when the user can actually reject.
        - New getter `approveRejectActionsUnavailableReason` explains why the actions are disabled, shown above the buttons:
            - No approve policy (read-only `viewer`, or `alice` who can create/update but not approve) → "You can view this change request but don't have permission to approve or reject it."
            - Approver on a CR that isn't `PENDING_APPROVAL` → "Only change requests pending approval can be approved or rejected."
            - `null` when the actions are available, so nothing is shown.
        - A read-only user still sees the full CR (header, totals, timeline). Only the actions are off.
    - **Explicit states (`cr-detail.component` template):**
        - Loading: "Loading…" (`role="status"`) and `aria-busy` on the page. No CR or actions are rendered.
        - Load error: the error message with a Retry button (`role="alert"`). No CR or actions are rendered.
        - Loaded: the CR, plus an explicit "No activity recorded yet." when the timeline is empty instead of an empty list.
        - Action states from Task 3 stay: "Saving…" while a call is in flight, and `actionError` on failure.
    - **Selected CR highlighted in the list (`app.component`, `cr-list`):** the app passes `selectedId` into `CrListComponent`. The matching row gets `aria-current="true"`, which the CSS styles (tint, bold, left accent bar). The app owns the selection, so the list and the detail pane always point to the same CR.
    - **Switching "Acting as" clears the open CR (`app.component`):** `switchUser` sets `selectedId = null`, and a "Select a change request…" placeholder takes the detail pane.

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
| UI only offers actions the service allows | Component: `canApprove`/`canReject` require the same `cr_a_*` policy as the service's `isApprover` and the CR being in `PENDING_APPROVAL` (the only state with legal `APPROVED`/`REJECTED` transitions). The service still checks both. |
| A user without an approve policy sees the CR but no enabled action | Component: both buttons rendered disabled, reason box hidden, and `approve()`/`reject()` return before calling the client. Backend: `FORBIDDEN` if a call gets through anyway. |
| A rejection always has a reason | Component: disables Reject without a reason, backend `reject` throws `VALIDATION` error if there is no reason provided. |
| Loaded CR stays coherent | Component: only replaced by a CR returned from the service; never updated optimistically; kept unchanged on a failed action; one action in flight at a time. |

## 4. Testing strategy
<!-- What you tested across the seam (backend + component/DOM) and why; what you skipped given the budget. -->

-

## 5. Assumptions
<!-- Where the rules or the seam left room for interpretation, the calls you made and why. -->

- **CR immutability on failed actions or transitions:** if an action fails due to policy violation or an illegal transition or insufficient budget, the CR remains unchanged.
- **Budget on apply:** `booked` is set to the CR's new total (`totals.newTotal`) and `balance -= delta`. A positive delta must fit in `balance` (equal is allowed); a negative delta releases budget.
- **Cr status couldn't be repeated or go back in the workflow:** approving an already-`APPROVED` CR throws `ILLEGAL_TRANSITION` rather than silently returning, or attempting to return to a previous status throws the same error.
- **Policy scope:** the last part of a policy (`_u`, `_w`, `_o`) is ignored. For example, `cr_a_u` and `cr_a_o` both let the user approve any CR in their org. This matches the existing `isApprover`/`isApplier` helpers.
- **Reject permission:** rejecting needs an approve policy (`cr_a_*`), the same as the existing backend `reject`. There is no separate reject policy.
- **Reject reason is checked first:** in `reject`, a missing or blank reason is checked before the CR lookup and the permission check (order: `VALIDATION` → `NOT_FOUND` → `FORBIDDEN` → transition). Consequences:
    - A request without a reason fails with `VALIDATION` even when the CR doesn't exist, belongs to another org, or the user has no approve policy. It's a cheap input check that runs before the repo is touched, and it reveals nothing about the CR.
    - Rejecting an already-`REJECTED` CR without a reason also fails with `VALIDATION` instead of quietly returning the CR.
- **Repeated reject is an error, not a no-op:** the scaffold's `reject` silently returned an already-`REJECTED` CR unchanged, dropping the new reason without telling the caller. It now throws `VALIDATION` ("CR … is already rejected"), so the caller (and the UI's `actionError`) learns the action didn't happen. This also matches `approve`, which throws on an already-`APPROVED` CR. I chose `VALIDATION` over the generic `TERMINAL_STATE` so the message names the exact problem. Rejecting from any other state still goes through `assertTransition`: `APPROVED`/`DRAFT`/`SUBMITTED`/`RETURNED` → `ILLEGAL_TRANSITION`, `APPLIED`/`CANCELLED` → `TERMINAL_STATE`.
- **Failed action = no change in the view:** on a failed approve/reject the UI keeps showing the last loaded CR and doesn't re-fetch it automatically. The user sees the error and can retry, or use the list to reload.
- **Disabled with a reason, not hidden:** for a user who can't act, the actions are shown disabled with an explanation instead of being removed. A missing button looks like a bug, while a disabled one with a reason tells the user the action exists and why it's off. The reason box is hidden, since typing a reason for an action you can't take is noise.
- **Permission is explained before status:** a user without an approve policy can't act on any CR, so they get the permission message even on a non-pending CR. Telling them about the status would suggest the action becomes available later.
- **"Read-only" in the UI means "no approve policy":** this covers both the `cr_r_*`-only `viewer` and `alice` (create/update, no approve), matching what the service would allow.
- **Switching user clears the selection instead of reloading it:** the new user may not be allowed to see the open CR (e.g. `bob` in `org-beta` would get `NOT_FOUND` for `CR-2`), so they start from their own list.

## 6. Where I used AI
- Used AI to assist in understanding the project structure and flow.
- Used AI to write the isReadOnlyPolicy function then inside  `CrDetailComponent` added checks in `canApprove` and `canReject` to apply changes to the UI based on the user's read-only status.
- Used AI to assist in writing the approve/apply logic in the backend service.
- Used AI for Task 3: spotting the permission gap in `canApprove`/`canReject` (non-read-only users without `cr_a_*`), writing `runAction()` for approve/reject, and adding the reject-reason check in the `cr-service`.
- Used AI for Task 4: the actions-unavailable reason, the empty-timeline state, highlighting the selected CR in the list, and clearing the selection when switching user.

## 7. What I'd improve with more time
-
