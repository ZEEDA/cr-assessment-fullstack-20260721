import { buildApp, T } from '../test-helpers';
import { ChangeRequest } from './cr.types';
import { CrStatus } from './cr.enums';

/** A deep copy of a stored CR, to compare against after a failed action (the repo hands out its stored object). */
const copy = (cr: ChangeRequest): ChangeRequest => JSON.parse(JSON.stringify(cr));

/** Matches a BusinessError with the given code. */
const businessError = (code: string) => expect.objectContaining({ code });

const last = <Item>(items: Item[]): Item => items[items.length - 1];

describe('CrService', () => {
	describe('approve', () => {
		it('moves a pending CR to APPROVED and records the approval and an audit entry', () => {
			const { service, users } = buildApp();

			const cr = service.approve(users.mona, 'CR-2', T);

			expect(cr.status).toBe(CrStatus.APPROVED);
			expect(cr.approvals).toEqual([{ userId: 'mona', action: 'APPROVE', at: T }]);
			expect(last(cr.audit)).toEqual({ action: 'APPROVE', byUserId: 'mona', at: T });
			expect(cr.version).toBe(2);
			expect(service.get(users.mona, 'CR-2').status).toBe(CrStatus.APPROVED); // saved to the repo
		});

		it.each(['alice', 'viewer'])('rejects %s (no approve policy) with FORBIDDEN and leaves the CR unchanged', (name) => {
			const { service, users } = buildApp();
			const before = copy(service.get(users.mona, 'CR-2'));

			expect(() => service.approve(users[name], 'CR-2', T)).toThrow(businessError('FORBIDDEN'));
			expect(service.get(users.mona, 'CR-2')).toEqual(before);
		});

		it('does not see a CR from another org (NOT_FOUND)', () => {
			const { service, users } = buildApp();

			expect(() => service.approve(users.bob, 'CR-2', T)).toThrow(businessError('NOT_FOUND'));
		});

		it('rejects the illegal DRAFT -> APPROVED with ILLEGAL_TRANSITION and leaves the CR unchanged', () => {
			const { service, users } = buildApp();
			const before = copy(service.get(users.mona, 'CR-1'));

			expect(() => service.approve(users.mona, 'CR-1', T)).toThrow(businessError('ILLEGAL_TRANSITION'));
			expect(service.get(users.mona, 'CR-1')).toEqual(before);
		});

		it('does not approve the same CR twice', () => {
			const { service, users } = buildApp();
			service.approve(users.mona, 'CR-2', T);

			expect(() => service.approve(users.mona, 'CR-2', T)).toThrow(businessError('ILLEGAL_TRANSITION'));
			expect(service.get(users.mona, 'CR-2').approvals).toHaveLength(1);
		});

		it('cannot approve a CR in a terminal state (TERMINAL_STATE)', () => {
			const { service, users } = buildApp();

			expect(() => service.approve(users.mona, 'CR-APPLIED', T)).toThrow(businessError('TERMINAL_STATE'));
		});
	});

	describe('reject', () => {
		it('moves a pending CR to REJECTED and keeps the trimmed reason on the audit entry', () => {
			const { service, users } = buildApp();

			const cr = service.reject(users.mona, 'CR-2', T, '  Over budget  ');

			expect(cr.status).toBe(CrStatus.REJECTED);
			expect(last(cr.audit)).toEqual({ action: 'REJECT', byUserId: 'mona', at: T, note: 'Over budget' });
			expect(cr.approvals).toEqual([]);
			expect(cr.version).toBe(2);
		});

		it.each(['', '   ', undefined])('requires a reason (%p) and leaves the CR unchanged', (note) => {
			const { service, users } = buildApp();
			const before = copy(service.get(users.mona, 'CR-2'));

			expect(() => service.reject(users.mona, 'CR-2', T, note)).toThrow(businessError('VALIDATION'));
			expect(service.get(users.mona, 'CR-2')).toEqual(before);
		});

		it('rejects a user without an approve policy with FORBIDDEN', () => {
			const { service, users } = buildApp();

			expect(() => service.reject(users.alice, 'CR-2', T, 'Over budget')).toThrow(businessError('FORBIDDEN'));
		});

		it('fails loudly on an already rejected CR (VALIDATION) instead of dropping the new reason', () => {
			const { service, users } = buildApp();
			service.reject(users.mona, 'CR-2', T, 'Over budget');

			expect(() => service.reject(users.mona, 'CR-2', T, 'Again')).toThrow(businessError('VALIDATION'));
			expect(service.get(users.mona, 'CR-2').audit.filter((e) => e.action === 'REJECT')).toHaveLength(1);
		});

		it('cannot reject an approved CR (ILLEGAL_TRANSITION)', () => {
			const { service, users } = buildApp();
			service.approve(users.mona, 'CR-2', T);

			expect(() => service.reject(users.mona, 'CR-2', T, 'Changed my mind')).toThrow(businessError('ILLEGAL_TRANSITION'));
		});
	});

	describe('apply (budget path)', () => {
		it('applies an approved CR: APPLIED, audited, budget booked at the new total and balance reduced by the delta', () => {
			const { service, users, budgets } = buildApp();
			service.approve(users.mona, 'CR-2', T);

			const cr = service.apply(users.mona, 'CR-2', T);

			expect(cr.status).toBe(CrStatus.APPLIED);
			expect(cr.totals).toEqual({ baselineTotal: 8000, newTotal: 8500, delta: 500 });
			expect(last(cr.audit)).toEqual({ action: 'APPLY', byUserId: 'mona', at: T });
			expect(cr.version).toBe(3);
			expect(budgets.get('BUD-1')).toMatchObject({ booked: 8500, balance: 9500 });
		});

		it('rejects a delta above the balance with INSUFFICIENT_BUDGET and changes neither the CR nor the budget', () => {
			const { service, users, agreements, budgets } = buildApp();
			agreements.set('AGR-1', { ...agreements.get('AGR-1'), budgetId: 'BUD-LOW' }); // balance 100 < delta 500
			service.approve(users.mona, 'CR-2', T);
			const before = copy(service.get(users.mona, 'CR-2'));
			const budgetBefore = { ...budgets.get('BUD-LOW') };

			expect(() => service.apply(users.mona, 'CR-2', T)).toThrow(businessError('INSUFFICIENT_BUDGET'));
			expect(service.get(users.mona, 'CR-2')).toEqual(before);
			expect(budgets.get('BUD-LOW')).toEqual(budgetBefore);
		});

		it('allows a delta equal to the balance (the balance ends at 0)', () => {
			const { service, users, budgets } = buildApp();
			budgets.set('BUD-1', { ...budgets.get('BUD-1'), balance: 500 });
			service.approve(users.mona, 'CR-2', T);

			service.apply(users.mona, 'CR-2', T);

			expect(budgets.get('BUD-1').balance).toBe(0);
		});

		it('releases budget for a negative delta', () => {
			const { service, repo, users, budgets } = buildApp();
			// An approved CR that drops SKU-A from 10 to 9 units: 8000 -> 7500.
			repo.save({
				...service.get(users.mona, 'CR-2'),
				id: 'CR-SHRINK',
				status: CrStatus.APPROVED,
				draftChanges: {
					lineItems: [
						{ sku: 'SKU-A', description: 'Widget A', quantity: 9, unitPrice: 500 },
						{ sku: 'SKU-B', description: 'Widget B', quantity: 30, unitPrice: 100 },
					],
				},
			});

			const cr = service.apply(users.mona, 'CR-SHRINK', T);

			expect(cr.totals.delta).toBe(-500);
			expect(budgets.get('BUD-1')).toMatchObject({ booked: 7500, balance: 10500 });
		});

		it('recomputes the totals from the agreement instead of trusting the stored ones', () => {
			const { service, repo, users, budgets } = buildApp();
			service.approve(users.mona, 'CR-2', T);
			repo.save({ ...service.get(users.mona, 'CR-2'), totals: { baselineTotal: 8000, newTotal: 8000, delta: 0 } }); // stale

			const cr = service.apply(users.mona, 'CR-2', T);

			expect(cr.totals).toEqual({ baselineTotal: 8000, newTotal: 8500, delta: 500 });
			expect(budgets.get('BUD-1').balance).toBe(9500);
		});

		it('requires APPROVED: a pending CR fails with ILLEGAL_TRANSITION before the budget is checked', () => {
			const { service, users, agreements, budgets } = buildApp();
			agreements.set('AGR-1', { ...agreements.get('AGR-1'), budgetId: 'BUD-LOW' }); // would also fail the budget check

			expect(() => service.apply(users.mona, 'CR-2', T)).toThrow(businessError('ILLEGAL_TRANSITION'));
			expect(budgets.get('BUD-LOW').balance).toBe(100);
		});

		it('is terminal: a second apply fails with TERMINAL_STATE and the budget is consumed once', () => {
			const { service, users, budgets } = buildApp();
			service.approve(users.mona, 'CR-2', T);
			service.apply(users.mona, 'CR-2', T);

			expect(() => service.apply(users.mona, 'CR-2', T)).toThrow(businessError('TERMINAL_STATE'));
			expect(budgets.get('BUD-1').balance).toBe(9500);
		});

		it.each(['alice', 'viewer'])('rejects %s (no apply policy) with FORBIDDEN and leaves the budget unchanged', (name) => {
			const { service, users, budgets } = buildApp();
			service.approve(users.mona, 'CR-2', T);

			expect(() => service.apply(users[name], 'CR-2', T)).toThrow(businessError('FORBIDDEN'));
			expect(service.get(users.mona, 'CR-2').status).toBe(CrStatus.APPROVED);
			expect(budgets.get('BUD-1').balance).toBe(10000);
		});
	});

	it('audits every action of the full lifecycle, in order', () => {
		const { service, users } = buildApp();

		service.submit(users.alice, 'CR-1', T);
		service.sendForApproval(users.alice, 'CR-1', T);
		service.approve(users.mona, 'CR-1', T);
		const cr = service.apply(users.mona, 'CR-1', T);

		expect(cr.status).toBe(CrStatus.APPLIED);
		expect(cr.audit.map((e) => `${e.action} by ${e.byUserId}`)).toEqual([
			'SUBMIT by alice',
			'SEND_FOR_APPROVAL by alice',
			'APPROVE by mona',
			'APPLY by mona',
		]);
		expect(cr.version).toBe(5);
	});
});
