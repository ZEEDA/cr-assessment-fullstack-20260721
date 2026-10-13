import { assertTransition } from './cr-state-machine';
import { CrStatus } from './cr.enums';

/**
 * One case fails on purpose: the transition guard is too permissive. The root cause lives in
 * `assertTransition`.
 */
describe('backend state machine', () => {
	it('allows the legal DRAFT -> SUBMITTED', () => {
		expect(() => assertTransition(CrStatus.DRAFT, CrStatus.SUBMITTED)).not.toThrow();
	});

	it('rejects the illegal DRAFT -> APPROVED (approval cannot be skipped)', () => {
		expect(() => assertTransition(CrStatus.DRAFT, CrStatus.APPROVED)).toThrow(/illegal|not allowed/i);
	});

	it('rejects moving out of a terminal state', () => {
		expect(() => assertTransition(CrStatus.APPLIED, CrStatus.APPROVED)).toThrow();
	});

	it.each([
		[CrStatus.DRAFT, CrStatus.APPROVED], // skips approval
		[CrStatus.PENDING_APPROVAL, CrStatus.APPLIED], // applies before approval
		[CrStatus.APPROVED, CrStatus.REJECTED], // rejects after approval
		[CrStatus.APPROVED, CrStatus.PENDING_APPROVAL], // moves backwards
		[CrStatus.PENDING_APPROVAL, CrStatus.PENDING_APPROVAL], // repeats a status
	])('rejects %s -> %s with ILLEGAL_TRANSITION', (from, to) => {
		expect(() => assertTransition(from, to)).toThrow(expect.objectContaining({ code: 'ILLEGAL_TRANSITION' }));
	});

	it.each([CrStatus.APPLIED, CrStatus.REJECTED, CrStatus.CANCELLED])('keeps %s immutable: any move raises TERMINAL_STATE', (from) => {
		for (const to of Object.values(CrStatus)) {
			expect(() => assertTransition(from, to)).toThrow(expect.objectContaining({ code: 'TERMINAL_STATE' }));
		}
	});
});
